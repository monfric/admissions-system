# NMTC Staff App

The staff side of the Nonfric Medical Training College admissions system
(`staff.nmtc.ac.ke`). It is the LMIS Registration → Applications module, plus
the academic structure it depends on and staff user management:

- **Applications:** New Applicants, Unpaid, Paid, Notified, Approved, Recalled and
  Rejected Applications, Offer Letters, Application Documents, Uniform
  Measurements, Applications Reports, Intakes.
- **Academic Structure:** Faculties, Departments, Training Levels, Programmes.
- **Staff Users** (administrators only), Change Password, Logout.

Every logged-in staff member can use everything except Staff Users.

Angular 18. It talks only to the NMTC Admissions API (`../api`, PHP).

## Run locally

Use **Node 22** (or 20), via `.nvmrc`.

```bash
nvm use
npm install
npm start            # http://localhost:4400  (the LMIS staff app keeps 4200)
```

Start the API too, from the `api` folder: `php -S 127.0.0.1:8002 -t public public/index.php`.
First login: `admin@nmtc.ac.ke` / `ChangeMe@2026`. Change it from the sidebar
(**Change Password**) straight away.

If a build or `npm start` crashes with `Segmentation fault` or
`fatal error: all goroutines are asleep - deadlock!`, that's the build tools
crashing on the development machine, not an error in the code. Run it again,
or start it as `GOGC=off npm start`.

## Settings

| File | Used by | `apiUrl` |
|---|---|---|
| `src/environments/environment.ts` | `npm run build` (live site) | `https://api.nmtc.ac.ke/api/v1` |
| `src/environments/environment.development.ts` | `npm start` | `http://127.0.0.1:8002/api/v1` |

## Branding to replace

Logo: `src/assets/dist/img/logo.png` (placeholder). Overwrite it, keeping the name.

## Build and host

```bash
npm run build        # output: dist/nmtc-staff/browser/
```

Upload the contents of `dist/nmtc-staff/browser/` to the document root of
`staff.nmtc.ac.ke`. URLs use `#/...`, so no rewrite rules are needed. The API's
`cors_allowed_origins` must include `https://staff.nmtc.ac.ke`.

## Where the code came from

The pages, dialogs, services and models under `features/registration/applications`,
`features/admin/{faculty,departments,training-level,programme}`, `core/` and
`shared/` are copies of the LMIS staff frontend, with the same folder layout.
New for NMTC: `core/services/auth/auth.service.ts` (simple staff login),
`core/guards`, `core/interceptors`, `layout/`, `features/users/`,
`features/auth/change-password-dialog/`, and the sidebar.
