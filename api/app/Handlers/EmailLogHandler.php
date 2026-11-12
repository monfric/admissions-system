<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\Pagination;
use App\Core\Query;
use App\Core\Request;
use App\Core\Response;
use App\Services\EmailQueue;

/** /email-log — the admins' Email Log page: what was sent, what failed, resend. */
final class EmailLogHandler
{
    private EmailQueue $emails;

    public function __construct()
    {
        $this->emails = new EmailQueue();
    }

    public function list(Request $r): never
    {
        $status = Query::oneOf($r, 'status', ['pending', 'sent', 'failed']);
        Response::success('Emails retrieved successfully', $this->emails->list(new Pagination($r), $status));
    }

    public function stats(Request $r): never
    {
        Response::success('Email statistics retrieved successfully', $this->emails->stats());
    }

    public function show(Request $r): never
    {
        Response::success('Email retrieved successfully', $this->emails->get($r->intParam('id', 'email ID')));
    }

    public function resend(Request $r): never
    {
        Response::success('Email queued to be sent again', $this->emails->resend($r->intParam('id', 'email ID')));
    }
}
