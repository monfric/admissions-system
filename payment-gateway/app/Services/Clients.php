<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\Config;
use App\Core\Crypto;
use App\Core\Database;
use App\Core\HttpException;
use App\Core\Request;
use Throwable;

/** Client systems: their keys, and checking the signature on each request. */
final class Clients
{
    /** Middleware: the request must be signed by an active client (see README "Signing requests"). */
    public static function auth(): callable
    {
        return function (Request $request): void {
            $keyId = (string) $request->header('X-Client-Id');
            $timestamp = (string) $request->header('X-Timestamp');
            $signature = strtolower((string) $request->header('X-Signature'));
            if ($keyId === '' || $timestamp === '' || $signature === '') {
                throw HttpException::unauthorized('Missing X-Client-Id, X-Timestamp or X-Signature header');
            }
            $tolerance = (int) Config::get('signature_tolerance_seconds', 300);
            if (!ctype_digit($timestamp) || abs(time() - (int) $timestamp) > $tolerance) {
                throw HttpException::unauthorized('Request timestamp is missing or too far from the gateway clock');
            }
            $client = Database::one('SELECT * FROM clients WHERE key_id = ? AND is_active = 1', [$keyId]);
            if ($client === null) {
                throw HttpException::unauthorized('Unknown or disabled client');
            }
            $canonical = Crypto::requestCanonical($timestamp, $request->method, $request->path, $request->queryString(), $request->raw());
            if (!hash_equals(Crypto::sign($canonical, self::secret($client)), $signature)) {
                throw HttpException::unauthorized('Invalid signature');
            }
            $request->client = $client;
        };
    }

    /**
     * Adds a client system. The secret is returned only here: store it in the
     * client's own config; the gateway keeps it encrypted.
     *
     * @return array{0: array, 1: string} [client row, secret]
     */
    public static function create(string $name, string $webhookUrl): array
    {
        $secret = bin2hex(random_bytes(32));
        $id = Database::insert('clients', [
            'name'             => $name,
            'key_id'           => Crypto::id('cl', 10),
            'secret_encrypted' => Crypto::encrypt($secret),
            'webhook_url'      => $webhookUrl,
        ]);
        return [self::find($id), $secret];
    }

    /** Replaces a client's secret; the old one stops working at once. */
    public static function rotateSecret(int $id): string
    {
        $secret = bin2hex(random_bytes(32));
        Database::update('clients', $id, ['secret_encrypted' => Crypto::encrypt($secret)]);
        return $secret;
    }

    public static function find(int $id): ?array
    {
        return Database::one('SELECT * FROM clients WHERE id = ?', [$id]);
    }

    public static function findByKey(string $keyId): ?array
    {
        return Database::one('SELECT * FROM clients WHERE key_id = ?', [$keyId]);
    }

    public static function secret(array $client): string
    {
        try {
            return Crypto::decrypt((string) $client['secret_encrypted']);
        } catch (Throwable $e) {
            throw new HttpException(500, 'Client secret could not be read', $e->getMessage());
        }
    }
}
