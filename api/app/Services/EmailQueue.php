<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Database;
use App\Core\Format;
use App\Core\HttpException;
use App\Core\Mailer;
use App\Core\Pagination;

/**
 * Outgoing emails. push() only stores the email (it never throws, so an email
 * problem can't break the action that caused it); cron/emails.php calls
 * sendDue() every minute, which sends and retries.
 */
final class EmailQueue
{
    public const MAX_ATTEMPTS = 5;
    /** Emails carrying a one-time link: their bodies are cleared once sent. */
    public const SECRET_TEMPLATES = ['password_reset', 'staff_welcome'];

    /** @param array{subject: string, html: string, text: string} $email */
    public static function push(string $toEmail, string $toName, string $template, array $email, ?string $dedupeKey = null): void
    {
        try {
            Database::insert('email_queue', [
                'to_email'   => $toEmail,
                'to_name'    => $toName,
                'template'   => $template,
                'subject'    => $email['subject'],
                'html_body'  => $email['html'],
                'text_body'  => $email['text'],
                'dedupe_key' => $dedupeKey,
                'status'     => 'pending',
                'send_after' => Database::now(),
            ]);
        } catch (\PDOException $e) {
            // A dedupe_key that's already queued means this email went out before.
            if ($dedupeKey === null || $e->getCode() !== '23000') {
                self::logError("queue $template to $toEmail: " . $e->getMessage());
            }
        } catch (\Throwable $e) {
            self::logError("queue $template to $toEmail: " . $e->getMessage());
        }
    }

    /** Sends emails that are due; returns [sent, failed]. */
    public function sendDue(int $limit = 50): array
    {
        $rows = Database::all(
            "SELECT * FROM email_queue WHERE status = 'pending' AND send_after <= ? AND deleted_at IS NULL ORDER BY id LIMIT $limit",
            [Database::now()]
        );
        $sent = $failed = 0;
        foreach ($rows as $row) {
            $attempts = (int) $row['attempts'] + 1;
            try {
                Mailer::send($row['to_email'], $row['to_name'], $row['subject'], $row['html_body'], $row['text_body']);
                $data = ['status' => 'sent', 'attempts' => $attempts, 'sent_at' => Database::now(), 'last_error' => ''];
                if (in_array($row['template'], self::SECRET_TEMPLATES, true)) {
                    $data['html_body'] = $data['text_body'] = '(removed after sending: it contained a one-time link)';
                }
                Database::update('email_queue', (int) $row['id'], $data);
                $sent++;
            } catch (\Throwable $e) {
                // Retry after 5, 20, 45, 80 minutes, then give up (staff can resend).
                $data = ['attempts' => $attempts, 'last_error' => mb_substr($e->getMessage(), 0, 500)];
                if ($attempts >= self::MAX_ATTEMPTS) {
                    $data['status'] = 'failed';
                } else {
                    $data['send_after'] = date('Y-m-d H:i:s', time() + 300 * $attempts * $attempts);
                }
                Database::update('email_queue', (int) $row['id'], $data);
                $failed++;
            }
        }
        return [$sent, $failed];
    }

    // ── Email Log page (admins) ──────────────────────────────────────────────

    public function list(Pagination $page, string $status): array
    {
        $where = 'deleted_at IS NULL';
        $params = [];
        if ($status !== '') {
            $where .= ' AND status = ?';
            $params[] = $status;
        }
        if ($page->search !== '') {
            $where .= ' AND (LOWER(to_email) LIKE ? OR LOWER(to_name) LIKE ? OR LOWER(subject) LIKE ?)';
            $like = '%' . strtolower($page->search) . '%';
            array_push($params, $like, $like, $like);
        }
        $total = (int) Database::value("SELECT COUNT(*) FROM email_queue WHERE $where", $params);
        $rows = Database::all(
            "SELECT id, to_email, to_name, template, subject, status, attempts, last_error, send_after, sent_at, created_at
               FROM email_queue WHERE $where ORDER BY id DESC " . $page->limitSql(),
            $params
        );
        return $page->result(array_map([self::class, 'item'], $rows), $total);
    }

    public function stats(): array
    {
        $row = Database::one(
            "SELECT COUNT(*) AS total,
                    COALESCE(SUM(status = 'sent'), 0) AS sent,
                    COALESCE(SUM(status = 'pending'), 0) AS pending,
                    COALESCE(SUM(status = 'failed'), 0) AS failed,
                    COALESCE(SUM(status = 'sent' AND sent_at >= ?), 0) AS sent_today
               FROM email_queue WHERE deleted_at IS NULL",
            [date('Y-m-d 00:00:00')]
        );
        $stats = array_map('intval', $row);
        $stats['driver'] = (string) Config::get('mail.driver', 'log');
        return $stats;
    }

    public function get(int $id): array
    {
        $row = Database::one('SELECT * FROM email_queue WHERE id = ? AND deleted_at IS NULL', [$id]);
        if ($row === null) {
            throw HttpException::notFound('email not found');
        }
        return self::item($row) + ['html_body' => $row['html_body'], 'text_body' => $row['text_body']];
    }

    /** Puts an email back in the queue for the next cron run. */
    public function resend(int $id): array
    {
        $row = Database::one('SELECT * FROM email_queue WHERE id = ? AND deleted_at IS NULL', [$id]);
        if ($row === null) {
            throw HttpException::notFound('email not found');
        }
        if (in_array($row['template'], self::SECRET_TEMPLATES, true)) {
            throw HttpException::badRequest('this email held a one-time link and can\'t be resent: ask the person to use "Forgot password?" instead');
        }
        if ($row['status'] === 'pending') {
            throw HttpException::badRequest('this email is already waiting to be sent');
        }
        Database::update('email_queue', $id, ['status' => 'pending', 'attempts' => 0, 'last_error' => '', 'send_after' => Database::now()]);
        return $this->get($id);
    }

    private static function item(array $r): array
    {
        return [
            'id'         => (int) $r['id'],
            'to_email'   => $r['to_email'],
            'to_name'    => $r['to_name'],
            'template'   => $r['template'],
            'subject'    => $r['subject'],
            'status'     => $r['status'],
            'attempts'   => (int) $r['attempts'],
            'last_error' => $r['last_error'],
            'send_after' => Format::iso($r['send_after']),
            'sent_at'    => Format::iso($r['sent_at']),
            'created_at' => Format::iso($r['created_at']),
        ];
    }

    private static function logError(string $message): void
    {
        $dir = Config::storagePath('logs');
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        @error_log(sprintf("[%s] email: %s\n", date('Y-m-d H:i:s'), $message), 3, $dir . '/error.log');
    }
}
