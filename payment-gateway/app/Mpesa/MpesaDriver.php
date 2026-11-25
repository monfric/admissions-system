<?php
declare(strict_types=1);

namespace App\Mpesa;

/** Talks to M-Pesa (Daraja) or pretends to (mock). */
interface MpesaDriver
{
    /**
     * Sends the PIN prompt to the customer's phone.
     *
     * @param array{phone:string, amount:int, account_reference:string, description:string, callback_url:string} $p
     * @return array{merchant_request_id:string, checkout_request_id:string, customer_message:string}
     * @throws MpesaException M-Pesa refused the request (bad phone, shortcode, …)
     * @throws \RuntimeException M-Pesa couldn't be reached
     */
    public function stkPush(array $p): array;

    /**
     * Asks M-Pesa for the result of a prompt (STK Query): the trusted answer.
     *
     * @return array{state:'processing'}|array{state:'final', code:int, desc:string}
     * @throws \RuntimeException M-Pesa couldn't be reached or gave no usable answer
     */
    public function stkQuery(string $checkoutRequestId): array;
}
