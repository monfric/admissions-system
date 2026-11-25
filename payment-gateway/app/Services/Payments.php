<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Crypto;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Log;
use App\Core\RateLimiter;
use App\Core\Request;
use App\Core\Text;
use App\Core\Validator;
use App\Mpesa\Mpesa;
use App\Mpesa\MpesaException;
use PDOException;
use Throwable;

/** Starting STK Push payments and reading their status, for client systems. */
final class Payments
{
    /**
     * Starts a payment: sends the M-Pesa prompt to the phone.
     *
     * @return array{0:int, 1:string, 2:array} [HTTP status, message, transaction]
     */
    public static function initiate(Request $request): array
    {
        $client = $request->client;
        $key = (string) $request->header('Idempotency-Key');
        if (!preg_match('/^[A-Za-z0-9_\-:.]{8,100}$/', $key)) {
            throw HttpException::badRequest('Idempotency-Key header is required', '8-100 letters, digits or - _ : .; send the same key again to retry the same payment safely');
        }

        $data = Validator::validate($request->json(), [
            'amount'            => 'required|number',
            'phone'             => 'required|string',
            'reference'         => 'required|string|max:64',
            'description'       => 'string|max:100',
            'account_reference' => 'string|max:12',
        ]);
        $amount = (float) $data['amount'];
        $min = (int) Config::get('payments.min_amount', 1);
        $max = (int) Config::get('payments.max_amount', 250000);
        if (floor($amount) !== $amount || $amount < $min || $amount > $max) {
            throw HttpException::badRequest('Invalid request data', "amount must be a whole number of shillings from $min to $max");
        }
        $phone = Mpesa::normalisePhone((string) $data['phone']);
        if ($phone === null) {
            throw HttpException::badRequest('Invalid request data', 'phone must be a Safaricom mobile number, e.g. 0712345678');
        }
        $metadata = $data['metadata'] ?? null;
        if ($metadata !== null && !is_array($metadata)) {
            throw HttpException::badRequest('Invalid request data', 'metadata must be a JSON object');
        }
        $reference = trim((string) $data['reference']);
        $fingerprint = hash('sha256', (int) $amount . '|' . $phone . '|' . $reference);

        // Same key again: the same payment, not a new prompt.
        $existing = Database::one('SELECT * FROM transactions WHERE client_id = ? AND idempotency_key = ?', [$client['id'], $key]);
        if ($existing !== null) {
            return self::replay($existing, $fingerprint);
        }

        $window = (int) Config::get('payments.stk_per_phone_window', 300);
        if (!RateLimiter::hit('stk ' . $phone, (int) Config::get('payments.stk_per_phone', 3), $window)) {
            throw new HttpException(429, 'Too many payment prompts to this phone. Please wait a few minutes and try again.');
        }

        $accountRef = trim((string) ($data['account_reference'] ?? '')) ?: $reference;
        $accountRef = substr(preg_replace('/[^A-Za-z0-9\-]/', '', $accountRef) ?: 'PAYMENT', 0, 12);

        // One waiting prompt per reference: checked and inserted under a lock on
        // the client row, so two simultaneous requests can't both get through.
        try {
            $created = Database::transaction(function () use ($client, $key, $fingerprint, $reference, $amount, $phone, $accountRef, $data, $metadata) {
                Database::one('SELECT id FROM clients WHERE id = ? FOR UPDATE', [$client['id']]);
                $waiting = Database::one(
                    "SELECT * FROM transactions WHERE client_id = ? AND client_reference = ? AND status IN ('initiated', 'pending') ORDER BY id DESC LIMIT 1",
                    [$client['id'], $reference]
                );
                if ($waiting !== null) {
                    return ['waiting' => $waiting];
                }
                $id = Database::insert('transactions', [
                    'public_id'           => Crypto::id('txn'),
                    'client_id'           => $client['id'],
                    'client_reference'    => $reference,
                    'idempotency_key'     => $key,
                    'request_fingerprint' => $fingerprint,
                    'amount'              => $amount,
                    'phone'               => $phone,
                    'account_reference'   => $accountRef,
                    'description'         => trim((string) ($data['description'] ?? '')),
                    'metadata'            => $metadata === null ? null : json_encode($metadata, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
                    'status'              => 'initiated',
                    'expires_at'          => date('Y-m-d H:i:s', time() + (int) Config::get('payments.expire_after_minutes', 10) * 60),
                ]);
                Transactions::event($id, '', 'initiated', 'api', 'phone ' . Mpesa::maskPhone($phone));
                return ['id' => $id];
            });
        } catch (PDOException $e) {
            // The same Idempotency-Key arrived twice at the same moment.
            $existing = $e->getCode() === '23000'
                ? Database::one('SELECT * FROM transactions WHERE client_id = ? AND idempotency_key = ?', [$client['id'], $key])
                : null;
            if ($existing === null) {
                throw $e;
            }
            return self::replay($existing, $fingerprint);
        }
        if (isset($created['waiting'])) {
            throw new PaymentConflict('A payment prompt for this reference is still waiting. Complete or cancel it on the phone first.', $created['waiting']);
        }

        $txn = Transactions::find($created['id']);
        try {
            $push = Mpesa::driver()->stkPush([
                'phone'             => $phone,
                'amount'            => (int) $amount,
                'account_reference' => $accountRef,
                'description'       => Text::cut(trim((string) ($data['description'] ?? '')) ?: 'Payment', 13),
                'callback_url'      => self::callbackUrl(),
            ]);
        } catch (MpesaException $e) {
            $txn = self::markSendFailed($txn, 'M-Pesa refused the request: ' . $e->getMessage());
            return [422, 'M-Pesa refused the payment request: ' . $e->getMessage(), $txn];
        } catch (Throwable $e) {
            Log::write('error', "stk push failed for {$txn['public_id']}: " . $e->getMessage());
            $txn = self::markSendFailed($txn, 'Could not reach M-Pesa');
            return [503, 'M-Pesa could not be reached. Please try again in a moment.', $txn];
        }

        $txn = Database::transaction(fn () => Transactions::transition(Transactions::find($txn['id'], true), 'pending', [
            'merchant_request_id' => $push['merchant_request_id'],
            'checkout_request_id' => $push['checkout_request_id'],
            'next_query_at'       => date('Y-m-d H:i:s', time() + (int) Config::get('payments.first_query_after_seconds', 30)),
        ], 'api', 'prompt sent'));
        return [201, 'Payment prompt sent. Ask the customer to enter their M-Pesa PIN.', $txn];
    }

    /** A transaction of this client by id, checked with M-Pesa first if a check is due. */
    public static function status(array $client, string $publicId): array
    {
        $txn = Transactions::findForClient((int) $client['id'], $publicId);
        if ($txn === null) {
            throw HttpException::notFound('Payment not found');
        }
        if ($txn['status'] === 'pending' && $txn['next_query_at'] !== null && strtotime((string) $txn['next_query_at']) <= time()) {
            Verifier::check((int) $txn['id'], 'api');
            $txn = Transactions::find((int) $txn['id']);
        }
        return $txn;
    }

    /** A client's transactions for one of its references, newest first. */
    public static function forReference(array $client, string $reference): array
    {
        return Database::all(
            'SELECT * FROM transactions WHERE client_id = ? AND client_reference = ? ORDER BY id DESC LIMIT 50',
            [$client['id'], $reference]
        );
    }

    public static function callbackUrl(): string
    {
        return rtrim((string) Config::get('mpesa.callback_base_url'), '/') . '/api/v1/callbacks/mpesa/stk/' . Config::get('mpesa.callback_token');
    }

    private static function replay(array $existing, string $fingerprint): array
    {
        if (!hash_equals((string) $existing['request_fingerprint'], $fingerprint)) {
            throw new HttpException(409, 'This Idempotency-Key was already used for a different payment', 'use a new key for a new payment');
        }
        return [200, 'Same request as before: returning the existing payment.', $existing];
    }

    private static function markSendFailed(array $txn, string $reason): array
    {
        return Database::transaction(fn () => Transactions::transition(Transactions::find((int) $txn['id'], true), 'failed', [
            'result_desc' => Text::cut($reason, 255),
        ], 'api', $reason));
    }
}
