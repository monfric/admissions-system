<?php
declare(strict_types=1);

namespace App\Services\Pdf;

/**
 * A payment receipt on the college letterhead: who paid, for which
 * application, how much, how and when.
 */
final class ReceiptPdf
{
    private const ROW_H = 22.0;
    private const LABEL_W = 170.0;

    /**
     * @param array{receipt_number: string, received_from: string, application_number: string, intake: string,
     *              training_level: string, description: string, amount: float, method: string,
     *              transaction_code: string, phone: string, paid_at: string} $r
     */
    public static function generate(array $r): string
    {
        $doc = new PdfDocument();
        $pdf = $doc->pdf;
        $pdf->SetTitle('Payment Receipt ' . $r['receipt_number'], true);
        $doc->newPage();

        $title = 'PAYMENT RECEIPT';
        $titleStyle = ['bold' => true, 'underline' => true];
        $doc->drawRun((PdfDocument::PAGE_W - $doc->measure($title, $titleStyle)) / 2, $title, $titleStyle);
        $doc->y += PdfDocument::LINE_HEIGHT + 18;

        $rows = [
            'Receipt No.'        => $r['receipt_number'],
            'Date Paid'          => date('j F Y, g:i a', strtotime($r['paid_at'])),
            'Received From'      => $r['received_from'],
            'Application No.'    => $r['application_number'],
            'Intake'             => $r['intake'],
            'Training Level'     => $r['training_level'],
            'Being Payment For'  => $r['description'],
            'Payment Method'     => $r['method'],
            'Transaction Code'   => $r['transaction_code'] !== '' ? $r['transaction_code'] : 'To be confirmed',
        ];
        if ($r['phone'] !== '') {
            $rows['Paid From'] = $r['phone'];
        }

        $x = PdfDocument::MARGIN_LEFT;
        $w = PdfDocument::MARGIN_RIGHT - PdfDocument::MARGIN_LEFT;
        $pdf->SetDrawColor(0, 0, 0);
        $pdf->SetLineWidth(0.6);
        foreach ($rows as $label => $value) {
            $pdf->Rect($x, $doc->y, $w, self::ROW_H, 'D');
            $pdf->Line($x + self::LABEL_W, $doc->y, $x + self::LABEL_W, $doc->y + self::ROW_H);
            self::cell($doc, $x + 8, $label, true);
            self::cell($doc, $x + self::LABEL_W + 8, $value, false);
            $doc->y += self::ROW_H;
        }

        // The amount, highlighted.
        $pdf->SetFillColor(229, 231, 235);
        $pdf->Rect($x, $doc->y, $w, self::ROW_H + 6, 'FD');
        $pdf->Line($x + self::LABEL_W, $doc->y, $x + self::LABEL_W, $doc->y + self::ROW_H + 6);
        self::cell($doc, $x + 8, 'Amount Paid', true, 3);
        self::cell($doc, $x + self::LABEL_W + 8, 'KES ' . number_format($r['amount'], 2), true, 3);
        $doc->y += self::ROW_H + 6 + 24;

        $doc->drawRun(PdfDocument::MARGIN_LEFT, 'Thank you for your payment.', ['bold' => true]);
        $doc->y += PdfDocument::LINE_HEIGHT + 6;
        $doc->drawRun(PdfDocument::MARGIN_LEFT, 'This receipt was generated electronically by the NMTC Admissions System and needs no signature.', ['italic' => true]);
        $doc->y += PdfDocument::LINE_HEIGHT;
        $doc->drawDate(PdfDocument::MARGIN_LEFT, 'Printed on: ', new \DateTime(), ['italic' => true]);
        return $doc->output();
    }

    /** "NMTC/RCT/2026/00042" */
    public static function number(string $prefix, int $paymentId, string $paidAt): string
    {
        return sprintf('%s/RCT/%s/%05d', $prefix, date('Y', strtotime($paidAt)), $paymentId);
    }

    private static function cell(PdfDocument $doc, float $x, string $text, bool $bold, float $extra = 0): void
    {
        $doc->pdf->SetFont('serif', $bold ? 'B' : '', 10.5);
        $doc->pdf->Text($x, $doc->y + (self::ROW_H + $extra) / 2 + 10.5 * 0.35, $text);
    }
}
