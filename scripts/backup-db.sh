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

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'wazap-*.sql.gz' -printf '%T@ %p\n' \
  | sort -nr \
  | tail -n +8 \
  | cut -d' ' -f2- \
  | xargs -r rm -f --
