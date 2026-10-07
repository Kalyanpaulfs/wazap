#!/usr/bin/env bash
set -euo pipefail
cron_secret="$(sed -n 's/^CRON_SECRET=//p' /opt/wazap/.env | tail -n 1)"
cron_secret="${cron_secret%\"}"
cron_secret="${cron_secret#\"}"
cron_secret="${cron_secret%\'}"
cron_secret="${cron_secret#\'}"
if [[ -z "$cron_secret" ]]; then
  echo "CRON_SECRET is missing" >&2
  exit 1
fi
curl --silent --show-error --max-time 60 \
  -H "Authorization: Bearer ${cron_secret}" \
  http://127.0.0.1:5000/api/cron/email-delivery
