<?php
declare(strict_types=1);

namespace App\Core;

/** Plain-text logs in storage/logs (never write secrets here). */
final class Log
{
    public static function write(string $channel, string $message, array $context = []): void
    {
        $dir = Config::storagePath('logs');
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        $line = '[' . date('Y-m-d H:i:s') . '] ' . $message;
        if ($context) {
            $line .= ' ' . json_encode($context, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        }
        @file_put_contents($dir . '/' . $channel . '.log', $line . "\n", FILE_APPEND | LOCK_EX);
    }
}
