<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\HttpException;

/** 409 that also returns the transaction in the way (handled in PaymentHandler). */
final class PaymentConflict extends HttpException
{
    public function __construct(string $message, public readonly array $transaction)
    {
        parent::__construct(409, $message);
    }
}
