<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Log;
use App\Core\Text;
use Throwable;

/**
 * M-Pesa's STK callbacks. Each one is saved exactly as received before
 * anything else, then processed: its details are stored on the transaction
 * and the result is confirmed with M-Pesa (see Verifier).
 */
final class Callbacks
{
    /** Saves and processes one callback. Never throws: Safaricom always gets "Accepted". */
    public static function receive(string $raw, string $ip): void
    {
        try {
            $id = Database::insert('mpesa_callbacks', ['type' => 'stk', 'ip' => $ip, 'raw_body' => $raw]);
        } catch (Throwable $e) {
            // Can't even save it: keep it in the log so it can be recovered by hand.
            Log::write('error', 'callback could not be saved: ' . $e->getMessage(), ['ip' => $ip, 'raw' => $raw]);
            return;
        }
        self::process($id);
    }

    /** Processes a saved callback (again, if an earlier attempt failed). */
    public static function process(int $callbackId): void
    {
        $cb = Database::one('SELECT * FROM mpesa_callbacks WHERE id = ?', [$callbackId]);
        if ($cb === null) {
            return;
        }
        try {
            [$status, $outcome, $txnId] = self::handle($cb);
        } catch (Throwable $e) {
            Log::write('error', "callback $callbackId failed: " . $e->getMessage());
            [$status, $outcome, $txnId] = ['error', $e->getMessage(), null];
        }
        Database::update('mpesa_callbacks', $callbackId, [
            'status'         => $status,
            'outcome'        => Text::cut((string) $outcome, 255),
            'attempts'       => (int) $cb['attempts'] + 1,
            'transaction_id' => $txnId,
        ]);
    }

    /** @return array{0:string, 1:string, 2:?int} [status, outcome, transaction id] */
    private static function handle(array $cb): array
    {
        $data = json_decode((string) $cb['raw_body'], true);
        $stk = is_array($data) ? ($data['Body']['stkCallback'] ?? null) : null;
        if (!is_array($stk) || empty($stk['CheckoutRequestID']) || !isset($stk['ResultCode']) || !is_numeric($stk['ResultCode'])) {
            return ['invalid', 'not an STK callback', null];
        }
        $checkout = (string) $stk['CheckoutRequestID'];
        $code = (int) $stk['ResultCode'];
        Database::update('mpesa_callbacks', (int) $cb['id'], ['checkout_request_id' => Text::cut($checkout, 64), 'result_code' => $code]);

        $txn = Transactions::findByCheckout($checkout);
        if ($txn === null) {
            return ['unknown', 'no transaction with this CheckoutRequestID', null];
        }
        $txnId = (int) $txn['id'];
        $meta = self::metadata($stk['CallbackMetadata']['Item'] ?? []);

        // Keep what the callback says, unless the transaction is fully settled already.
        $saved = Database::transaction(function () use ($txnId, $code, $meta): bool {
            $txn = Transactions::find($txnId, true);
            $open = in_array($txn['status'], ['initiated', 'pending', 'expired'], true)
                || ($txn['status'] === 'success' && $txn['mpesa_receipt'] === null);
            if (!$open) {
                return false;
            }
            Database::update('transactions', $txnId, [
                'cb_result_code'      => $code,
                'cb_receipt'          => $code === 0 ? $meta['receipt'] : null,
                'cb_amount'           => $code === 0 ? $meta['amount'] : null,
                'cb_phone'            => $code === 0 ? $meta['phone'] : null,
                'cb_transaction_date' => $code === 0 ? $meta['date'] : null,
                'cb_received_at'      => Database::now(),
            ]);
            return true;
        });
        if (!$saved) {
            return ['duplicate', 'transaction already ' . $txn['status'] . '; callback ignored', $txnId];
        }
        return ['processed', 'callback says ' . $code . '; ' . Verifier::check($txnId, 'callback'), $txnId];
    }

    /** Amount, receipt, phone and date from the callback's Item list. */
    private static function metadata(mixed $items): array
    {
        $values = [];
        foreach (is_array($items) ? $items : [] as $item) {
            if (is_array($item) && isset($item['Name'])) {
                $values[(string) $item['Name']] = $item['Value'] ?? null;
            }
        }
        $date = null;
        if (isset($values['TransactionDate']) && preg_match('/^\d{14}$/', (string) $values['TransactionDate'])) {
            $parsed = \DateTime::createFromFormat('YmdHis', (string) $values['TransactionDate']);
            $date = $parsed ? $parsed->format('Y-m-d H:i:s') : null;
        }
        $receipt = isset($values['MpesaReceiptNumber']) ? strtoupper(trim((string) $values['MpesaReceiptNumber'])) : '';
        return [
            'amount'  => isset($values['Amount']) && is_numeric($values['Amount']) ? (float) $values['Amount'] : null,
            'receipt' => preg_match('/^[A-Z0-9]{6,20}$/', $receipt) ? $receipt : null,
            'phone'   => isset($values['PhoneNumber']) ? Text::cut(preg_replace('/\D/', '', (string) $values['PhoneNumber']) ?? '', 15) : null,
            'date'    => $date,
        ];
    }
}
