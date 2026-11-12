<?php
declare(strict_types=1);

namespace App\Handlers;

use App\Core\HttpException;
use App\Core\Pagination;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\UserService;

/** /users/... — the Staff Users page (admins only). */
final class UserHandler
{
    private UserService $users;

    public function __construct()
    {
        $this->users = new UserService();
    }

    public function list(Request $request): never
    {
        $isActive = $request->query('is_active');
        if ($isActive !== null && !in_array($isActive, ['true', 'false'], true)) {
            throw HttpException::badRequest('Invalid query parameters', 'is_active must be true or false');
        }
        $role = (string) $request->query('role', '');
        if ($role !== '' && !in_array($role, ['admin', 'staff'], true)) {
            throw HttpException::badRequest('Invalid query parameters', 'role must be admin or staff');
        }
        $result = $this->users->list(new Pagination($request), $isActive === null ? null : $isActive === 'true', $role);
        Response::success('Users retrieved successfully', $result);
    }

    public function stats(Request $request): never
    {
        Response::success('User statistics retrieved successfully', $this->users->stats());
    }

    public function show(Request $request): never
    {
        Response::success('User retrieved successfully', $this->users->get($request->intParam('id', 'user ID')));
    }

    public function create(Request $request): never
    {
        $req = Validator::validate($request->json(), [
            'email'        => 'required|string|email|max:100',
            'password'     => 'required|string|min:8|max:72',
            'first_name'   => 'required|string|max:100',
            'last_name'    => 'required|string|max:100',
            'phone_number' => 'string|max:20',
            'role'         => 'string|oneof:admin,staff',
            'is_active'    => 'bool',
        ]);
        Validator::digitsOnly(['Phone number' => $req['phone_number'] ?? '']);
        Response::created('User created successfully', $this->users->create($req));
    }

    public function update(Request $request): never
    {
        $req = Validator::validate($request->json(), [
            'email'        => 'string|email|max:100',
            'password'     => 'string|min:8|max:72',
            'first_name'   => 'string|max:100',
            'last_name'    => 'string|max:100',
            'phone_number' => 'string|max:20',
            'role'         => 'string|oneof:admin,staff',
            'is_active'    => 'bool',
        ]);
        Validator::digitsOnly(['Phone number' => $req['phone_number'] ?? '']);
        $user = $this->users->update($request->intParam('id', 'user ID'), $req, $request->userId);
        Response::success('User updated successfully', $user);
    }

    public function activate(Request $request): never
    {
        $user = $this->users->setActive($request->intParam('id', 'user ID'), true, $request->userId);
        Response::success('User activated successfully', $user);
    }

    public function deactivate(Request $request): never
    {
        $user = $this->users->setActive($request->intParam('id', 'user ID'), false, $request->userId);
        Response::success('User deactivated successfully', $user);
    }

    public function delete(Request $request): never
    {
        $this->users->delete($request->intParam('id', 'user ID'), $request->userId);
        Response::success('User deleted successfully');
    }
}
