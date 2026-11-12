<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Request validation, like the Go backend's binding tags. Rules are
 * "|"-separated: required, email, string, int, number, bool, min:n, max:n
 * (characters for text, value for numbers), oneof:a,b,c, date.
 *
 * Fields that are missing or null skip every rule except "required".
 */
final class Validator
{
    /** Returns the data; throws 400 "Invalid request data" listing every problem. */
    public static function validate(array $data, array $rules): array
    {
        $errors = [];
        foreach ($rules as $field => $ruleString) {
            $value = $data[$field] ?? null;
            $ruleList = explode('|', $ruleString);
            $present = !($value === null || (is_string($value) && trim($value) === ''));

            if (in_array('required', $ruleList, true) && !$present) {
                $errors[] = "$field is required";
                continue;
            }
            if ($value === null || ($value === '' && !in_array('required', $ruleList, true))) {
                continue;
            }

            $isNumeric = in_array('int', $ruleList, true) || in_array('number', $ruleList, true);
            foreach ($ruleList as $rule) {
                [$name, $arg] = array_pad(explode(':', $rule, 2), 2, null);
                $error = self::check($field, $value, $name, $arg, $isNumeric);
                if ($error !== null) {
                    $errors[] = $error;
                    break;
                }
            }
        }
        if ($errors) {
            throw HttpException::badRequest('Invalid request data', implode('; ', $errors));
        }
        return $data;
    }

    private static function check(string $field, mixed $value, string $name, ?string $arg, bool $isNumeric): ?string
    {
        switch ($name) {
            case 'required':
                return null;
            case 'string':
                return is_string($value) ? null : "$field must be text";
            case 'email':
                return (is_string($value) && filter_var($value, FILTER_VALIDATE_EMAIL)) ? null : "$field must be a valid email address";
            case 'int':
                return (is_int($value) || (is_string($value) && preg_match('/^-?\d+$/', $value))) ? null : "$field must be a whole number";
            case 'number':
                return is_numeric($value) ? null : "$field must be a number";
            case 'bool':
                return is_bool($value) ? null : "$field must be true or false";
            case 'date':
                return (is_string($value) && strtotime($value) !== false) ? null : "$field must be a valid date";
            case 'min':
                if ($isNumeric) {
                    return (is_numeric($value) && $value >= (float) $arg) ? null : "$field must be at least $arg";
                }
                return self::length($value) >= (int) $arg ? null : "$field must be at least $arg characters";
            case 'max':
                if ($isNumeric) {
                    return (is_numeric($value) && $value <= (float) $arg) ? null : "$field must be at most $arg";
                }
                return self::length($value) <= (int) $arg ? null : "$field must be at most $arg characters";
            case 'oneof':
                return in_array((string) $value, explode(',', (string) $arg), true) ? null : "$field must be one of: " . str_replace(',', ', ', (string) $arg);
        }
        return null;
    }

    /** Length in characters (UTF-8 aware without mbstring). */
    public static function length(mixed $value): int
    {
        return is_string($value) ? (int) preg_match_all('/./us', $value) : 0;
    }

    /** Fails with "<Label> must contain numbers only" (as in the Go backend) for any non-digit. */
    public static function digitsOnly(array $labelledValues): void
    {
        foreach ($labelledValues as $label => $value) {
            $value = trim((string) $value);
            if ($value !== '' && !ctype_digit($value)) {
                throw HttpException::badRequest("$label must contain numbers only");
            }
        }
    }
}
