<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Database;
use App\Core\Text;
use App\Core\Log;
use App\Mpesa\Mpesa;
use Throwable;

/**
 * Decides a transaction's result. The rule: only M-Pesa's own status check
 * (STK Query) settles whether a payment succeeded. A callback is a hint that
 * triggers the check and supplies the receipt details; on its own it never
 * marks anything paid, so a forged callback can't either.
 */
final class Verifier
{
    /** Checks one transaction with M-Pesa and applies the answer. Returns what happened. */
    public static function check(int $txnId, string $source): string
    {
        $txn = Transactions::find($txnId);
        if ($txn === null) {
            return 'transaction not found';
        }
        if (self::canFillReceipt($txn)) {
            return self::fillReceipt($txnId, $source);
        }
        if (!in_array($txn['status'], ['pending', 'expired'], true) || $txn['checkout_request_id'] === null) {
            return 'already ' . $txn['status'];
        }

        // Ask M-Pesa outside the database lock: it can take seconds.
        try {
            $answer = Mpesa::driver()->stkQuery((string) $txn['checkout_request_id']);
            $error = null;
        } catch (Throwable $e) {
            $answer = null;
            $error = $e->getMessage();
            Log::write('verify', "query failed for {$txn['public_id']}: $error");
        }

        return Database::transaction(function () use ($txnId, $source, $answer, $error): string {
            $txn = Transactions::find($txnId, true);
            if (!in_array($txn['status'], ['pending', 'expired'], true)) {
                return 'already ' . $txn['status']; // another request settled it meanwhile
            }
            $attempts = (int) $txn['query_attempts'] + 1;
            $schedule = [
                'query_attempts'   => $attempts,
                'next_query_at'    => Transactions::nextQueryAt($txn, $attempts),
                'last_query_error' => Text::cut((string) $error, 255),
            ];

            if ($answer === null || $answer['state'] === 'processing') {
                if ($txn['status'] === 'pending' && time() >= strtotime((string) $txn['expires_at'])) {
                    Transactions::transition($txn, 'expired', $schedule, $source, 'no result from M-Pesa in time', 'payment.failed');
                    return 'expired (still checking for a late result)';
                }
                Database::update('transactions', $txnId, $schedule);
                return $answer === null ? 'status check failed, will retry' : 'still waiting for the customer';
            }

            $code = $answer['code'];
            if ($code === 0) {
                return self::markPaid($txn, $answer['desc'], $source);
            }
            if ($txn['status'] === 'expired') {
                // The client was already told it failed; just keep the real reason.
                Database::update('transactions', $txnId, ['result_code' => $code, 'result_desc' => Text::cut($answer['desc'], 255), 'next_query_at' => null] + $schedule);
                Transactions::event($txnId, 'expired', 'expired', $source, "M-Pesa result $code: {$answer['desc']}");
                return "expired; M-Pesa says $code";
            }
            $status = Mpesa::statusFor($code);
            Transactions::transition($txn, $status, [
                'result_code'   => $code,
                'result_desc'   => Text::cut($answer['desc'], 255),
                'next_query_at' => null,
            ] + $schedule, $source, "M-Pesa result $code", 'payment.failed');
            return $status;
        });
    }

    /** Success confirmed by M-Pesa: record it with whatever the callback told us. */
    private static function markPaid(array $txn, string $desc, string $source): string
    {
        $fromCallback = $txn['cb_result_code'] !== null && (int) $txn['cb_result_code'] === 0;
        $flags = (string) $txn['flags'];
        $receipt = $fromCallback ? $txn['cb_receipt'] : null;
        if ($receipt !== null && self::receiptTaken((string) $receipt, (int) $txn['id'])) {
            $flags = Transactions::withFlag($flags, 'duplicate_receipt');
            $receipt = null;
        }
        if ($receipt === null) {
            $flags = Transactions::withFlag($flags, 'receipt_pending');
        }
        $paidAmount = $fromCallback && $txn['cb_amount'] !== null ? (float) $txn['cb_amount'] : (float) $txn['amount'];
        if (abs($paidAmount - (float) $txn['amount']) > 0.001) {
            $flags = Transactions::withFlag($flags, 'amount_mismatch');
        }
        if ($txn['status'] === 'expired') {
            $flags = Transactions::withFlag($flags, 'late');
        }

        Transactions::transition($txn, 'success', [
            'result_code'      => 0,
            'result_desc'      => Text::cut($desc, 255),
            'mpesa_receipt'    => $receipt,
            'paid_amount'      => $paidAmount,
            'paid_phone'       => $fromCallback && $txn['cb_phone'] ? $txn['cb_phone'] : $txn['phone'],
            'paid_at'          => $fromCallback && $txn['cb_transaction_date'] ? $txn['cb_transaction_date'] : Database::now(),
            'verified_by'      => $fromCallback ? 'callback+query' : 'query',
            'flags'            => $flags,
            'next_query_at'    => null,
            'last_query_error' => '',
            'query_attempts'   => (int) $txn['query_attempts'] + 1,
        ], $source, 'confirmed by M-Pesa status check' . ($receipt ? " ($receipt)" : ''), 'payment.succeeded');
        return 'success';
    }

    /** Paid, but the receipt number only arrived later (a late or retried callback). */
    private static function canFillReceipt(array $txn): bool
    {
        return $txn['status'] === 'success' && $txn['mpesa_receipt'] === null
            && $txn['cb_result_code'] !== null && (int) $txn['cb_result_code'] === 0 && $txn['cb_receipt'] !== null;
    }

    private static function fillReceipt(int $txnId, string $source): string
    {
        return Database::transaction(function () use ($txnId, $source): string {
            $txn = Transactions::find($txnId, true);
            if (!self::canFillReceipt($txn)) {
                return 'already ' . $txn['status'];
            }
            $receipt = (string) $txn['cb_receipt'];
            if (self::receiptTaken($receipt, $txnId)) {
                Database::update('transactions', $txnId, ['flags' => Transactions::withFlag((string) $txn['flags'], 'duplicate_receipt')]);
                return 'receipt already used by another transaction';
            }
            $flags = implode(',', array_diff(Transactions::flags($txn), ['receipt_pending']));
            $fields = ['mpesa_receipt' => $receipt, 'flags' => $flags, 'verified_by' => 'callback+query'];
            if ($txn['cb_amount'] !== null) {
                $fields['paid_amount'] = (float) $txn['cb_amount'];
                if (abs((float) $txn['cb_amount'] - (float) $txn['amount']) > 0.001) {
                    $fields['flags'] = Transactions::withFlag($flags, 'amount_mismatch');
                }
            }
            if ($txn['cb_phone']) {
                $fields['paid_phone'] = $txn['cb_phone'];
            }
            if ($txn['cb_transaction_date']) {
                $fields['paid_at'] = $txn['cb_transaction_date'];
            }
            Transactions::transition($txn, 'success', $fields, $source, "receipt $receipt received", 'payment.updated');
            return 'receipt filled in';
        });
    }

    private static function receiptTaken(string $receipt, int $txnId): bool
    {
        return Database::value('SELECT id FROM transactions WHERE mpesa_receipt = ? AND id <> ?', [$receipt, $txnId]) !== null;
    }
}
