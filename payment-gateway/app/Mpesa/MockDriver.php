<?php
declare(strict_types=1);

namespace App\Mpesa;

use App\Core\Config;
use App\Core\Database;
use App\Core\Log;

/**
 * Pretends to be M-Pesa, for local testing without Safaricom (never allowed in
 * production; see bootstrap.php).
 *
 * - A prompt always "sends". Phone 254700000001 is refused, to test that path.
 * - The status check reports the ResultCode of the latest callback posted for
 *   the prompt (from Postman). With none, it says "processing" until
 *   mpesa.mock.auto_complete_seconds have passed, then reports
 *   mpesa.mock.auto_result_code: that is how a missed callback looks.
 */
final class MockDriver implements MpesaDriver
{
    public const REFUSED_PHONE = '254700000001';

    public function stkPush(array $p): array
    {
        if ($p['phone'] === self::REFUSED_PHONE) {
            throw new MpesaException('Invalid PhoneNumber (mock)');
        }
        $merchant = 'MOCK-' . strtoupper(bin2hex(random_bytes(6)));
        $checkout = 'ws_CO_MOCK_' . date('dmYHis') . strtoupper(bin2hex(random_bytes(4)));
        Log::write('daraja', 'MOCK stk push', ['phone' => Mpesa::maskPhone($p['phone']), 'amount' => $p['amount'], 'checkout' => $checkout]);
        return [
            'merchant_request_id' => $merchant,
            'checkout_request_id' => $checkout,
            'customer_message'    => 'Success. Request accepted for processing',
        ];
    }

    public function stkQuery(string $checkoutRequestId): array
    {
        $callback = Database::one(
            "SELECT result_code FROM mpesa_callbacks
             WHERE checkout_request_id = ? AND result_code IS NOT NULL AND status <> 'invalid'
             ORDER BY id DESC LIMIT 1",
            [$checkoutRequestId]
        );
        if ($callback !== null) {
            $code = (int) $callback['result_code'];
            return ['state' => 'final', 'code' => $code, 'desc' => $code === 0 ? 'The service request is processed successfully.' : 'Mock result ' . $code];
        }

        $createdAt = Database::value('SELECT created_at FROM transactions WHERE checkout_request_id = ?', [$checkoutRequestId]);
        if ($createdAt === null) {
            throw new \RuntimeException('Mock: unknown CheckoutRequestID');
        }
        $wait = (int) Config::get('mpesa.mock.auto_complete_seconds', 60);
        if (time() - strtotime((string) $createdAt) < $wait) {
            return ['state' => 'processing'];
        }
        $code = (int) Config::get('mpesa.mock.auto_result_code', 0);
        return ['state' => 'final', 'code' => $code, 'desc' => $code === 0 ? 'The service request is processed successfully.' : 'Mock result ' . $code];
    }
}
