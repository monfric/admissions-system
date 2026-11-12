# NMTC Admissions System

Admissions for Nonfric Medical Training College (NMTC), built from the LMIS
admissions module and made to run on cPanel shared hosting.

| Folder | What | Local | Live address |
|---|---|---|---|
| `portal/` | Applicant portal (Angular) | `http://localhost:4300` | `https://apply.nmtc.ac.ke` |
| `staff/` | Staff Applications app (Angular) | `http://localhost:4400` | `https://staff.nmtc.ac.ke` |
| `api/` | Backend (plain PHP + MySQL) | `http://127.0.0.1:8002` | `https://api.nmtc.ac.ke` |

See each folder's README for running it locally and deploying it.

## Deploying

```bash
bash deploy/package.sh      # with Node 22; writes deploy/out/
```

Then follow [deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md): database, subdomains,
uploads, `config.php`, the hourly cron job and the first-login checklist.
`deploy/out/nmtc-api.zip` contains the live secret keys, so keep it private.
