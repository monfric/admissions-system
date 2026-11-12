#!/usr/bin/env bash
# Builds everything and writes the files to upload to cPanel into deploy/out/:
#
#   nmtc-api.zip        → extract into /home/USERNAME/nmtc-api        (API: code, settings, storage)
#   apply.zip           → extract into the document root of apply.nmtc.ac.ke   (applicant portal)
#   staff.zip           → extract into the document root of staff.nmtc.ac.ke   (staff app)
#   nmtc-database.sql   → import once in phpMyAdmin
#
# nmtc-api.zip contains a ready-made app/config.php with new random secret keys.
# Only the database name, user and password still need filling in on the server.
# Keep the zip private: it contains those keys.
#
# Usage (from the admissions-system folder):   bash deploy/package.sh
# Needs: PHP, zip, and Node 22 (nvm use 22) for the Angular builds.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/deploy/out"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

rm -rf "$OUT"
mkdir -p "$OUT"

build_angular() {
  local dir=$1
  echo "▶ Building $dir …"
  # GOGC=off works around esbuild crashes seen on some machines.
  (cd "$ROOT/$dir" && GOGC=off npx ng build --configuration production >/dev/null)
}

static_site() {
  local name=$1 dist=$2
  mkdir -p "$WORK/$name"
  cp -r "$ROOT/$dist/." "$WORK/$name/"
  # Always fetch a fresh index.html, so visitors get new versions straight away
  # (the other files have content hashes in their names).
  cat > "$WORK/$name/.htaccess" <<'EOF'
Options -Indexes
<IfModule mod_headers.c>
  <Files "index.html">
    Header set Cache-Control "no-cache, no-store, must-revalidate"
  </Files>
</IfModule>
EOF
  (cd "$WORK/$name" && zip -qr "$OUT/$name.zip" .)
  echo "✔ $name.zip"
}

# ── Angular apps ─────────────────────────────────────────────────────────────
build_angular portal
build_angular staff
static_site apply portal/dist/nmtc-applicant-portal/browser
static_site staff staff/dist/nmtc-staff/browser

# ── API ──────────────────────────────────────────────────────────────────────
API="$WORK/nmtc-api"
mkdir -p "$API"
cp -r "$ROOT/api/app" "$ROOT/api/public" "$ROOT/api/assets" "$ROOT/api/cron" "$API/"
rm -f "$API/app/config.php"
mkdir -p "$API/database" "$API/storage/uploads" "$API/storage/ratelimit" "$API/storage/fonts/unifont" "$API/storage/logs"
cp "$ROOT/api/database/schema.sql" "$API/database/"
cp -r "$ROOT/api/database/migrations" "$API/database/"
cp "$ROOT/api/storage/.htaccess" "$API/storage/"
cp "$ROOT/api/database/.htaccess" "$API/database/"
cp "$ROOT/api/README.md" "$API/"
touch "$API/storage/uploads/.gitkeep" "$API/storage/ratelimit/.gitkeep" "$API/storage/fonts/unifont/.gitkeep" "$API/storage/logs/.gitkeep"

# Production settings with new random keys.
JWT=$(php -r 'echo bin2hex(random_bytes(32));')
APPLICANT_JWT=$(php -r 'echo bin2hex(random_bytes(32));')
php -r '
  $s = file_get_contents($argv[1]);
  $s = str_replace("replace-with-a-long-random-string", $argv[2], $s);
  $s = str_replace("\x27applicant_jwt_secret\x27 => \x27\x27", "\x27applicant_jwt_secret\x27 => \x27" . $argv[3] . "\x27", $s);
  // Only the live sites may call the live API.
  $s = preg_replace("#\s*\x27http://localhost:\d+\x27,[^\n]*#", "", $s);
  file_put_contents($argv[4], $s);
' "$ROOT/api/app/config.example.php" "$JWT" "$APPLICANT_JWT" "$API/app/config.php"

(cd "$API" && zip -qr "$OUT/nmtc-api.zip" .)
echo "✔ nmtc-api.zip"

cp "$ROOT/api/database/schema.sql" "$OUT/nmtc-database.sql"
cp "$ROOT/deploy/DEPLOYMENT.md" "$OUT/"
echo "✔ nmtc-database.sql"
echo
echo "Done. Upload the files in $OUT as described in DEPLOYMENT.md."
