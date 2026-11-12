<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;

/**
 * The wording of every email, each as ['subject', 'html', 'text']. One shared
 * layout (logo, colours, button, footer); every value is HTML-escaped here.
 */
final class EmailTemplates
{
    private const NAVY = '#003361';
    private const RED = '#b3021c';

    // ── Applicant portal ─────────────────────────────────────────────────────

    public static function applicantWelcome(string $name): array
    {
        return self::render('Welcome to the NMTC Applicant Portal', $name, [
            'Your applicant account has been created.',
            'Next, log in and complete your profile (personal details, education and documents). Once your profile is submitted you can apply for a programme.',
        ], 'Complete my profile', self::portal('/applicant/login'));
    }

    public static function profileSubmitted(string $name): array
    {
        return self::render('Your profile has been submitted', $name, [
            'Thank you: your applicant profile is complete and has been submitted.',
            'You can now apply for a programme in an open intake.',
        ], 'Apply now', self::portal('/applicant/login'));
    }

    /** @param string[] $programmes in order of choice */
    public static function applicationSubmitted(string $name, string $number, string $intake, string $level, array $programmes, float $fee): array
    {
        $choices = [];
        foreach (array_values($programmes) as $i => $programme) {
            $choices[] = ($i === 0 ? '1st choice' : '2nd choice') . ': ' . $programme;
        }
        $paragraphs = ['We have received your application. Please keep your application number for reference.'];
        $paragraphs[] = self::details([
            'Application number' => $number,
            'Intake'             => $intake,
            'Training level'     => $level,
            'Programme(s)'       => implode("\n", $choices),
            'Application fee'    => 'KES ' . number_format($fee),
        ]);
        $paragraphs[] = $fee > 0
            ? "Next step: pay the application fee of KES " . number_format($fee) . ", quoting your application number $number. Your application is reviewed once the payment has been confirmed."
            : 'Your application will now be reviewed by the admissions office.';
        return self::render("Application received: $number", $name, $paragraphs, 'View my application', self::portal('/applicant/login'));
    }

    public static function notified(string $name, string $number, string $programme, string $deadline): array
    {
        return self::render("Provisional offer: $programme", $name, [
            "Congratulations! You have been offered a provisional place for <strong>" . self::e($programme) . '</strong> (application ' . self::e($number) . ').',
            'Log in to view and download your provisional offer letter and the documents for your programme.',
            'This offer is valid until <strong>' . self::e($deadline) . '</strong>. If it is not confirmed by then, it will be withdrawn automatically.',
        ], 'View my offer', self::portal('/applicant/login'), true);
    }

    public static function deadlineReminder(string $name, string $number, string $programme, int $daysLeft, string $deadline): array
    {
        $when = $daysLeft <= 0 ? 'Today is the last day' : "Only $daysLeft day" . ($daysLeft === 1 ? '' : 's') . ' left';
        return self::render("Reminder: your offer expires " . ($daysLeft <= 0 ? 'today' : "in $daysLeft day" . ($daysLeft === 1 ? '' : 's')), $name, [
            "<strong>$when</strong> on your provisional offer for <strong>" . self::e($programme) . '</strong> (application ' . self::e($number) . ').',
            'The offer is withdrawn automatically after <strong>' . self::e($deadline) . '</strong>. Please complete the remaining steps before then, or contact the admissions office if you need help.',
        ], 'View my offer', self::portal('/applicant/login'), true);
    }

    public static function recalled(string $name, string $number, string $programme): array
    {
        return self::render('Your provisional offer has expired', $name, [
            'Your provisional offer for <strong>' . self::e($programme) . '</strong> (application ' . self::e($number) . ') was not confirmed within the time allowed and has been withdrawn.',
            'If you believe this is a mistake or would still like to join, please contact the admissions office as soon as possible.',
        ], 'Go to the portal', self::portal('/applicant/login'), true);
    }

    public static function rejected(string $name, string $number, string $remarks): array
    {
        $paragraphs = [
            'Thank you for applying to NMTC. After review, we are unable to offer you a place on this occasion (application ' . self::e($number) . ').',
        ];
        if (trim($remarks) !== '') {
            $paragraphs[] = self::details(['Remarks' => $remarks]);
        }
        $paragraphs[] = 'You are welcome to apply again in a future intake.';
        return self::render('Update on your application', $name, $paragraphs, 'Go to the portal', self::portal('/applicant/login'), true);
    }

    public static function admitted(string $name, string $admissionNumber, string $programme, string $intake): array
    {
        return self::render('Congratulations: you have been admitted', $name, [
            'We are pleased to confirm your admission to <strong>' . self::e($programme) . '</strong>.',
            self::details(['Admission number' => $admissionNumber, 'Programme' => $programme, 'Intake' => $intake]),
            'Next steps: log in to fill in your uniform measurements. Your admission letter and joining documents become available to download once the form is submitted.',
        ], 'Open my admission', self::portal('/applicant/login'), true);
    }

    public static function uniformUnlocked(string $name, string $admissionNumber): array
    {
        return self::render('Please update your uniform measurements', $name, [
            'The admissions office has reopened your uniform measurement form (admission ' . self::e($admissionNumber) . ') so that you can correct it.',
            'Please log in, check your measurements and submit the form again.',
        ], 'Update my measurements', self::portal('/applicant/login'), true);
    }

    // ── Accounts ─────────────────────────────────────────────────────────────

    public static function staffWelcome(string $name, string $email, string $setPasswordUrl, int $hours): array
    {
        return self::render('Your NMTC Staff Portal account', $name, [
            'A staff account has been created for you on the NMTC Admissions Staff Portal.',
            self::details(['Login email' => $email, 'Website' => (string) Config::get('staff_url')]),
            "Use the button below to choose your own password. The link works once and expires in $hours hours; after that, use \"Forgot password?\" on the login page.",
        ], 'Set my password', $setPasswordUrl);
    }

    public static function passwordReset(string $name, string $resetUrl, int $minutes): array
    {
        return self::render('Reset your password', $name, [
            'We received a request to reset the password for your account.',
            "Use the button below to choose a new password. The link works once and expires in $minutes minutes.",
            'If you did not ask for this, you can ignore this email: your password stays the same.',
        ], 'Reset my password', $resetUrl);
    }

    // ── Layout ───────────────────────────────────────────────────────────────

    public static function portal(string $route): string
    {
        return rtrim((string) Config::get('portal_url'), '/') . '/#' . $route;
    }

    public static function staff(string $route): string
    {
        return rtrim((string) Config::get('staff_url'), '/') . '/#' . $route;
    }

    /**
     * @param string[] $paragraphs HTML (already escaped), or a details() table
     * @param bool $contact add "Questions? Reply to this email…" before the sign-off
     */
    private static function render(string $subject, string $name, array $paragraphs, string $button, string $url, bool $contact = false): array
    {
        $greeting = 'Dear ' . trim($name) . ',';
        $logo = rtrim((string) Config::get('portal_url'), '/') . '/assets/dist/img/logo.png';
        $body = '';
        $text = $greeting . "\n\n";
        foreach ($paragraphs as $p) {
            if (str_starts_with($p, '<table')) {
                $body .= $p;
                $text .= self::detailsText($p) . "\n\n";
            } else {
                $body .= '<p style="margin:0 0 16px;line-height:1.55;">' . $p . '</p>';
                $text .= html_entity_decode(strip_tags($p), ENT_QUOTES, 'UTF-8') . "\n\n";
            }
        }
        $text .= "$button: $url\n\n";
        if ($contact) {
            $body .= '<p style="margin:0 0 16px;line-height:1.55;">Questions? Reply to this email or contact the admissions office.</p>';
            $text .= "Questions? Reply to this email or contact the admissions office.\n\n";
        }
        $text .= "Regards,\nNMTC Admissions Office";

        $html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . self::e($subject) . '</title></head>'
            . '<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;"><tr><td align="center">'
            . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">'
            . '<tr><td style="background:' . self::NAVY . ';padding:20px 24px;text-align:center;">'
            . '<img src="' . self::e($logo) . '" alt="NMTC" width="56" height="56" style="display:inline-block;border-radius:50%;background:#fff;">'
            . '<div style="color:#ffffff;font-size:18px;font-weight:bold;margin-top:8px;">NMTC Admissions</div></td></tr>'
            . '<tr><td style="padding:28px 24px 8px;font-size:15px;">'
            . '<h1 style="font-size:20px;color:' . self::NAVY . ';margin:0 0 18px;">' . self::e($subject) . '</h1>'
            . '<p style="margin:0 0 16px;">' . self::e($greeting) . '</p>' . $body
            . '<p style="margin:24px 0;text-align:center;"><a href="' . self::e($url) . '" style="display:inline-block;background:' . self::NAVY . ';color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 26px;border-radius:6px;">' . self::e($button) . '</a></p>'
            . '<p style="margin:0 0 20px;font-size:12px;color:#6b7280;line-height:1.5;">If the button doesn\'t work, copy this link into your browser:<br><a href="' . self::e($url) . '" style="color:' . self::NAVY . ';word-break:break-all;">' . self::e($url) . '</a></p>'
            . '<p style="margin:0 0 24px;">Regards,<br><strong>NMTC Admissions Office</strong></p>'
            . '</td></tr>'
            . '<tr><td style="border-top:3px solid ' . self::RED . ';padding:14px 24px;font-size:12px;color:#6b7280;text-align:center;">'
            . 'This is an automated message from the NMTC Admissions System.</td></tr>'
            . '</table></td></tr></table></body></html>';

        return ['subject' => $subject, 'html' => $html, 'text' => $text];
    }

    /** A two-column label/value table (values may contain line breaks). */
    private static function details(array $rows): string
    {
        $html = '<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;">';
        foreach ($rows as $label => $value) {
            $html .= '<tr><td data-label="' . self::e((string) $label) . '" style="padding:8px 12px;color:#6b7280;width:40%;vertical-align:top;border-bottom:1px solid #f1f3f5;">' . self::e((string) $label) . '</td>'
                . '<td data-value="' . self::e((string) $value) . '" style="padding:8px 12px;font-weight:bold;vertical-align:top;border-bottom:1px solid #f1f3f5;">' . nl2br(self::e((string) $value)) . '</td></tr>';
        }
        return $html . '</table>';
    }

    /** The plain-text version of a details() table, read back from its data attributes. */
    private static function detailsText(string $table): string
    {
        preg_match_all('/data-label="([^"]*)".*?data-value="([^"]*)"/s', $table, $m, PREG_SET_ORDER);
        return implode("\n", array_map(
            fn ($row) => html_entity_decode($row[1], ENT_QUOTES, 'UTF-8') . ': ' . str_replace("\n", "\n  ", html_entity_decode($row[2], ENT_QUOTES, 'UTF-8')),
            $m
        ));
    }

    private static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }
}
