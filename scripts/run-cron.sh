#!/usr/bin/env bash
set -euo pipefail

route="${1:-}"
case "$route" in
  support-monitor|customer-nurture|zoho-inbox|email-delivery|expire-plans|expiry-reminders|trial-lifecycle|webhook-delivery|automation-scheduler|operations|whatsapp-campaigns|account-lifecycle) ;;
  *) echo "Unsupported Wazap cron route" >&2; exit 64 ;;
esac

# Email and support configuration follows this installation in either host or isolated runtime.
# Other jobs retain their existing behavior pending a separate processing review.
app_dir="/opt/wazap"
if [[ "$route" == "email-delivery" || "$route" == "zoho-inbox" || "$route" == "support-monitor" ]]; then
  app_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
  trap 'rc=$?; if (( rc != 0 )); then printf "%s %s failed exit=%s\n" "$(date -Is)" "$route" "$rc" >&2; fi' EXIT
  if [[ ! -r "$app_dir/.env" ]]; then
    echo "Cron configuration file is missing or unreadable" >&2
    exit 78
  fi
fi
secret="$(sed -n 's/^CRON_SECRET=//p' "$app_dir/.env" | head -1)"
secret="${secret#\"}"
secret="${secret%\"}"
secret="${secret#\'}"
secret="${secret%\'}"
if [[ -z "$secret" ]]; then echo "CRON_SECRET is not configured" >&2; exit 78; fi

if [[ "${2:-}" == "--check" ]]; then
  echo "Cron configuration check passed (no messages sent)"
  exit 0
fi
if [[ -n "${2:-}" ]]; then echo "Unsupported cron option" >&2; exit 64; fi

# Keep the shell for email so its EXIT trap records transport/HTTP failures.
if [[ "$route" == "email-delivery" || "$route" == "zoho-inbox" || "$route" == "support-monitor" ]]; then
  /usr/bin/curl --fail --silent --show-error \
    --max-time 120 \
    -H "Authorization: Bearer $secret" \
    "http://127.0.0.1:5000/api/cron/$route"
  printf '\n%s %s completed\n' "$(date -Is)" "$route"
  exit 0
fi
exec /usr/bin/curl --fail --silent --show-error \
  --max-time 120 \
  -H "Authorization: Bearer $secret" \
  "http://127.0.0.1:5000/api/cron/$route"
