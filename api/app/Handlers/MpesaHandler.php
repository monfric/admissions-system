<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Database;
use App\Core\HttpException;
use App\Core\Pagination;
use App\Core\Query;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\MpesaPaymentService;
use App\Services\PaymentGateway;
use App\Services\ReceiptService;
use Throwable;

/** M-Pesa fee payments (portal + staff), the Payment Gateway webhook, and receipts. */
final class MpesaHandler
{
    private MpesaPaymentService $mpesa;

    public function __construct()
    {
        $this->mpesa = new MpesaPaymentService();
    }

    // ── Applicant portal ─────────────────────────────────────────────────────

    /** POST /applicant-portal/applications/:id/mpesa  {"phone": "07…"} */
    public function start(Request $r): never
    {
        $batchId = $r->intParam('id', 'application ID');
        $this->ownBatch($r, $batchId);
        $req = Validator::validate($r->json(), ['phone' => 'required|string|max:20']);
        Response::success('Payment request sent to your phone', $this->mpesa->start($batchId, (string) $req['phone'], null));
    }

    /** GET /applicant-portal/applications/:id/mpesa/:mpesaId */
    public function status(Request $r): never
    {
        Response::success('Payment status', $this->mpesa->statusForApplicant(
            (int) $r->applicantId, $r->intParam('id', 'application ID'), $r->intParam('mpesaId', 'payment ID')
        ));
    }

    /** GET /applicant-portal/payments/:id/receipt */
    public function portalReceipt(Request $r): never
    {
        [$pdf, $name] = (new ReceiptService())->pdf($r->intParam('id', 'payment ID'), (int) $r->applicantId);
        Response::pdf($pdf, $name);
    }

    // ── Payment Gateway ──────────────────────────────────────────────────────

    /** POST /payments/gateway-webhook (signed by the gateway with this system's client secret) */
    public function webhook(Request $r): never
    {
        if (!PaymentGateway::verifyWebhook($r)) {
            Response::error(401, 'Invalid signature');
        }
        $deliveryId = (string) $r->header('X-Gateway-Delivery');
        $body = $r->json();
        $txn = $body['data'] ?? null;
        if ($deliveryId === '' || !is_array($txn)) {
            Response::error(400, 'Invalid webhook');
        }
        if (Database::value('SELECT id FROM gateway_webhook_events WHERE delivery_id = ?', [$deliveryId]) !== null) {
            Response::success('Already processed');
        }
        try {
            $this->mpesa->apply($txn);
        } catch (HttpException $e) {
            // Not one of ours: retrying won't help, so acknowledge it.
            Response::success('Ignored: ' . $e->getMessage());
        }
        try {
            Database::insert('gateway_webhook_events', [
                'delivery_id' => $deliveryId,
                'event'       => (string) ($body['event'] ?? ''),
                'gateway_id'  => (string) ($txn['id'] ?? ''),
            ], false);
        } catch (Throwable) {
            // Two copies at once: the other one recorded it; the payment itself is applied once either way.
        }
        Response::success('Processed');
    }

    // ── Staff app ────────────────────────────────────────────────────────────

    /** GET /mpesa-payments?status=&review=&search= */
    public function list(Request $r): never
    {
        $status = Query::oneOf($r, 'status', array_merge(MpesaPaymentService::OPEN, MpesaPaymentService::FINAL, ['waiting', 'unsuccessful']));
        $review = Query::oneOf($r, 'review', ['needs_review', 'reviewed']);
        Response::success('M-Pesa payments retrieved successfully', $this->mpesa->list(new Pagination($r), $status, $review));
    }

    public function stats(Request $r): never
    {
        Response::success('M-Pesa payment statistics retrieved successfully', $this->mpesa->stats());
    }

    /** POST /mpesa-payments/:id/review */
    public function review(Request $r): never
    {
        Response::success('Marked as checked', $this->mpesa->markReviewed($r->intParam('id', 'payment ID'), (int) $r->userId));
    }

    /** GET /payments/:id/receipt */
    public function staffReceipt(Request $r): never
    {
        [$pdf, $name] = (new ReceiptService())->pdf($r->intParam('id', 'payment ID'), null);
        Response::pdf($pdf, $name);
    }

    private function ownBatch(Request $r, int $batchId): void
    {
        $owner = Database::value('SELECT applicant_id FROM application_batches WHERE id = ? AND deleted_at IS NULL', [$batchId]);
        if ($owner === null || (int) $owner !== (int) $r->applicantId) {
            throw HttpException::notFound('application not found');
        }
    }
}
