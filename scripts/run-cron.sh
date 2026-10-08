#!/usr/bin/env bash
set -euo pipefail

route="${1:-}"
case "$route" in
  support-monitor|customer-nurture|zoho-inbox|email-delivery|expire-plans|expiry-reminders|trial-lifecycle|webhook-delivery|automation-scheduler|operations|whatsapp-campaigns|account-lifecycle) ;;
  *) echo "Unsupported Wazap cron route" >&2; exit 64 ;;
esac

app_dir="/opt/wazap"
secret="$(sed -n 's/^CRON_SECRET=//p' "$app_dir/.env" | head -1)"
secret="${secret#\"}"
secret="${secret%\"}"
secret="${secret#\'}"
secret="${secret%\'}"
if [[ -z "$secret" ]]; then echo "CRON_SECRET is not configured" >&2; exit 78; fi

exec /usr/bin/curl --fail --silent --show-error \
  --max-time 120 \
  -H "Authorization: Bearer $secret" \
  "http://127.0.0.1:5000/api/cron/$route"
