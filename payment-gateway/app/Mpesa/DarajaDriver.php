<?php
declare(strict_types=1);

namespace App\Mpesa;

use App\Core\Config;
use App\Core\Http;
use App\Core\Log;
use RuntimeException;

/** Safaricom Daraja: M-Pesa Express (STK Push) and its status query. */
final class DarajaDriver implements MpesaDriver
{
    private const SANDBOX = 'https://sandbox.safaricom.co.ke';
    private const LIVE    = 'https://api.safaricom.co.ke';

    /** Daraja's answer to a query while the customer hasn't finished yet. */
    private const STILL_PROCESSING = '500.001.1001';

    public function stkPush(array $p): array
    {
        $timestamp = date('YmdHis');
        $shortcode = (string) Config::get('mpesa.shortcode');
        $body = [
            'BusinessShortCode' => $shortcode,
            'Password'          => $this->password($timestamp),
            'Timestamp'         => $timestamp,
            'TransactionType'   => (string) Config::get('mpesa.transaction_type', 'CustomerPayBillOnline'),
            'Amount'            => $p['amount'],
            'PartyA'            => $p['phone'],
            'PartyB'            => ((string) Config::get('mpesa.party_b')) ?: $shortcode,
            'PhoneNumber'       => $p['phone'],
            'CallBackURL'       => $p['callback_url'],
            'AccountReference'  => $p['account_reference'],
            'TransactionDesc'   => $p['description'],
        ];
        [$status, $data] = $this->post('/mpesa/stkpush/v1/processrequest', $body);

        if ($status === 200 && (string) ($data['ResponseCode'] ?? '') === '0' && !empty($data['CheckoutRequestID'])) {
            return [
                'merchant_request_id' => (string) ($data['MerchantRequestID'] ?? ''),
                'checkout_request_id' => (string) $data['CheckoutRequestID'],
                'customer_message'    => (string) ($data['CustomerMessage'] ?? ''),
            ];
        }
        if ($status >= 500 && !isset($data['errorMessage'])) {
            throw new RuntimeException("M-Pesa is unavailable (HTTP $status)");
        }
        throw new MpesaException((string) ($data['errorMessage'] ?? $data['ResponseDescription'] ?? "M-Pesa refused the request (HTTP $status)"));
    }

    public function stkQuery(string $checkoutRequestId): array
    {
        $timestamp = date('YmdHis');
        [$status, $data] = $this->post('/mpesa/stkpushquery/v1/query', [
            'BusinessShortCode' => (string) Config::get('mpesa.shortcode'),
            'Password'          => $this->password($timestamp),
            'Timestamp'         => $timestamp,
            'CheckoutRequestID' => $checkoutRequestId,
        ]);

        if ((string) ($data['errorCode'] ?? '') === self::STILL_PROCESSING) {
            return ['state' => 'processing'];
        }
        if ($status === 200 && isset($data['ResultCode']) && is_numeric($data['ResultCode'])) {
            return ['state' => 'final', 'code' => (int) $data['ResultCode'], 'desc' => (string) ($data['ResultDesc'] ?? '')];
        }
        throw new RuntimeException('Status check gave no result: ' . ($data['errorMessage'] ?? "HTTP $status"));
    }

    /** POSTs JSON with a valid access token (renewed once if Daraja rejects it). */
    private function post(string $path, array $body, bool $retried = false): array
    {
        $response = Http::request('POST', $this->baseUrl() . $path, [
            'Authorization' => 'Bearer ' . $this->token(),
            'Content-Type'  => 'application/json',
            'Accept'        => 'application/json',
        ], json_encode($body, JSON_UNESCAPED_SLASHES), 30);

        $data = json_decode($response['body'], true);
        $data = is_array($data) ? $data : [];
        $safe = $body;
        unset($safe['Password']);
        Log::write('daraja', "POST $path → HTTP {$response['status']}", ['request' => $safe, 'response' => $data ?: substr($response['body'], 0, 300)]);

        if ($response['status'] === 401 && !$retried) {
            $this->forgetToken();
            return $this->post($path, $body, true);
        }
        return [$response['status'], $data];
    }

    /** OAuth access token, cached in storage/cache until a minute before it expires. */
    private function token(): string
    {
        $file = $this->tokenFile();
        $cached = is_file($file) ? json_decode((string) file_get_contents($file), true) : null;
        if (is_array($cached) && ($cached['expires_at'] ?? 0) > time() + 60 && !empty($cached['token'])) {
            return (string) $cached['token'];
        }

        $key = (string) Config::get('mpesa.consumer_key');
        $secret = (string) Config::get('mpesa.consumer_secret');
        if ($key === '' || $secret === '') {
            throw new RuntimeException('Daraja consumer_key / consumer_secret are not set in config.php');
        }
        $response = Http::request('GET', $this->baseUrl() . '/oauth/v1/generate?grant_type=client_credentials', [
            'Authorization' => 'Basic ' . base64_encode("$key:$secret"),
            'Accept'        => 'application/json',
        ], null, 20);
        $data = json_decode($response['body'], true);
        if ($response['status'] !== 200 || empty($data['access_token'])) {
            Log::write('daraja', "OAuth failed → HTTP {$response['status']}", ['response' => substr($response['body'], 0, 300)]);
            throw new RuntimeException("Could not sign in to Daraja (HTTP {$response['status']}). Check consumer_key and consumer_secret.");
        }
        $dir = dirname($file);
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        @file_put_contents($file, json_encode([
            'token'      => $data['access_token'],
            'expires_at' => time() + (int) ($data['expires_in'] ?? 3599),
        ]), LOCK_EX);
        @chmod($file, 0600);
        return (string) $data['access_token'];
    }

    private function forgetToken(): void
    {
        @unlink($this->tokenFile());
    }

    private function tokenFile(): string
    {
        return Config::storagePath('cache/daraja-token-' . substr(hash('sha256', (string) Config::get('mpesa.consumer_key')), 0, 16) . '.json');
    }

    private function password(string $timestamp): string
    {
        return base64_encode(Config::get('mpesa.shortcode') . Config::get('mpesa.passkey') . $timestamp);
    }

    private function baseUrl(): string
    {
        return Config::get('mpesa.driver') === 'production' ? self::LIVE : self::SANDBOX;
    }
}
