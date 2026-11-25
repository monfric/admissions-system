<?php
declare(strict_types=1);

namespace App\Mpesa;

use RuntimeException;

/** M-Pesa answered, but refused the request. */
final class MpesaException extends RuntimeException
{
}
