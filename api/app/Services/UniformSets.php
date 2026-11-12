<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\HttpException;

/**
 * The uniform measurement forms (from the paper "Students Uniform Measurement
 * Collection Tool"), validation of a submission, and the response shape.
 * All values are in inches.
 */
final class UniformSets
{
    public const MIN_INCHES = 1.0;
    public const MAX_INCHES = 99.0;

    /** Every measurement column, so a submission can clear the other set's fields. */
    public const ALL_FIELDS = [
        'shirt_full_length', 'shirt_chest', 'shirt_shoulder', 'shirt_sleeve_length', 'shirt_round_sleeve',
        'blouse_full_length', 'blouse_bust', 'blouse_waist_length', 'blouse_waist', 'blouse_hips', 'blouse_sleeve_length',
        'trouser_full_length', 'trouser_seat', 'trouser_waist', 'trouser_hips', 'trouser_thighs', 'trouser_bottom',
        'lab_coat_full_length', 'lab_coat_shoulder_sleeve', 'lab_coat_chest', 'lab_coat_round_sleeve',
        'apron_full_length', 'apron_shoulders', 'apron_chest', 'apron_round_sleeve',
    ];

    public static function all(): array
    {
        $f = fn (string $key, string $label) => ['key' => $key, 'label' => $label];
        return [
            [
                'key' => 'gents', 'label' => 'Gents',
                'garments' => [
                    ['name' => 'Shirt', 'fields' => [
                        $f('shirt_full_length', 'Full Length'), $f('shirt_chest', 'Chest'), $f('shirt_shoulder', 'Shoulder'),
                        $f('shirt_sleeve_length', 'Sleeve Length'), $f('shirt_round_sleeve', 'Round Sleeve'),
                    ]],
                    ['name' => 'Trouser', 'fields' => [
                        $f('trouser_full_length', 'Full Length'), $f('trouser_seat', 'Seat'), $f('trouser_waist', 'Waist'),
                        $f('trouser_bottom', 'Bottom'), $f('trouser_thighs', 'Thighs'),
                    ]],
                    ['name' => 'Lab Coat', 'fields' => [
                        $f('lab_coat_full_length', 'Full Length'), $f('lab_coat_shoulder_sleeve', 'Shoulders – Long Sleeve'),
                        $f('lab_coat_chest', 'Chest Circumference'), $f('lab_coat_round_sleeve', 'Round Sleeve'),
                    ]],
                ],
            ],
            [
                'key' => 'ladies', 'label' => 'Ladies',
                'garments' => [
                    ['name' => 'Blouse', 'fields' => [
                        $f('blouse_full_length', 'Full Length'), $f('blouse_bust', 'Bust Circumference'),
                        $f('blouse_waist_length', 'Waist Length'), $f('blouse_waist', 'Waist Circumference'),
                        $f('blouse_hips', 'Hips Circumference'), $f('blouse_sleeve_length', 'Sleeve Length'),
                    ]],
                    ['name' => 'Trouser', 'fields' => [
                        $f('trouser_full_length', 'Full Length'), $f('trouser_waist', 'Waist Circumference'),
                        $f('trouser_hips', 'Hips Circumference'), $f('trouser_thighs', 'Thighs'), $f('trouser_bottom', 'Bottom'),
                    ]],
                    ['name' => 'Apron', 'fields' => [
                        $f('apron_full_length', 'Full Length'), $f('apron_shoulders', 'Shoulders Long'),
                        $f('apron_chest', 'Chest Circumference'), $f('apron_round_sleeve', 'Round Sleeve'),
                    ]],
                ],
            ],
        ];
    }

    public static function find(string $key): ?array
    {
        foreach (self::all() as $set) {
            if ($set['key'] === $key) {
                return $set;
            }
        }
        return null;
    }

    /** The form a student may fill from their gender; anyone else picks either. */
    public static function allowedFor(string $gender): array
    {
        return match ($gender) {
            'Male'   => ['gents'],
            'Female' => ['ladies'],
            default  => ['gents', 'ladies'],
        };
    }

    /**
     * Validates a submission and returns the columns to save: every field of
     * the chosen set (1–99 inches, rounded to 2 decimals), the others NULL.
     */
    public static function submissionColumns(array $req, string $gender): array
    {
        $set = self::find((string) ($req['uniform_set'] ?? ''));
        if ($set === null || !in_array($set['key'], self::allowedFor($gender), true)) {
            throw HttpException::badRequest('please fill in the uniform form that matches your gender');
        }
        if (empty($req['tailor_confirmed'])) {
            throw HttpException::badRequest('please confirm that the measurements were taken by a qualified tailor');
        }
        $values = $req['measurements'];
        $inSet = [];
        foreach ($set['garments'] as $garment) {
            foreach ($garment['fields'] as $field) {
                $inSet[$field['key']] = true;
                if (!array_key_exists($field['key'], $values)) {
                    throw HttpException::badRequest("{$garment['name']} – {$field['label']} is required");
                }
                $v = $values[$field['key']];
                if ((!is_int($v) && !is_float($v)) || $v < self::MIN_INCHES || $v > self::MAX_INCHES) {
                    throw HttpException::badRequest(sprintf('%s – %s must be between %.0f and %.0f inches', $garment['name'], $field['label'], self::MIN_INCHES, self::MAX_INCHES));
                }
            }
        }
        foreach (array_keys($values) as $key) {
            if (!isset($inSet[$key])) {
                throw HttpException::badRequest(sprintf('unknown measurement "%s"', $key));
            }
        }

        $columns = [];
        foreach (self::ALL_FIELDS as $key) {
            $columns[$key] = isset($inSet[$key]) ? round((float) $values[$key], 2) : null;
        }
        return $columns + [
            'uniform_set'      => $set['key'],
            'tailor_confirmed' => 1,
            'status'           => 'submitted',
            'submitted_at'     => date('Y-m-d H:i:s'),
        ];
    }

    /** A saved form as the API returns it (only the chosen set's values). */
    public static function response(?array $m): ?array
    {
        if ($m === null) {
            return null;
        }
        $values = [];
        foreach (self::ALL_FIELDS as $key) {
            if ($m[$key] !== null) {
                $values[$key] = (float) $m[$key];
            }
        }
        $response = [
            'id'               => (int) $m['id'],
            'admission_id'     => (int) $m['admission_id'],
            'uniform_set'      => $m['uniform_set'],
            'status'           => $m['status'],
            'tailor_confirmed' => (bool) (int) $m['tailor_confirmed'],
            'submitted_at'     => date('Y-m-d H:i:s', strtotime($m['submitted_at'])),
            'values'           => (object) $values,
        ];
        if ($m['unlocked_at']) {
            $response['unlocked_at'] = date('Y-m-d H:i:s', strtotime($m['unlocked_at']));
        }
        return $response;
    }
}
