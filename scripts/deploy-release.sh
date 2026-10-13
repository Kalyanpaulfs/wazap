#!/usr/bin/env bash
# Deploy a new Wazap release to production with a database backup, a source
# backup and automatic rollback.
#
# Usage (on the server, from the live app directory):
#   ./scripts/deploy-release.sh <release-dir> [migration.sql ...]
#   DRY_RUN=1 ./scripts/deploy-release.sh <release-dir>    # show what would change, touch nothing
#
# <release-dir> is a clean copy of the new source (git checkout or SFTP upload)
# without node_modules, .next or .env. Migrations are paths inside the release
# and must be additive (IF NOT EXISTS); each runs in one transaction.
set -euo pipefail

app_dir="${WAZAP_APP_DIR:-/opt/wazap}"
backup_root="${WAZAP_BACKUP_DIR:-/opt/wazap-backups}"
site_url="${WAZAP_SITE_URL:-https://wazap.lt}"
stamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$backup_root/release-$stamp"
excludes=(--exclude node_modules --exclude '.next*' --exclude .env --exclude '.env*' --exclude .git --exclude .wa-sessions --exclude '*.log')

release_dir="${1:-}"
shift || true
migrations=("$@")

fail() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

[[ "$(pwd)" == "$app_dir" ]] || fail "Run this from $app_dir."
[[ -n "$release_dir" && -f "$release_dir/package.json" ]] || fail "Give the release folder (it must contain package.json)."
release_dir="$(cd "$release_dir" && pwd)"
[[ "$release_dir" != "$app_dir" ]] || fail "The release folder must not be the live folder."
for m in "${migrations[@]}"; do [[ -f "$release_dir/$m" ]] || fail "Migration not found in release: $m"; done
command -v pg_dump >/dev/null || fail "pg_dump is not installed."
command -v psql >/dev/null || fail "psql is not installed."

# Prisma adds ?schema=public, which psql/pg_dump do not accept.
db_url="$(grep -E '^DATABASE_URL=' "$app_dir/.env" | head -1 | cut -d= -f2- | tr -d '"' | sed 's/?.*$//')"
[[ -n "$db_url" ]] || fail "DATABASE_URL not found in $app_dir/.env."

step "Files that will change (live -> release)"
rsync -a --delete --dry-run --itemize-changes "${excludes[@]}" "$release_dir/" "$app_dir/" | grep -v '/$' || true
if [[ ${#migrations[@]} -gt 0 ]]; then echo "Migrations to run: ${migrations[*]}"; fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then echo; echo "Dry run only. Nothing was changed."; exit 0; fi
if [[ "${ASSUME_YES:-0}" != "1" ]]; then
  read -r -p "Type 'deploy' to continue: " answer
  [[ "$answer" == "deploy" ]] || fail "Cancelled."
fi

step "1/5 Database backup"
mkdir -p "$backup_dir"; chmod 700 "$backup_dir"
pg_dump --no-owner --format=custom --file="$backup_dir/db.dump" "$db_url"
[[ -s "$backup_dir/db.dump" ]] || fail "Database backup is empty. Stopping before any change."
pg_restore --list "$backup_dir/db.dump" >/dev/null || fail "Database backup is unreadable. Stopping before any change."
echo "Saved $backup_dir/db.dump ($(du -h "$backup_dir/db.dump" | cut -f1))"

step "2/5 Source backup"
rsync -a "${excludes[@]}" "$app_dir/" "$backup_dir/source/"

restore_source() {
  echo "Restoring the previous source from $backup_dir/source ..." >&2
  rsync -a --delete "${excludes[@]}" "$backup_dir/source/" "$app_dir/"
}

step "3/5 Database migrations"
for m in "${migrations[@]}"; do
  echo "Running $m"
  psql "$db_url" --set ON_ERROR_STOP=1 --single-transaction --quiet --file "$release_dir/$m" \
    || fail "Migration $m failed and was rolled back. Live source and app are unchanged."
done

step "4/5 Copy new source, build and restart"
rsync -a --delete "${excludes[@]}" "$release_dir/" "$app_dir/"
# safe-production-rebuild.sh builds outside the live folder, swaps .next and
# node_modules during a short stop, waits for /api/health and restores the old
# build by itself if the restart fails.
if ! ./scripts/safe-production-rebuild.sh; then
  restore_source
  fail "Build or restart failed. Source restored; the previous build is still serving. Backup: $backup_dir"
fi

step "5/5 Smoke checks"
ok=1
for path in / /login /pricing /api/health; do
  code="$(curl -s -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0 WazapReleaseVerification/1.0' "$site_url$path")"
  echo "$path -> $code"
  [[ "$code" == "200" ]] || ok=0
done
[[ "$ok" == "1" ]] || echo "WARNING: a page did not return 200. Check it now; rollback steps are below." >&2

cat <<EOF

Deployed. Backup: $backup_dir
Now check by hand: log in with an email code, open the CRM, check System health.

Rollback (code):     rsync -a --delete --exclude node_modules --exclude '.next*' --exclude '.env*' --exclude .git --exclude .wa-sessions --exclude '*.log' $backup_dir/source/ $app_dir/ && ./scripts/safe-production-rebuild.sh
Rollback (database): only if a migration broke data; ask before running:
                     pg_restore --clean --if-exists --no-owner -d "<DATABASE_URL>" $backup_dir/db.dump
EOF
