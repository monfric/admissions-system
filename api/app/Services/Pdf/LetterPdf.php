<?php
declare(strict_types=1);

namespace App\Services\Pdf;

use App\Core\Config;

/**
 * Provisional offer and admission letters, laid out like the college's Word
 * letters (and the LMIS Go letters): letterhead and footer on every page, a
 * reference/date/name block, a bold underlined "RE:" title, the justified
 * letter body written by staff, and the Principal's sign-off.
 */
final class LetterPdf
{
    private const PARA_SPACING = 8.0;
    private const LIST_INDENT = 34.0;

    private const MONTHS = [
        'January' => 'JAN', 'February' => 'FEB', 'March' => 'MAR', 'April' => 'APR',
        'May' => 'MAY', 'June' => 'JUNE', 'July' => 'JULY', 'August' => 'AUG',
        'September' => 'SEPT', 'October' => 'OCT', 'November' => 'NOV', 'December' => 'DEC',
    ];

    private PdfDocument $doc;

    /** "NMTC/PROV/SEPT/2026" or "NMTC/ADM/SEPT/2026" from the letter type and intake. */
    public static function reference(string $type, string $intakeMonth, int $intakeYear): string
    {
        $prefix = (string) Config::get('letters.reference_prefix', 'NMTC');
        $kind = $type === 'admission' ? 'ADM' : 'PROV';
        $month = self::MONTHS[$intakeMonth] ?? strtoupper($intakeMonth);
        return "$prefix/$kind/$month/$intakeYear";
    }

    /**
     * @param array{type: string, reference: string, date: \DateTimeInterface, name: string,
     *              admission_number?: string, body: string} $data
     */
    public static function generate(array $data): string
    {
        $letter = new self();
        $letter->doc = new PdfDocument();
        $letter->doc->pdf->SetTitle($data['type'] === 'admission' ? 'Admission Letter' : 'Provisional Offer Letter', true);
        return $letter->render($data);
    }

    private function render(array $data): string
    {
        $doc = $this->doc;
        $doc->newPage();
        $bold = ['bold' => true];
        $valueX = PdfDocument::MARGIN_LEFT + 90;

        // Our Ref ............................................ Date: 18th June 2026
        $doc->drawLabelRow('Our Ref:', $data['reference'], $valueX);
        $dateW = $doc->dateWidth('Date: ', $data['date'], $bold);
        $doc->drawDate(PdfDocument::MARGIN_RIGHT - $dateW, 'Date: ', $data['date'], $bold);
        $doc->y += PdfDocument::LINE_HEIGHT + 12;

        $doc->drawLabelRow('Name:', $data['name'], $valueX);
        $doc->y += PdfDocument::LINE_HEIGHT + 12;

        if ($data['type'] === 'admission' && ($data['admission_number'] ?? '') !== '') {
            $doc->drawLabelRow('Admission No:', $data['admission_number'], $valueX);
            $doc->y += PdfDocument::LINE_HEIGHT + 12;
        }

        $title = $data['type'] === 'admission' ? 'RE: LETTER OF ADMISSION' : 'RE: PROVISIONAL OFFER LETTER';
        $doc->drawRun(PdfDocument::MARGIN_LEFT, $title, ['bold' => true, 'underline' => true]);
        $doc->y += PdfDocument::LINE_HEIGHT + 12;

        $blocks = LetterBody::parse($data['body']);
        foreach ($blocks as $i => $block) {
            $this->drawBlock($block);
            $nextIsListItem = isset($blocks[$i + 1]) && $blocks[$i + 1]['marker'] !== '';
            $doc->y += ($block['marker'] !== '' && $nextIsListItem) ? 2 : self::PARA_SPACING;
        }

        // Sign-off, kept together on one page.
        $doc->ensure(PdfDocument::LINE_HEIGHT * 3 + 40);
        $doc->y += 4;
        $doc->drawRun(PdfDocument::MARGIN_LEFT, 'Yours faithfully,');
        $doc->y += PdfDocument::LINE_HEIGHT + 40; // room for a signature
        $doc->drawRun(PdfDocument::MARGIN_LEFT, (string) Config::get('letters.signatory_name', 'SR. PHYLLIS'), $bold);
        $doc->y += PdfDocument::LINE_HEIGHT;
        $doc->drawRun(PdfDocument::MARGIN_LEFT, (string) Config::get('letters.signatory_title', 'The College Principal'),
            ['bold' => true, 'italic' => true, 'underline' => true]);

        return $doc->output();
    }

    private function drawBlock(array $block): void
    {
        $doc = $this->doc;
        $x = PdfDocument::MARGIN_LEFT;
        $maxWidth = PdfDocument::MARGIN_RIGHT - PdfDocument::MARGIN_LEFT;
        if ($block['marker'] !== '') {
            $x += self::LIST_INDENT;
            $maxWidth -= self::LIST_INDENT;
        }
        foreach ($this->wrap($this->toWords($block['segments']), $maxWidth) as $i => $line) {
            $doc->ensure(PdfDocument::LINE_HEIGHT);
            if ($i === 0 && $block['marker'] !== '') {
                $doc->drawRun(PdfDocument::MARGIN_LEFT, $block['marker']);
            }
            $this->drawLine($line, $x, $maxWidth);
            $doc->y += PdfDocument::LINE_HEIGHT;
        }
    }

    /**
     * Words made of styled pieces, so "8th" with a superscript "th" stays
     * together; null entries mark forced line breaks.
     */
    private function toWords(array $segments): array
    {
        $words = [];
        $current = null;
        $flush = function () use (&$words, &$current) {
            if ($current !== null && $current['pieces']) {
                $words[] = $current;
            }
            $current = null;
        };
        foreach ($segments as $seg) {
            if ($seg['text'] === "\n") {
                $flush();
                $words[] = null;
                continue;
            }
            foreach (explode(' ', $seg['text']) as $i => $part) {
                if ($i > 0) {
                    $flush();
                }
                if ($part === '') {
                    continue;
                }
                $current ??= ['pieces' => [], 'width' => 0.0];
                $width = $this->doc->measure($part, $seg['style']);
                $current['pieces'][] = ['text' => $part, 'style' => $seg['style'], 'width' => $width];
                $current['width'] += $width;
            }
        }
        $flush();
        return $words;
    }

    /** Lines of words; 'last' lines (paragraph end or forced break) aren't justified. */
    private function wrap(array $words, float $maxWidth): array
    {
        $space = $this->doc->measure(' ');
        $lines = [];
        $line = [];
        $lineWidth = 0.0;
        foreach ($words as $word) {
            if ($word === null) {
                $lines[] = ['words' => $line, 'last' => true];
                [$line, $lineWidth] = [[], 0.0];
                continue;
            }
            $needed = $word['width'] + ($line ? $space : 0);
            if ($line && $lineWidth + $needed > $maxWidth) {
                $lines[] = ['words' => $line, 'last' => false];
                [$line, $lineWidth] = [[], 0.0];
                $needed = $word['width'];
            }
            $line[] = $word;
            $lineWidth += $needed;
        }
        if ($line) {
            $lines[] = ['words' => $line, 'last' => true];
        } elseif ($lines) {
            $lines[count($lines) - 1]['last'] = true;
        }
        return $lines;
    }

    /** One line from x, justified to maxWidth unless it's a last line. */
    private function drawLine(array $line, float $x, float $maxWidth): void
    {
        $words = $line['words'];
        $gap = $this->doc->measure(' ');
        if (!$line['last'] && count($words) > 1) {
            $total = array_sum(array_column($words, 'width'));
            $gap = ($maxWidth - $total) / (count($words) - 1);
        }
        foreach ($words as $i => $word) {
            foreach ($word['pieces'] as $piece) {
                $x += $this->doc->drawRun($x, $piece['text'], $piece['style']);
            }
            if ($i < count($words) - 1) {
                // Keep underlining across the space between two underlined words.
                $next = $words[$i + 1];
                if (!empty(end($word['pieces'])['style']['underline']) && !empty($next['pieces'][0]['style']['underline'])) {
                    $this->doc->underline($x, $x + $gap);
                }
                $x += $gap;
            }
        }
    }
}
