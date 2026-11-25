<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Config;
use App\Core\Log;
use App\Core\Request;
use App\Core\Response;
use App\Services\Callbacks;

/** Where Safaricom sends STK results: /callbacks/mpesa/stk/<callback_token>. */
final class CallbackHandler
{
    /** POST /callbacks/mpesa/stk/:token */
    public function stk(Request $request): never
    {
        $ip = $request->ip();
        $token = (string) ($request->params['token'] ?? '');
        if (!hash_equals((string) Config::get('mpesa.callback_token'), $token)) {
            Log::write('security', 'callback with wrong token refused', ['ip' => $ip]);
            Response::error(404, 'Route not found'); // reveal nothing
        }
        if (Config::get('mpesa.enforce_ip_allowlist', true) && !in_array($ip, (array) Config::get('mpesa.allowed_ips', []), true)) {
            Log::write('security', 'callback from an address outside the Safaricom allowlist refused', ['ip' => $ip]);
            Response::error(403, 'Forbidden');
        }

        Callbacks::receive($request->raw(), $ip);
        // The answer Daraja expects, whatever happened: the result is settled by
        // the gateway's own status check, so Safaricom never needs to resend.
        Response::json(200, ['ResultCode' => 0, 'ResultDesc' => 'Accepted']);
    }
}
