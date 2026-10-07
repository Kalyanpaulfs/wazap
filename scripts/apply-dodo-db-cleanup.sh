#!/usr/bin/env bash
set -euo pipefail

backup="/opt/backups/wazap/wazap-pre-dodo-cleanup-20260717-1955.sql.gz"
mkdir -p /opt/backups/wazap
dburl="$(grep -E '^DATABASE_URL=' /opt/wazap/.env | cut -d= -f2- | tr -d '"')"

pg_dump "$dburl" | gzip > "$backup"
gzip -t "$backup"
psql "$dburl" -v ON_ERROR_STOP=1 -f /opt/wazap-release-20260717-dodo-cleanup/prisma/dodo_cleanup_20260717.sql

echo "backup=$backup size=$(du -h "$backup" | cut -f1)"
remaining="$({
  psql "$dburl" -Atc "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('ReferralCommission','PointEvent') ORDER BY table_name;"
  psql "$dburl" -Atc "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='User' AND column_name IN ('referralCode','points','payoutWallet','referredById') ORDER BY column_name;"
} | sed '/^$/d')"

if [[ -n "$remaining" ]]; then
  echo "Legacy referral database objects remain:" >&2
  echo "$remaining" >&2
  exit 1
fi

echo "legacy_referral_objects=0"
