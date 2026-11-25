<?php
declare(strict_types=1);

namespace App\Core;

/** Text helpers that don't need the mbstring extension. */
final class Text
{
    /** The first $max characters (UTF-8 safe). */
    public static function cut(string $value, int $max): string
    {
        return preg_match('/^.{0,' . $max . '}/us', $value, $m) ? $m[0] : substr($value, 0, $max);
    }
}
