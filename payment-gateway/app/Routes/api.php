<?php
declare(strict_types=1);

use App\Core\RateLimiter;
use App\Core\Router;
use App\Handlers\CallbackHandler;
use App\Handlers\HealthHandler;
use App\Handlers\PaymentHandler;
use App\Services\Clients;

// All paths are under /api/v1.
return function (Router $r): void {
    $r->get('/health', [HealthHandler::class, 'check']);

    // Client systems (signed requests).
    $r->group('/payments', [RateLimiter::middleware(120, 60), Clients::auth()], function (Router $r): void {
        $r->post('/stk', [PaymentHandler::class, 'stk']);
        $r->get('', [PaymentHandler::class, 'index']);
        $r->get('/:id', [PaymentHandler::class, 'show']);
    });

    // Safaricom (secret token in the path + IP allowlist).
    $r->post('/callbacks/mpesa/stk/:token', [CallbackHandler::class, 'stk'], [RateLimiter::middleware(300, 60)]);
};
