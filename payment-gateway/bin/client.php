<?php
declare(strict_types=1);

// Manage the client systems allowed to use the gateway (run on the server or locally):
//   php bin/client.php create "NMTC Admissions" https://api.example.org/api/v1/payments/webhook
//   php bin/client.php list
//   php bin/client.php set-webhook <key_id> <url>
//   php bin/client.php rotate-secret <key_id>
//   php bin/client.php disable <key_id>   |   enable <key_id>
// The secret is shown once (create / rotate-secret): put it in the client's config.

use App\Core\Database;
use App\Services\Clients;

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Command line only.\n");
}
require __DIR__ . '/../app/bootstrap.php';

$args = array_slice($argv, 1);
$command = $args[0] ?? '';
$out = fn (string $s) => fwrite(STDOUT, $s . "\n");
$fail = function (string $s): never {
    fwrite(STDERR, $s . "\n");
    exit(1);
};
$validUrl = fn (string $u) => $u === '' || (filter_var($u, FILTER_VALIDATE_URL) && preg_match('#^https?://#', $u));
$client = function (string $keyId) use ($fail): array {
    return Clients::findByKey($keyId) ?? $fail("No client with key_id $keyId");
};

switch ($command) {
    case 'create':
        $name = trim($args[1] ?? '');
        $url = trim($args[2] ?? '');
        if ($name === '') {
            $fail('Usage: php bin/client.php create "<name>" [webhook_url]');
        }
        if (!$validUrl($url)) {
            $fail('webhook_url must start with http:// or https://');
        }
        [$row, $secret] = Clients::create($name, $url);
        $out("Created client \"{$row['name']}\"");
        $out("  client id (X-Client-Id): {$row['key_id']}");
        $out("  secret:                  $secret");
        $out("  webhook_url:             " . ($row['webhook_url'] ?: '(none)'));
        $out('Copy the secret now: it is not shown again.');
        break;

    case 'list':
        foreach (Database::all('SELECT * FROM clients ORDER BY id') as $row) {
            $out(sprintf('%-24s %-8s %-28s %s', $row['key_id'], $row['is_active'] ? 'active' : 'DISABLED', $row['name'], $row['webhook_url'] ?: '(no webhook)'));
        }
        break;

    case 'set-webhook':
        $row = $client($args[1] ?? '');
        $url = trim($args[2] ?? '');
        if (!$validUrl($url)) {
            $fail('webhook_url must start with http:// or https://');
        }
        Database::update('clients', (int) $row['id'], ['webhook_url' => $url]);
        $out("Webhook for {$row['name']} set to " . ($url ?: '(none)'));
        break;

    case 'rotate-secret':
        $row = $client($args[1] ?? '');
        $out("New secret for {$row['name']}: " . Clients::rotateSecret((int) $row['id']));
        $out('The old secret no longer works. Update the client config now.');
        break;

    case 'disable':
    case 'enable':
        $row = $client($args[1] ?? '');
        Database::update('clients', (int) $row['id'], ['is_active' => $command === 'enable']);
        $out("{$row['name']} {$command}d");
        break;

    default:
        $fail("Commands: create, list, set-webhook, rotate-secret, disable, enable (see the top of bin/client.php)");
}
