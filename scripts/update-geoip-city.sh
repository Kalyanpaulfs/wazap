#!/usr/bin/env bash
# Downloads the current month's DB-IP "IP to City Lite" mmdb (free, CC BY
# 4.0 - lib/geo-city.ts, the Audience feature) and atomically replaces the
# file GEOIP_CITY_DB_PATH points at. Falls back to the previous month's file
# if the current month hasn't been published yet. Meant to run monthly via
# cron on the server - see the deploy report for the exact cron line.
#
# Usage: scripts/update-geoip-city.sh [target-path]
#   target-path defaults to $GEOIP_CITY_DB_PATH.
set -euo pipefail

target="${1:-${GEOIP_CITY_DB_PATH:-}}"
if [[ -z "$target" ]]; then
  echo "$(date -Is) geoip-city update FAILED: no target path (pass one, or set GEOIP_CITY_DB_PATH)" >&2
  exit 1
fi

mkdir -p "$(dirname "$target")"
tmp_gz="$(mktemp)"
# Same folder as the target so the final mv is an atomic rename.
tmp_mmdb="$(mktemp "$(dirname "$target")/.dbip-city.XXXXXX")"
trap 'rm -f "$tmp_gz" "$tmp_mmdb"' EXIT

this_month="$(date -u +%Y-%m)"
last_month="$(date -u -d 'last month' +%Y-%m 2>/dev/null || date -u -v-1m +%Y-%m)"

download() {
  local month="$1"
  local url="https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz"
  echo "$(date -Is) trying $url"
  # --ssl-no-revoke works around a Windows curl/OpenSSL quirk; harmless on Linux.
  curl -fsSL --ssl-no-revoke -o "$tmp_gz" "$url"
}

if ! download "$this_month"; then
  echo "$(date -Is) current month not available yet, falling back to $last_month"
  download "$last_month"
fi

gunzip -c "$tmp_gz" > "$tmp_mmdb"

# Sanity check: the unzipped file should be in the tens-of-megabytes range
# (~130MB as of 2026). Anything drastically smaller is almost certainly a
# truncated download or an HTML error page saved as if it were the file.
size="$(stat -c%s "$tmp_mmdb" 2>/dev/null || stat -f%z "$tmp_mmdb")"
min_bytes=$((20 * 1024 * 1024))
if (( size < min_bytes )); then
  echo "$(date -Is) geoip-city update FAILED: downloaded file is only $size bytes (expected tens of MB)" >&2
  exit 1
fi

chmod 644 "$tmp_mmdb"
mv -- "$tmp_mmdb" "$target"
trap 'rm -f "$tmp_gz"' EXIT

echo "$(date -Is) geoip-city update OK: $target ($(du -h "$target" | cut -f1))"
