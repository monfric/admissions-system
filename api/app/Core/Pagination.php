<?php
declare(strict_types=1);

namespace App\Core;

/** page / page_size / search query parameters and the paginated result shape (as in Go). */
final class Pagination
{
    public readonly int $page;
    public readonly int $pageSize;
    public readonly string $search;

    public function __construct(Request $request)
    {
        $page = (int) $request->query('page', 1);
        if ($request->query('page') !== null && $page < 1) {
            throw HttpException::badRequest('Invalid query parameters', 'page must be at least 1');
        }
        $this->page = max(1, $page);
        $size = (int) $request->query('page_size', 0);
        $this->pageSize = $size < 1 ? 99 : $size; // same default as the Go API
        $this->search = trim((string) $request->query('search', ''));
    }

    public function offset(): int
    {
        return ($this->page - 1) * $this->pageSize;
    }

    /** "LIMIT n OFFSET m" (ints only, so safe to inline). */
    public function limitSql(): string
    {
        return sprintf('LIMIT %d OFFSET %d', $this->pageSize, $this->offset());
    }

    public function result(array $data, int $totalItems): array
    {
        $totalPages = (int) ceil($totalItems / $this->pageSize);
        return [
            'data'        => array_values($data),
            'page'        => $this->page,
            'page_size'   => $this->pageSize,
            'total_items' => $totalItems,
            'total_pages' => $totalPages,
            'has_next'    => $this->page < $totalPages,
            'has_prev'    => $this->page > 1,
        ];
    }
}
