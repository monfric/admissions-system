<?php
declare(strict_types=1);

namespace App\Services\Pdf;

/**
 * Turns a stored letter body into blocks (paragraphs and list items) of
 * styled text segments. Bodies written with the staff editor are a small HTML
 * subset (p, br, strong/b, em/i, u, sup, ol/ul/li); older plain-text bodies
 * become one paragraph per line. Same rules as the Go parser, but with a tiny
 * tokenizer so the server needs no DOM extension.
 *
 * A block is ['marker' => '' | 'i)' | '•', 'segments' => [['text' => …, 'style' => […]], …]];
 * a segment whose text is "\n" is a forced line break.
 */
final class LetterBody
{
    private const BLOCK_TAGS = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
    private const VOID_TAGS = ['br', 'img', 'hr', 'input', 'meta', 'link', 'wbr'];

    private array $blocks = [];
    private ?array $current = null;
    /** @var list<array{ordered: bool, count: int}> */
    private array $lists = [];

    public static function parse(string $body): array
    {
        if (!str_contains($body, '<')) {
            $blocks = [];
            foreach (explode("\n", str_replace("\r\n", "\n", $body)) as $line) {
                if (($line = trim($line)) !== '') {
                    $blocks[] = ['marker' => '', 'segments' => [['text' => $line, 'style' => []]]];
                }
            }
            return $blocks;
        }
        $parser = new self();
        $parser->walk($body);
        $parser->finish();
        return $parser->blocks;
    }

    private function walk(string $html): void
    {
        // Each open element: [tag, style]; text takes the style of the innermost one.
        $stack = [];
        $style = [];
        $skipping = null; // inside <script>/<style>

        preg_match_all('/<!--.*?-->|<(\/?)([a-zA-Z0-9]+)([^>]*)>|[^<]+|</s', $html, $tokens, PREG_SET_ORDER);
        foreach ($tokens as $t) {
            $raw = $t[0];
            if (str_starts_with($raw, '<!--')) {
                continue;
            }
            if (!isset($t[2]) || $t[2] === '') {
                if ($skipping === null) {
                    $this->addTextNode($raw === '<' ? '<' : $raw, $style);
                }
                continue;
            }

            $closing = $t[1] === '/';
            $tag = strtolower($t[2]);
            $attrs = $t[3] ?? '';

            if ($skipping !== null) {
                if ($closing && $tag === $skipping) {
                    $skipping = null;
                }
                continue;
            }
            if (!$closing && in_array($tag, ['script', 'style'], true)) {
                $skipping = $tag;
                continue;
            }

            if ($closing) {
                // Pop up to and including the matching element.
                for ($i = count($stack) - 1; $i >= 0; $i--) {
                    if ($stack[$i][0] === $tag) {
                        $popped = array_splice($stack, $i);
                        foreach (array_reverse($popped) as [$name]) {
                            $this->closeElement($name);
                        }
                        break;
                    }
                }
                $style = $stack ? end($stack)[1] : [];
                continue;
            }

            if ($tag === 'br') {
                if ($this->current !== null) {
                    $this->current['segments'][] = ['text' => "\n", 'style' => $style];
                }
                continue;
            }
            if (in_array($tag, self::VOID_TAGS, true)) {
                continue;
            }
            $selfClosing = str_ends_with(rtrim($attrs), '/');

            $newStyle = $style;
            match ($tag) {
                'strong', 'b' => $newStyle['bold'] = true,
                'em', 'i'     => $newStyle['italic'] = true,
                'u'           => $newStyle['underline'] = true,
                'sup'         => $newStyle['sup'] = true,
                default       => null,
            };
            $this->openElement($tag, $attrs);
            if ($selfClosing) {
                $this->closeElement($tag);
                continue;
            }
            $stack[] = [$tag, $newStyle];
            $style = $newStyle;
        }
    }

    private function openElement(string $tag, string $attrs): void
    {
        if (in_array($tag, self::BLOCK_TAGS, true)) {
            $this->start('');
        } elseif ($tag === 'ol' || $tag === 'ul') {
            $this->finish();
            $this->lists[] = ['ordered' => $tag === 'ol', 'count' => 0];
        } elseif ($tag === 'li') {
            $marker = '•';
            if ($this->lists) {
                $last = count($this->lists) - 1;
                $ordered = $this->lists[$last]['ordered'];
                // The editor marks bullets inside an <ol> with data-list="bullet".
                if (preg_match('/data-list\s*=\s*["\']?([a-z]+)/i', $attrs, $m)) {
                    $ordered = strtolower($m[1]) === 'ordered';
                }
                if ($ordered) {
                    $this->lists[$last]['count']++;
                    $marker = self::roman($this->lists[$last]['count']) . ')';
                }
            }
            $this->start($marker);
        }
    }

    private function closeElement(string $tag): void
    {
        if (in_array($tag, self::BLOCK_TAGS, true) || $tag === 'li') {
            $this->finish();
        } elseif ($tag === 'ol' || $tag === 'ul') {
            $this->finish();
            array_pop($this->lists);
        }
    }

    /** Text node: whitespace collapsed to single spaces, keeping a leading/trailing space. */
    private function addTextNode(string $raw, array $style): void
    {
        $data = str_replace("\u{00A0}", ' ', html_entity_decode($raw, ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $text = trim((string) preg_replace('/\s+/u', ' ', $data));
        if ($text === '') {
            if (preg_match('/\s/u', $data)) {
                $this->addText(' ', $style);
            }
            return;
        }
        if (preg_match('/^\s/u', $data)) {
            $text = ' ' . $text;
        }
        if (preg_match('/\s$/u', $data)) {
            $text .= ' ';
        }
        $this->addText($text, $style);
    }

    private function addText(string $text, array $style): void
    {
        $this->current ??= ['marker' => '', 'segments' => []];
        $this->current['segments'][] = ['text' => $text, 'style' => $style];
    }

    private function start(string $marker): void
    {
        $this->finish();
        $this->current = ['marker' => $marker, 'segments' => []];
    }

    /** Ends the current block, trimming spaces at its edges; empty blocks are dropped. */
    private function finish(): void
    {
        if ($this->current === null) {
            return;
        }
        $segs = $this->current['segments'];
        while ($segs && trim($segs[0]['text']) === '' && $segs[0]['text'] !== "\n") {
            array_shift($segs);
        }
        while ($segs && trim(end($segs)['text']) === '') {
            array_pop($segs);
        }
        if ($segs) {
            $segs[0]['text'] = ltrim($segs[0]['text'], ' ');
            $last = count($segs) - 1;
            $segs[$last]['text'] = rtrim($segs[$last]['text'], ' ');
            $this->current['segments'] = $segs;
            $this->blocks[] = $this->current;
        }
        $this->current = null;
    }

    public static function roman(int $n): string
    {
        $map = [1000 => 'm', 900 => 'cm', 500 => 'd', 400 => 'cd', 100 => 'c', 90 => 'xc', 50 => 'l', 40 => 'xl', 10 => 'x', 9 => 'ix', 5 => 'v', 4 => 'iv', 1 => 'i'];
        $out = '';
        foreach ($map as $value => $symbol) {
            while ($n >= $value) {
                $out .= $symbol;
                $n -= $value;
            }
        }
        return $out;
    }
}
