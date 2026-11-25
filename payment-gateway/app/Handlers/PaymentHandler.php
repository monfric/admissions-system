<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Services\PaymentConflict;
use App\Services\Payments;
use App\Services\Transactions;

/** Client-facing payment endpoints (all signed; see Clients::auth). */
final class PaymentHandler
{
    /** POST /payments/stk */
    public function stk(Request $request): never
    {
        try {
            [$status, $message, $txn] = Payments::initiate($request);
        } catch (PaymentConflict $e) {
            Response::json(409, ['success' => false, 'message' => $e->getMessage(), 'data' => Transactions::present($e->transaction)]);
        }
        Response::json($status, [
            'success' => $status < 300,
            'message' => $message,
            'data'    => Transactions::present($txn),
        ]);
    }

    /** GET /payments/:id */
    public function show(Request $request): never
    {
        $txn = Payments::status($request->client, (string) $request->params['id']);
        Response::success('Payment status', Transactions::present($txn));
    }

    /** GET /payments?reference=… */
    public function index(Request $request): never
    {
        $reference = trim((string) $request->query('reference', ''));
        if ($reference === '') {
            throw HttpException::badRequest('reference is required');
        }
        Response::success('Payments', array_map([Transactions::class, 'present'], Payments::forReference($request->client, $reference)));
    }
}
