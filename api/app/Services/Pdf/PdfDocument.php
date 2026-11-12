<?php
declare(strict_types=1);

namespace App\Services\Pdf;

use App\Core\Config;

/**
 * An A4 page writer with the college letterhead and footer on every page,
 * shared by the letters and the uniform measurement form (same layout as the
 * LMIS Go letters). Units are points; y is the top of the next line.
 */
class PdfDocument
{
    // Page geometry, in points (A4 is 595 x 842).
    public const PAGE_W = 595.0;
    public const PAGE_H = 842.0;
    public const MARGIN_LEFT = 50.0;
    public const MARGIN_RIGHT = 545.0;
    public const CONTENT_TOP = 136.0;
    public const FONT_SIZE = 11.0;
    public const LINE_HEIGHT = 15.5;
    private const SUP_SCALE = 0.62;
    private const HEADER_INSET = 18.0;
    private const HEADER_TOP = 8.0;
    private const FOOTER_LEFT = 52.0;
    private const FOOTER_BOTTOM = 30.0;

    public \tFPDF $pdf;
    public float $y = self::CONTENT_TOP;

    private string $headerImage;
    private string $footerImage;
    private float $headerH;
    private float $footerH;

    public function __construct()
    {
        $root = dirname(__DIR__, 3);
        if (!defined('_SYSTEM_TTFONTS')) {
            define('_SYSTEM_TTFONTS', $root . '/assets/fonts/');
        }
        if (!defined('FPDF_FONTPATH')) {
            // tFPDF caches font metrics in FPDF_FONTPATH/unifont, so it must be writable.
            $cache = Config::storagePath('fonts');
            if (!is_dir($cache . '/unifont')) {
                @mkdir($cache . '/unifont', 0755, true);
            }
            define('FPDF_FONTPATH', $cache . '/');
        }
        require_once $root . '/app/Lib/mbstring-polyfill.php';
        require_once $root . '/app/Lib/tfpdf/ttfonts.php';
        require_once $root . '/app/Lib/tfpdf/tfpdf.php';

        $this->pdf = new \tFPDF('P', 'pt', 'A4');
        $this->pdf->SetAutoPageBreak(false);
        $this->pdf->SetMargins(0, 0, 0);
        $this->pdf->SetCreator((string) Config::get('app_name', 'NMTC Admissions'));
        $this->pdf->AddFont('serif', '', 'NotoSerif-Regular.ttf', true);
        $this->pdf->AddFont('serif', 'B', 'NotoSerif-Bold.ttf', true);
        $this->pdf->AddFont('serif', 'I', 'NotoSerif-Italic.ttf', true);
        $this->pdf->AddFont('serif', 'BI', 'NotoSerif-BoldItalic.ttf', true);

        // Letterhead images (replace the files to rebrand); sizes keep their aspect ratio.
        $this->headerImage = (string) Config::get('letters.header_image', $root . '/assets/letterhead/header.jpg');
        $this->footerImage = (string) Config::get('letters.footer_image', $root . '/assets/letterhead/footer.png');
        $this->headerH = $this->scaledHeight($this->headerImage, self::PAGE_W - 2 * self::HEADER_INSET);
        $this->footerH = $this->scaledHeight($this->footerImage, self::PAGE_W - self::FOOTER_LEFT);
    }

    private function scaledHeight(string $image, float $width): float
    {
        $size = @getimagesize($image);
        return $size ? $width * $size[1] / $size[0] : 0.0;
    }

    public function newPage(): void
    {
        $this->pdf->AddPage();
        if ($this->headerH > 0) {
            $this->pdf->Image($this->headerImage, self::HEADER_INSET, self::HEADER_TOP, self::PAGE_W - 2 * self::HEADER_INSET, $this->headerH);
        }
        if ($this->footerH > 0) {
            $this->pdf->Image($this->footerImage, self::FOOTER_LEFT, self::PAGE_H - self::FOOTER_BOTTOM - $this->footerH, self::PAGE_W - self::FOOTER_LEFT, $this->footerH);
        }
        $this->y = self::CONTENT_TOP;
    }

    public function contentBottom(): float
    {
        return self::PAGE_H - self::FOOTER_BOTTOM - $this->footerH - 10;
    }

    /** Starts a new page when $h more points won't fit on this one. */
    public function ensure(float $h): void
    {
        if ($this->y + $h > $this->contentBottom()) {
            $this->newPage();
        }
    }

    /** @param array{bold?: bool, italic?: bool, underline?: bool, sup?: bool} $style */
    public function setFont(array $style, float $size = self::FONT_SIZE): void
    {
        $variant = (!empty($style['bold']) ? 'B' : '') . (!empty($style['italic']) ? 'I' : '');
        $this->pdf->SetFont('serif', $variant, !empty($style['sup']) ? $size * self::SUP_SCALE : $size);
    }

    public function measure(string $text, array $style = [], float $size = self::FONT_SIZE): float
    {
        $this->setFont($style, $size);
        return $this->pdf->GetStringWidth($text);
    }

    public function baseline(): float
    {
        return $this->y + self::FONT_SIZE * 0.8;
    }

    /** Writes text at x on the current line and returns its width. */
    public function drawRun(float $x, string $text, array $style = []): float
    {
        $this->setFont($style);
        $baseline = $this->baseline() - (!empty($style['sup']) ? self::FONT_SIZE * 0.35 : 0);
        $this->pdf->Text($x, $baseline, $text);
        $width = $this->pdf->GetStringWidth($text);
        if (!empty($style['underline'])) {
            $this->underline($x, $x + $width);
        }
        return $width;
    }

    public function underline(float $x1, float $x2): void
    {
        $y = $this->baseline() + 1.6;
        $this->pdf->SetLineWidth(0.6);
        $this->pdf->SetDrawColor(0, 0, 0);
        $this->pdf->Line($x1, $y, $x2, $y);
    }

    /** A bold "Label:" with a bold value at $valueX (pushed right if the label is longer). */
    public function drawLabelRow(string $label, string $value, float $valueX): void
    {
        $bold = ['bold' => true];
        $labelEnd = self::MARGIN_LEFT + $this->drawRun(self::MARGIN_LEFT, $label, $bold);
        $this->drawRun(max($valueX, $labelEnd + 8), $value, $bold);
    }

    /** Draws "Prefix 18th June 2026" (superscript ordinal) from $x; returns the width. */
    public function drawDate(float $x, string $prefix, \DateTimeInterface $date, array $style): float
    {
        $parts = $this->dateParts($prefix, $date, $style);
        $start = $x;
        foreach ($parts as [$text, $s]) {
            $x += $this->drawRun($x, $text, $s);
        }
        return $x - $start;
    }

    public function dateWidth(string $prefix, \DateTimeInterface $date, array $style): float
    {
        $width = 0.0;
        foreach ($this->dateParts($prefix, $date, $style) as [$text, $s]) {
            $width += $this->measure($text, $s);
        }
        return $width;
    }

    private function dateParts(string $prefix, \DateTimeInterface $date, array $style): array
    {
        $day = (int) $date->format('j');
        return [
            [$prefix . $day, $style],
            [self::ordinalSuffix($day), $style + ['sup' => true]],
            [' ' . $date->format('F Y'), $style],
        ];
    }

    public static function ordinalSuffix(int $day): string
    {
        if ($day % 100 >= 11 && $day % 100 <= 13) {
            return 'th';
        }
        return match ($day % 10) {
            1 => 'st',
            2 => 'nd',
            3 => 'rd',
            default => 'th',
        };
    }

    public function output(): string
    {
        return $this->pdf->Output('S');
    }
}
