# NMTC Applicant Portal

The applicant website of Nonfric Medical Training College (`apply.nmtc.ac.ke`):
applicants register, complete their profile, apply, follow their applications,
see payments, download letters and documents, and fill in uniform measurements.

Angular 18. It talks only to the NMTC Admissions API (`../api`, PHP).

## Run locally

Use **Node 22** (or 20), via `.nvmrc`.

```bash
nvm use
npm install
npm start            # http://localhost:4300
```

Start the API too (see `../api/README.md`): `php -S 127.0.0.1:8002 -t public public/index.php`
from the `api` folder.

If a build or `npm start` crashes with `Segmentation fault` or
`fatal error: all goroutines are asleep - deadlock!`, that's the build tools
crashing on the development machine, not an error in the code. Run it again,
or start it as `GOGC=off npm start`.

## Settings

| File | Used by | `apiUrl` |
|---|---|---|
| `src/environments/environment.ts` | `npm run build` (live site) | `https://api.nmtc.ac.ke/api/v1` |
| `src/environments/environment.development.ts` | `npm start` | `http://127.0.0.1:8002/api/v1` |

`encryptSecretKey` encrypts the applicant's session in the browser. Everything
in these files ends up in the browser, so never put passwords here.

## Branding to replace

| What | File |
|---|---|
| Logo (placeholder "NMTC" badge) | `src/assets/dist/img/logo.png`: overwrite it with the real logo, keeping the name |
| Login / register background photo | `src/assets/dist/img/m5.jpg` |
| Colours | inline styles in the login/register pages and the layout header (`#003361`, `#af1379`, `#b3021c`) |

## Build and host

```bash
npm run build        # output: dist/nmtc-applicant-portal/browser/
```

Upload the contents of `dist/nmtc-applicant-portal/browser/` to the document
root of `apply.nmtc.ac.ke`. URLs use `#/applicant/...`, so the server needs no
rewrite rules. The API's `cors_allowed_origins` must include
`https://apply.nmtc.ac.ke`.
