<?php
declare(strict_types=1);

namespace App\Mpesa;

use App\Core\Config;
use RuntimeException;

/** The configured M-Pesa driver, phone rules and result codes. */
final class Mpesa
{
    private static ?MpesaDriver $driver = null;

    public static function driver(): MpesaDriver
    {
        return self::$driver ??= match ((string) Config::get('mpesa.driver')) {
            'mock'                  => new MockDriver(),
            'sandbox', 'production' => new DarajaDriver(),
            default                 => throw new RuntimeException('Unknown mpesa.driver (use mock, sandbox or production)'),
        };
    }

    /**
     * A Kenyan mobile number as M-Pesa wants it (2547XXXXXXXX / 2541XXXXXXXX),
     * from 07…, 01…, 7…, +254… or 254…; null if it isn't one.
     */
    public static function normalisePhone(string $phone): ?string
    {
        $digits = preg_replace('/[\s\-()]/', '', $phone) ?? '';
        if (preg_match('/^(?:\+?254|0)?([17]\d{8})$/', $digits, $m)) {
            return '254' . $m[1];
        }
        return null;
    }

    /** 2547****5678, for logs and lists. */
    public static function maskPhone(string $phone): string
    {
        return strlen($phone) >= 12 ? substr($phone, 0, 4) . '****' . substr($phone, -4) : $phone;
    }

    /** The gateway status for a final M-Pesa ResultCode. */
    public static function statusFor(int $resultCode): string
    {
        return match ($resultCode) {
            0          => 'success',
            1032       => 'cancelled',  // customer pressed Cancel
            1037, 1019 => 'timeout',    // phone unreachable / prompt expired before PIN
            default    => 'failed',     // 1 insufficient funds, 2001 wrong PIN, …
        };
    }

    /** A message an applicant can understand, for a final ResultCode. */
    public static function friendlyResult(int $resultCode, string $desc): string
    {
        return match ($resultCode) {
            0       => 'Payment received.',
            1032    => 'You cancelled the M-Pesa prompt.',
            1037    => 'Your phone could not be reached. Check it is on and has network, then try again.',
            1019    => 'The M-Pesa prompt expired before you entered your PIN.',
            1       => 'Your M-Pesa balance is not enough for this payment.',
            2001    => 'The M-Pesa PIN entered was wrong.',
            1001    => 'Another M-Pesa transaction is in progress on your phone. Wait a moment and try again.',
            default => $desc !== '' ? $desc : 'The payment did not go through.',
        };
    }
}
