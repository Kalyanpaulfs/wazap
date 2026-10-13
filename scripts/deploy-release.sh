#!/usr/bin/env bash
# Deploy a new Wazap release to production with a database backup, a code
# backup and automatic rollback. Written for the restricted wazap-paul account:
# app in /wazap, PM2 wrapper that only allows `pm2 restart wazap`, pg_dump
# wrapper that only dumps the wazap database.
#
# Usage (on the server):
#   DRY_RUN=1 ./deploy-release.sh <release-dir>               # show what would change, touch nothing
#   ./deploy-release.sh <release-dir> [migration.sql ...]
#
# <release-dir> is a clean copy of the new source (git checkout or unpacked
# `git archive`), without node_modules, .next or .env. Migrations are paths
# inside the release; they must be additive (IF NOT EXISTS). The runtime DB
# role cannot change tables, so migrations go through the `wazap-migrate`
# wrapper (if the server admin installed it) or must be run by the admin first,
# then pass MIGRATIONS_APPLIED=1.
set -euo pipefail

app_dir="${WAZAP_APP_DIR:-/wazap}"
backup_root="${WAZAP_BACKUP_DIR:-$HOME/backups}"
build_root="${WAZAP_BUILD_DIR:-$HOME/releases}"
health_url="${WAZAP_HEALTH_URL:-http://127.0.0.1:5000}"
keep_backups="${KEEP_BACKUPS:-2}"
stamp="$(date +%Y%m%d-%H%M%S)"
backup_dir="$backup_root/release-$stamp"
stage_dir="$build_root/build-$stamp"
excludes=(--exclude node_modules --exclude '.next*' --exclude .env --exclude '.env*' --exclude .git --exclude .wa-sessions --exclude '*.log')
# Live-only files that are not in git and must never be deleted by a deploy:
# search-engine/Pinterest verification files, runtime data and ops records.
protect=(--filter 'P /public/**' --filter 'P /operations/**' --filter 'P /data/**' --filter 'P /ops/**' --filter 'P /*.zip')

release_dir="${1:-}"
shift || true
migrations=("$@")

fail() { echo "ERROR: $*" >&2; exit 1; }
step() { echo; echo "==> $*"; }

# ---- Checks (nothing is changed here) ----
[[ -n "$release_dir" && -f "$release_dir/package.json" ]] || fail "Give the release folder (it must contain package.json)."
release_dir="$(cd "$release_dir" && pwd)"
[[ "$release_dir" != "$app_dir" ]] || fail "The release folder must not be the live folder."
[[ -f "$app_dir/.env" ]] || fail "$app_dir/.env not found."
if grep -rlI --include='*.ts' --include='*.tsx' --include='*.sh' --include='*.json' $'\r' "$release_dir" 2>/dev/null | head -1 | grep -q .; then
  fail "Release has Windows (CRLF) line endings. Make it with: git -c core.autocrlf=false archive --format=tar.gz -o release.tar.gz HEAD"
fi
for m in "${migrations[@]}"; do [[ -f "$release_dir/$m" ]] || fail "Migration not found in release: $m"; done
free_kb="$(df -k --output=avail "$HOME" | tail -1 | tr -d ' ')"
[[ "$free_kb" -gt 4194304 ]] || fail "Less than 4 GB free disk. Clean old backups first."
curl -fsS -m 10 "$health_url/api/health" 2>/dev/null | grep -q '"process":"ready"' || fail "The live app is not healthy right now. Not deploying on top of a broken app."

step "Files that will change (live -> release, content only)"
changes="$(rsync -rnc --delete --itemize-changes "${excludes[@]}" "${protect[@]}" "$release_dir/" "$app_dir/" | grep -v '/$' || true)"
echo "$changes" | grep '^\*deleting' | grep -vE '/\._|^\*deleting +\._|\.bak' || true
echo "$changes" | grep -E '^>f' | sed 's/^[^ ]* //' || true
echo "Summary: $(echo "$changes" | grep -c '^>f' || true) new/changed, $(echo "$changes" | grep -c '^\*deleting' || true) deleted (Mac ._ files and .bak copies hidden above)."
if [[ ${#migrations[@]} -gt 0 ]]; then echo "Migrations: ${migrations[*]} (applied already: ${MIGRATIONS_APPLIED:-0})"; fi

if [[ "${DRY_RUN:-0}" == "1" ]]; then echo; echo "Dry run only. Nothing was changed."; exit 0; fi
if [[ ${#migrations[@]} -gt 0 && "${MIGRATIONS_APPLIED:-0}" != "1" ]] && ! command -v wazap-migrate >/dev/null; then
  fail "Migrations need table-owner rights. Ask the server admin to run: ${migrations[*]} (or install wazap-migrate), then re-run with MIGRATIONS_APPLIED=1."
fi
if [[ "${ASSUME_YES:-0}" != "1" ]]; then
  read -r -p "Type 'deploy' to continue: " answer
  [[ "$answer" == "deploy" ]] || fail "Cancelled."
fi

# ---- 1. Backups ----
step "1/5 Database backup"
mkdir -p "$backup_dir" "$build_root"; chmod 700 "$backup_dir"
pg_dump --format=custom --no-owner --file="$backup_dir/db.dump"
[[ -s "$backup_dir/db.dump" ]] || fail "Database backup is empty. Stopping before any change."
pg_restore --list "$backup_dir/db.dump" >/dev/null || fail "Database backup is unreadable. Stopping before any change."
echo "Saved $backup_dir/db.dump ($(du -h "$backup_dir/db.dump" | cut -f1))"

step "2/5 Build the new version in a side folder (live app keeps running)"
cleanup_stage() { rm -rf "$stage_dir"; }
trap cleanup_stage EXIT
rsync -a "${excludes[@]}" "$release_dir/" "$stage_dir/"
cp -a "$app_dir/.env" "$stage_dir/.env"
( cd "$stage_dir" && npm ci --no-audit --no-fund && DEPLOYMENT_VERSION="$stamp" npm run build ) \
  || fail "Build failed. Live app was not touched. Backup: $backup_dir"

# ---- 2. Migrations (additive, before the new code goes live) ----
step "3/5 Database migrations"
if [[ "${MIGRATIONS_APPLIED:-0}" == "1" || ${#migrations[@]} -eq 0 ]]; then
  echo "Nothing to run here."
else
  for m in "${migrations[@]}"; do
    echo "Running $m"
    wazap-migrate "$release_dir/$m" || fail "Migration $m failed. Live app was not touched. Backup: $backup_dir"
  done
fi

# ---- 3. Swap and restart ----
swapped=0
rollback() {
  set +e
  echo "Rolling back to the previous version ..." >&2
  rsync -a --delete "${excludes[@]}" "${protect[@]}" "$backup_dir/source/" "$app_dir/"
  if [[ -d "$backup_dir/.next" ]]; then rm -rf "$app_dir/.next"; mv "$backup_dir/.next" "$app_dir/.next"; fi
  if [[ -d "$backup_dir/node_modules" ]]; then rm -rf "$app_dir/node_modules"; mv "$backup_dir/node_modules" "$app_dir/node_modules"; fi
  pm2 restart wazap >/dev/null
  echo "Previous version restored. The database was not restored (migrations are additive)." >&2
}
on_error() { code=$?; [[ "$swapped" == "1" ]] && rollback; exit "$code"; }
trap on_error ERR

step "4/5 Swap in the new version and restart"
rsync -a "${excludes[@]}" "$app_dir/" "$backup_dir/source/"
swapped=1
mv "$app_dir/.next" "$backup_dir/.next"
mv "$app_dir/node_modules" "$backup_dir/node_modules"
rsync -a --delete "${excludes[@]}" "${protect[@]}" "$release_dir/" "$app_dir/"
mv "$stage_dir/.next" "$app_dir/.next"
mv "$stage_dir/node_modules" "$app_dir/node_modules"
pm2 restart wazap

ready=0
for _ in {1..30}; do
  if curl -fsS -m 5 "$health_url/api/health" 2>/dev/null | grep -q '"process":"ready"'; then ready=1; break; fi
  sleep 1
done
[[ "$ready" == "1" ]] || { echo "App did not become healthy in 30 s." >&2; false; }

# ---- 4. Smoke checks ----
step "5/5 Smoke checks"
ok=1
for path in / /login /pricing /api/health; do
  code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$health_url$path")"
  echo "$path -> $code"
  [[ "$code" == "200" ]] || ok=0
done
if [[ "$ok" != "1" ]]; then echo "A page did not return 200." >&2; false; fi
swapped=0
trap - ERR

# Old backups hold a full node_modules and .next; keep only the newest few.
ls -1dt "$backup_root"/release-* 2>/dev/null | tail -n +"$((keep_backups + 1))" | while read -r old; do
  case "$old" in "$backup_root"/release-*) rm -rf -- "$old" ;; esac
done

cat <<EOF

Deployed. Backup: $backup_dir
Now check by hand: email-code login, Google login, CRM tabs, System health, paying customers still on their plan.

Rollback later (code only):
  rsync -a --delete --exclude node_modules --exclude '.next*' --exclude '.env*' --exclude .git --exclude .wa-sessions --exclude '*.log' $backup_dir/source/ $app_dir/
  rm -rf $app_dir/.next $app_dir/node_modules && mv $backup_dir/.next $backup_dir/node_modules $app_dir/ && pm2 restart wazap
Emergency (server admin's snapshot from the move): wazap-rollback
EOF
