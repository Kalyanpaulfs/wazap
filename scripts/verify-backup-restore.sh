#!/usr/bin/env bash
# Restores the newest Wazap backup into an isolated temporary database and removes it.
set -euo pipefail
umask 077

APP_DIR=/opt/wazap
BACKUP_DIR="${WAZAP_BACKUP_DIR:-/opt/backups/wazap}"
STATE_DIR="${WAZAP_BACKUP_STATE_DIR:-/var/lib/wazap-backup}"
MAX_BACKUP_AGE_SECONDS=$((36 * 60 * 60))
mkdir -p "$STATE_DIR"
backup=""

read_env() {
  local key="$1" value
  value="$(sed -n "s/^${key}=//p" "$APP_DIR/.env" | head -1)"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s' "$value"
}

report_failure() {
  local reason="$1" backup_name="unknown"
  if [[ -n "$backup" ]]; then backup_name="$(basename "$backup")"; fi
  printf '{"status":"failed","verifiedAt":"%s","backup":"%s","reason":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    "$backup_name" \
    "$reason" \
    > "$STATE_DIR/last-restore-verification.json"
  echo "$(date -Is) restore verification FAILED: $reason" >&2

  local telegram_token chat_id_values
  telegram_token="$(read_env TELEGRAM_BOT_TOKEN)"
  chat_id_values="$(read_env SUPPORT_TELEGRAM_CHAT_IDS)"
  if [[ -z "$chat_id_values" ]]; then chat_id_values="$(read_env TELEGRAM_ALLOW_USER_IDS)"; fi
  if [[ "${WAZAP_SUPPRESS_ALERTS:-0}" != "1" && -n "$telegram_token" && -n "$chat_id_values" ]]; then
    local chat_id
    IFS=',' read -ra chat_ids <<< "$chat_id_values"
    for chat_id in "${chat_ids[@]}"; do
      curl --max-time 8 --silent --output /dev/null "https://api.telegram.org/bot${telegram_token}/sendMessage" \
        --data-urlencode "chat_id=${chat_id// /}" \
        --data-urlencode "text=ALERT: Wazap backup restore verification failed: ${reason}. Backup: ${backup_name}." || true
    done
  fi
}

fail() {
  trap - ERR
  report_failure "$1"
  exit 1
}

unexpected_failure() {
  local status="$1" line="$2"
  trap - ERR
  report_failure "unexpected verifier error at line ${line}"
  exit "$status"
}
trap 'unexpected_failure "$?" "$LINENO"' ERR

database_url="$(sed -n 's/^DATABASE_URL=//p' "$APP_DIR/.env" | head -1)"
database_url="${database_url#\"}"; database_url="${database_url%\"}"
database_url="${database_url#\'}"; database_url="${database_url%\'}"
if [[ -z "$database_url" ]]; then
  fail "database configuration is missing"
fi

backup="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'wazap-*.sql.gz' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
if [[ -z "$backup" || ! -f "$backup" ]]; then
  fail "no backup archive found"
fi

now="$(date +%s)"
modified="$(stat -c %Y "$backup")"
age=$((now - modified))
if (( age < 0 || age > MAX_BACKUP_AGE_SECONDS )); then
  fail "newest backup is stale"
fi
gzip -t "$backup"

started="$now"
database_name="wazap_restore_verify_$(date +%Y%m%d%H%M%S)_$$"
if ! [[ "$database_name" =~ ^wazap_restore_verify_[0-9]{14}_[0-9]+$ ]]; then
  fail "invalid temporary database name"
fi

target_url="$(
  WAZAP_DATABASE_URL="$database_url" WAZAP_DATABASE_NAME="$database_name" node -e '
    const url = new URL(process.env.WAZAP_DATABASE_URL);
    url.pathname = `/${encodeURIComponent(process.env.WAZAP_DATABASE_NAME)}`;
    process.stdout.write(url.toString());
  '
)"
created=0
cleanup() {
  if (( created == 1 )); then
    dropdb --if-exists --maintenance-db="$database_url" "$database_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

createdb --maintenance-db="$database_url" "$database_name"
created=1
gunzip -c "$backup" | psql "$target_url" -X -q -v ON_ERROR_STOP=1 >/dev/null

schema_ok="$(
  psql "$target_url" -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT CASE WHEN
  to_regclass('public."User"') IS NOT NULL
  AND to_regclass('public."Workspace"') IS NOT NULL
  AND to_regclass('public."WorkspaceMember"') IS NOT NULL
  AND to_regclass('public."InboxConversation"') IS NOT NULL
  AND to_regclass('public."ApiKey"') IS NOT NULL
  AND to_regclass('public."WorkspaceAuditEvent"') IS NOT NULL
THEN 'ok' ELSE 'missing' END;
SQL
)"
if [[ "$schema_ok" != "ok" ]]; then
  fail "required schema is incomplete"
fi

constraint_failures="$(
  psql "$target_url" -X -qAt -v ON_ERROR_STOP=1 <<'SQL'
SELECT count(*)
FROM pg_constraint
WHERE contype = 'f'
  AND connamespace = 'public'::regnamespace
  AND NOT convalidated;
SQL
)"
if [[ "$constraint_failures" != "0" ]]; then
  fail "unvalidated foreign keys found"
fi

cleanup
created=0
trap - EXIT INT TERM
if psql "$database_url" -X -qAt -v ON_ERROR_STOP=1 \
  -c "SELECT count(*) FROM pg_database WHERE datname = '$database_name';" | grep -qx '0'; then
  :
else
  fail "temporary database cleanup failed"
fi

finished="$(date +%s)"
backup_name="$(basename "$backup")"
backup_size="$(stat -c %s "$backup")"
printf '{"status":"ok","verifiedAt":"%s","backup":"%s","bytes":%s,"durationSeconds":%s}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  "$backup_name" \
  "$backup_size" \
  "$((finished - started))" \
  > "$STATE_DIR/last-restore-verification.json"
trap - ERR
echo "$(date -Is) restore verification OK backup=$backup_name duration=$((finished - started))s"
