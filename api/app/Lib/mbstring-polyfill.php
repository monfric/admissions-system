<?php
declare(strict_types=1);

// The few mbstring functions tFPDF uses, for PHP installs without the
// mbstring extension (cPanel normally has it; then this file does nothing).
// Implemented with iconv, which is part of standard PHP builds.

if (!function_exists('mb_strlen')) {
    function mb_strlen(string $string, ?string $encoding = null): int
    {
        return (int) iconv_strlen($string, 'UTF-8');
    }
}

if (!function_exists('mb_substr')) {
    function mb_substr(string $string, int $start, ?int $length = null, ?string $encoding = null): string
    {
        $total = (int) iconv_strlen($string, 'UTF-8');
        if ($start < 0) {
            $start = max(0, $total + $start);
        }
        $length ??= $total - $start;
        if ($length < 0) {
            $length = max(0, $total - $start + $length);
        }
        return (string) iconv_substr($string, $start, $length, 'UTF-8');
    }
}

if (!function_exists('mb_convert_encoding')) {
    function mb_convert_encoding(string $string, string $to, ?string $from = null): string
    {
        return (string) iconv($from ?? 'UTF-8', $to, $string);
    }
}
