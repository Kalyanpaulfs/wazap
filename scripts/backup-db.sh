#!/usr/bin/env bash
# Atomic Postgres backup for Wazap. Keeps the newest seven verified archives.
set -euo pipefail
umask 077

APP_DIR=/opt/wazap
BACKUP_DIR=/opt/backups/wazap
mkdir -p "$BACKUP_DIR"

database_url="$(sed -n 's/^DATABASE_URL=//p' "$APP_DIR/.env" | head -1)"
database_url="${database_url#\"}"; database_url="${database_url%\"}"
database_url="${database_url#\'}"; database_url="${database_url%\'}"
if [[ -z "$database_url" ]]; then
  echo "$(date -Is) backup FAILED: database configuration is missing" >&2
  exit 1
fi

timestamp="$(date +%Y%m%d-%H%M%S)"
output="$BACKUP_DIR/wazap-$timestamp.sql.gz"
partial="$output.partial"
trap 'rm -f "$partial"' EXIT

if pg_dump "$database_url" | gzip -9 > "$partial" && gzip -t "$partial" && [[ -s "$partial" ]]; then
  chmod 600 "$partial"
  mv "$partial" "$output"
  trap - EXIT
  echo "$(date -Is) backup OK $output ($(du -h "$output" | cut -f1))"
else
  echo "$(date -Is) backup FAILED" >&2
  exit 1
fi

# Include the append-only business evidence alongside each SQL snapshot.
# Atomic ledger replacement means cp reads a complete prior or current version.
ledger="${WAZAP_BUSINESS_LEDGER:-/opt/wazap-private/business-ledger.json}"
if [[ -f "$ledger" ]]; then
  ledger_output="$BACKUP_DIR/wazap-$timestamp.business-ledger.json"
  cp -- "$ledger" "$ledger_output.partial"
  node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(x.version!==1||!Array.isArray(x.entries))process.exit(1)' "$ledger_output.partial"
  chmod 600 "$ledger_output.partial"
  mv -- "$ledger_output.partial" "$ledger_output"
  sha256sum "$ledger_output" > "$ledger_output.sha256"
fi

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'wazap-*.sql.gz' -printf '%T@ %p\n' \
  | sort -nr \
  | tail -n +8 \
  | cut -d' ' -f2- \
  | xargs -r rm -f --
