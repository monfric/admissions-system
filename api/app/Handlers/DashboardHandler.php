<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Query;
use App\Core\Request;
use App\Core\Response;
use App\Services\DashboardService;

/** GET /dashboard/stats — the staff Dashboard (landing page). */
final class DashboardHandler
{
    /** ?intake_id=N for one intake; absent or 0 = all intakes. */
    public function stats(Request $r): never
    {
        $dashboard = new DashboardService();
        $intakeId = Query::int($r, 'intake_id') ?: null;
        $stats = $dashboard->stats($intakeId, $r->userRole === 'admin');
        Response::success('Dashboard statistics retrieved successfully', ['intakes' => $dashboard->intakes()] + $stats);
    }
}
