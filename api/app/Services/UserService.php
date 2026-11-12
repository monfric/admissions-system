<?php
declare(strict_types=1);

namespace App\Services;

use App\Core\HttpException;
use App\Core\Pagination;
use App\Repositories\UserRepository;

/**
 * Staff Users page (admins only). Every active staff user sees the whole
 * Applications module; "admin" can also manage users. An admin can't
 * deactivate, demote or delete themselves, and the last active admin can't
 * be removed.
 */
final class UserService
{
    private UserRepository $users;

    public function __construct()
    {
        $this->users = new UserRepository();
    }

    public function list(Pagination $page, ?bool $isActive, string $role): array
    {
        [$rows, $total] = $this->users->list($page, $isActive, $role);
        return $page->result(array_map([StaffAuthService::class, 'toResponse'], $rows), $total);
    }

    public function stats(): array
    {
        return array_map('intval', $this->users->stats());
    }

    public function get(int $id): array
    {
        return StaffAuthService::toResponse($this->find($id));
    }

    public function create(array $req): array
    {
        $email = strtolower(trim($req['email']));
        if ($this->users->findByEmail($email) !== null) {
            throw HttpException::badRequest('A user with this email already exists');
        }
        $id = $this->users->create([
            'email'        => $email,
            'password'     => password_hash($req['password'], PASSWORD_BCRYPT),
            'first_name'   => trim($req['first_name']),
            'last_name'    => trim($req['last_name']),
            'phone_number' => trim((string) ($req['phone_number'] ?? '')),
            'role'         => $req['role'] ?? 'staff',
            'is_active'    => ($req['is_active'] ?? true) ? 1 : 0,
        ]);
        (new PasswordResetService())->welcomeStaff($id);
        return $this->get($id);
    }

    public function update(int $id, array $req, int $currentUserId): array
    {
        $user = $this->find($id);
        $data = [];

        if (isset($req['email'])) {
            $email = strtolower(trim($req['email']));
            $existing = $this->users->findByEmail($email);
            if ($existing !== null && (int) $existing['id'] !== $id) {
                throw HttpException::badRequest('A user with this email already exists');
            }
            $data['email'] = $email;
        }
        foreach (['first_name', 'last_name', 'phone_number'] as $field) {
            if (isset($req[$field])) {
                $data[$field] = trim((string) $req[$field]);
            }
        }
        if (!empty($req['password'])) {
            $data['password'] = password_hash($req['password'], PASSWORD_BCRYPT);
        }
        if (isset($req['role']) && $req['role'] !== $user['role']) {
            if ($user['role'] === 'admin') {
                $this->guardAdminRemoval($id, $currentUserId, 'change the role of');
            }
            $data['role'] = $req['role'];
        }
        if (isset($req['is_active']) && !$req['is_active'] && (int) $user['is_active'] === 1) {
            $this->guardDeactivation($user, $currentUserId);
            $data['is_active'] = 0;
        } elseif (isset($req['is_active']) && $req['is_active']) {
            $data['is_active'] = 1;
        }

        if ($data) {
            $this->users->update($id, $data);
        }
        return $this->get($id);
    }

    public function setActive(int $id, bool $active, int $currentUserId): array
    {
        $user = $this->find($id);
        if (!$active) {
            $this->guardDeactivation($user, $currentUserId);
        }
        $this->users->update($id, ['is_active' => $active ? 1 : 0]);
        return $this->get($id);
    }

    public function delete(int $id, int $currentUserId): void
    {
        $user = $this->find($id);
        if ($id === $currentUserId) {
            throw HttpException::badRequest('You cannot delete your own account');
        }
        if ($user['role'] === 'admin') {
            $this->guardAdminRemoval($id, $currentUserId, 'delete');
        }
        $this->users->delete($id);
    }

    private function find(int $id): array
    {
        $user = $this->users->findById($id);
        if ($user === null) {
            throw HttpException::notFound('User not found');
        }
        return $user;
    }

    private function guardDeactivation(array $user, int $currentUserId): void
    {
        if ((int) $user['id'] === $currentUserId) {
            throw HttpException::badRequest('You cannot deactivate your own account');
        }
        if ($user['role'] === 'admin') {
            $this->guardAdminRemoval((int) $user['id'], $currentUserId, 'deactivate');
        }
    }

    private function guardAdminRemoval(int $id, int $currentUserId, string $action): void
    {
        if ($id === $currentUserId) {
            throw HttpException::badRequest("You cannot $action your own admin account");
        }
        if ($this->users->countOtherActiveAdmins($id) === 0) {
            throw HttpException::badRequest("You cannot $action the last active administrator");
        }
    }
}
