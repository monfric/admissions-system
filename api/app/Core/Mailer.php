<?php
declare(strict_types=1);

namespace App\Core;

use PHPMailer\PHPMailer\PHPMailer;

/**
 * Sends one email using the 'mail' settings in config.php: over SMTP
 * (PHPMailer), or with driver 'log' written to storage/logs/mail.log.
 * Throws on failure; callers go through EmailQueue, which retries.
 */
final class Mailer
{
    public static function send(string $toEmail, string $toName, string $subject, string $html, string $text): void
    {
        if (Config::get('mail.driver', 'log') === 'log') {
            self::log($toEmail, $subject, $text);
            return;
        }
        if ((string) Config::get('mail.password', '') === '') {
            throw new \RuntimeException('mail.password is not set in app/config.php');
        }

        $lib = dirname(__DIR__) . '/Lib/PHPMailer';
        require_once $lib . '/Exception.php';
        require_once $lib . '/PHPMailer.php';
        require_once $lib . '/SMTP.php';

        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host = (string) Config::get('mail.host');
        $mail->Port = (int) Config::get('mail.port', 587);
        $mail->SMTPAuth = true;
        $mail->Username = (string) Config::get('mail.username');
        $mail->Password = (string) Config::get('mail.password');
        $mail->SMTPSecure = Config::get('mail.encryption', 'tls') === 'ssl' ? PHPMailer::ENCRYPTION_SMTPS : PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Timeout = 20;
        $mail->CharSet = PHPMailer::CHARSET_UTF8;

        $mail->setFrom((string) Config::get('mail.from_email'), (string) Config::get('mail.from_name', Config::get('app_name')));
        $replyTo = (string) Config::get('mail.reply_to', '');
        if ($replyTo !== '') {
            $mail->addReplyTo($replyTo);
        }
        $mail->addAddress($toEmail, $toName);
        $mail->Subject = $subject;
        $mail->isHTML(true);
        $mail->Body = $html;
        $mail->AltBody = $text;
        $mail->send();
    }

    private static function log(string $toEmail, string $subject, string $text): void
    {
        $dir = Config::storagePath('logs');
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $entry = sprintf("[%s] To: %s\nSubject: %s\n\n%s\n%s\n", date('Y-m-d H:i:s'), $toEmail, $subject, $text, str_repeat('-', 72));
        file_put_contents($dir . '/mail.log', $entry, FILE_APPEND);
    }
}
