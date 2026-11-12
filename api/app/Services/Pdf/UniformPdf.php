<?php
declare(strict_types=1);

namespace App\Services\Pdf;

use App\Services\UniformSets;

/**
 * The uniform measurement form as a PDF: letterhead and footer, the student's
 * details, then one table per garment of their set with each value in inches.
 */
final class UniformPdf
{
    private const ROW_H = 17.0;
    private const TABLE_FONT = 10.0;
    private const VALUE_COL_W = 130.0;
    private const TABLE_GAP = 10.0;

    /**
     * @param array{name: string, admission_number: string, class: string} $student
     * @param array $form a uniform_measurements row
     */
    public static function generate(array $student, array $form): string
    {
        $set = UniformSets::find((string) $form['uniform_set']);
        if ($set === null) {
            throw new \RuntimeException("unknown uniform set {$form['uniform_set']}");
        }
        $doc = new PdfDocument();
        $pdf = $doc->pdf;
        $pdf->SetTitle('Uniform Measurements', true);
        $doc->newPage();
        $bold = ['bold' => true];

        $title = 'STUDENTS UNIFORM MEASUREMENT FORM';
        $titleStyle = ['bold' => true, 'underline' => true];
        $doc->drawRun((PdfDocument::PAGE_W - $doc->measure($title, $titleStyle)) / 2, $title, $titleStyle);
        $doc->y += PdfDocument::LINE_HEIGHT + 14;

        $valueX = PdfDocument::MARGIN_LEFT + 100;
        foreach ([
            ['Name:', $student['name']],
            ['Admission No:', $student['admission_number']],
            ['Class:', $student['class']],
            ['Uniform:', $set['label'] . ' (all measurements in inches)'],
        ] as [$label, $value]) {
            $doc->drawLabelRow($label, $value, $valueX);
            $doc->y += PdfDocument::LINE_HEIGHT + 6;
        }
        $doc->y += 6;

        $tableW = PdfDocument::MARGIN_RIGHT - PdfDocument::MARGIN_LEFT;
        $valueColX = PdfDocument::MARGIN_RIGHT - self::VALUE_COL_W;
        foreach ($set['garments'] as $garment) {
            $doc->ensure(self::ROW_H * (count($garment['fields']) + 1));

            // Header row: garment name and the unit column.
            $pdf->SetDrawColor(0, 0, 0);
            $pdf->SetLineWidth(0.6);
            $pdf->SetFillColor(229, 231, 235);
            $pdf->Rect(PdfDocument::MARGIN_LEFT, $doc->y, $tableW, self::ROW_H, 'FD');
            self::cell($doc, PdfDocument::MARGIN_LEFT + 6, $garment['name'] . ' Measurements', true);
            self::cell($doc, $valueColX + 6, 'Inches', true);
            $pdf->Line($valueColX, $doc->y, $valueColX, $doc->y + self::ROW_H);
            $doc->y += self::ROW_H;

            foreach ($garment['fields'] as $field) {
                $pdf->Rect(PdfDocument::MARGIN_LEFT, $doc->y, $tableW, self::ROW_H, 'D');
                $pdf->Line($valueColX, $doc->y, $valueColX, $doc->y + self::ROW_H);
                self::cell($doc, PdfDocument::MARGIN_LEFT + 6, $field['label'], false);
                $value = $form[$field['key']] ?? null;
                self::cell($doc, $valueColX + 6, $value === null ? '—' : self::number((float) $value), false);
                $doc->y += self::ROW_H;
            }
            $doc->y += self::TABLE_GAP;
        }

        $doc->ensure(PdfDocument::LINE_HEIGHT * 3);
        $doc->y += 4;
        if ((int) $form['tailor_confirmed'] === 1) {
            $doc->drawRun(PdfDocument::MARGIN_LEFT, 'Confirmed by the student that these measurements were taken by a qualified tailor.', ['italic' => true]);
            $doc->y += PdfDocument::LINE_HEIGHT + 4;
        }
        $doc->drawDate(PdfDocument::MARGIN_LEFT, 'Submitted on: ', new \DateTime((string) $form['submitted_at']), $bold);
        if ($form['status'] === 'unlocked') {
            $doc->y += PdfDocument::LINE_HEIGHT + 4;
            $doc->drawRun(PdfDocument::MARGIN_LEFT, 'Status: Unlocked for correction', $bold);
        }
        return $doc->output();
    }

    /** Text vertically centred in the current table row. */
    private static function cell(PdfDocument $doc, float $x, string $text, bool $bold): void
    {
        $doc->pdf->SetFont('serif', $bold ? 'B' : '', self::TABLE_FONT);
        $doc->pdf->Text($x, $doc->y + self::ROW_H / 2 + self::TABLE_FONT * 0.35, $text);
    }

    /** 36.5 → "36.5", 30 → "30" */
    private static function number(float $value): string
    {
        return rtrim(rtrim(number_format($value, 2, '.', ''), '0'), '.');
    }
}
