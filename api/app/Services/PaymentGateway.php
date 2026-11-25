<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Http;
use App\Core\Request;
use RuntimeException;

/**
 * The central Payment Gateway, as this system's client: signed requests out,
 * signature-checked webhooks in. Settings: config 'payment_gateway'.
 */
final class PaymentGateway
{
    public static function enabled(): bool
    {
        return (bool) Config::get('payment_gateway.enabled', false)
            && Config::get('payment_gateway.base_url') && Config::get('payment_gateway.client_id') && Config::get('payment_gateway.client_secret');
    }

    /**
     * Starts an STK Push.
     * @return array{status:int, body:array} the gateway's HTTP status and JSON
     * @throws RuntimeException the gateway couldn't be reached
     */
    public static function startStk(array $payload, string $idempotencyKey): array
    {
        return self::call('POST', '/payments/stk', $payload, ['Idempotency-Key' => $idempotencyKey]);
    }

    /** One gateway transaction (the gateway checks with M-Pesa first if a check is due). */
    public static function get(string $gatewayId): array
    {
        return self::call('GET', '/payments/' . rawurlencode($gatewayId));
    }

    /** True when a webhook really comes from the gateway (signature and a recent timestamp). */
    public static function verifyWebhook(Request $request): bool
    {
        $timestamp = (string) $request->header('X-Gateway-Timestamp');
        $signature = strtolower((string) $request->header('X-Gateway-Signature'));
        if (!ctype_digit($timestamp) || $signature === '' || abs(time() - (int) $timestamp) > 300) {
            return false;
        }
        $raw = (string) file_get_contents('php://input');
        $expected = hash_hmac('sha256', $timestamp . '.' . $raw, (string) Config::get('payment_gateway.client_secret'));
        return hash_equals($expected, $signature);
    }

    private static function call(string $method, string $path, ?array $body = null, array $headers = []): array
    {
        $raw = $body === null ? '' : json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $timestamp = (string) time();
        [$pathOnly, $query] = array_pad(explode('?', $path, 2), 2, '');
        $canonical = implode("\n", [$timestamp, $method, $pathOnly, $query, hash('sha256', $raw)]);
        $response = Http::request($method, rtrim((string) Config::get('payment_gateway.base_url'), '/') . $path, $headers + [
            'Content-Type' => 'application/json',
            'Accept'       => 'application/json',
            'X-Client-Id'  => (string) Config::get('payment_gateway.client_id'),
            'X-Timestamp'  => $timestamp,
            'X-Signature'  => hash_hmac('sha256', $canonical, (string) Config::get('payment_gateway.client_secret')),
        ], $body === null ? null : $raw, (int) Config::get('payment_gateway.timeout_seconds', 20));

        $data = json_decode($response['body'], true);
        if (!is_array($data)) {
            throw new RuntimeException("Payment gateway gave an unreadable answer (HTTP {$response['status']})");
        }
        return ['status' => $response['status'], 'body' => $data];
    }
}
