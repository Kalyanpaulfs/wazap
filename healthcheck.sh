#!/usr/bin/env bash
set -euo pipefail

URL="http://127.0.0.1:5000/api/health?deep=1"
STATE_DIR="/var/lib/wazap-health"
LOG="/var/log/wazap-health.log"
FAILURE_FILE="$STATE_DIR/consecutive-failures"
FAILURES_BEFORE_RESTART=3
mkdir -p "$STATE_DIR"

status=$(curl -A "WazapHealth/1.0" --max-time 5 --silent --output /tmp/wazap-health-body --write-out "%{http_code}" "$URL" || true)
if [ "$status" = "200" ]; then
  rm -f "$STATE_DIR/failed" "$FAILURE_FILE"
  exit 0
fi

failures=0
if [[ -f "$FAILURE_FILE" ]]; then
  read -r failures < "$FAILURE_FILE" || failures=0
fi
if ! [[ "$failures" =~ ^[0-9]+$ ]]; then failures=0; fi
failures=$((failures + 1))
printf '%s\n' "$failures" > "$FAILURE_FILE"
echo "$(date -Is) health failed status=$status consecutive_failures=$failures" >> "$LOG"

if (( failures < FAILURES_BEFORE_RESTART )); then
  exit 1
fi

echo "$(date -Is) failure threshold reached; restarting wazap" >> "$LOG"
pm2 restart wazap --update-env --no-color >> "$LOG" 2>&1 || true
sleep 2
retry=$(curl -A "WazapHealth/1.0" --max-time 5 --silent --output /dev/null --write-out "%{http_code}" "$URL" || true)
if [ "$retry" = "200" ]; then
  echo "$(date -Is) recovered after automatic restart" >> "$LOG"
  rm -f "$STATE_DIR/failed" "$FAILURE_FILE"
  exit 0
fi

echo "$(date -Is) still unhealthy after restart status=$retry" >> "$LOG"
touch "$STATE_DIR/failed"
read_env() {
  local key="$1" value
  value="$(sed -n "s/^${key}=//p" /opt/wazap/.env | head -1)"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s' "$value"
}
telegram_token="$(read_env TELEGRAM_BOT_TOKEN)"
chat_id_values="$(read_env SUPPORT_TELEGRAM_CHAT_IDS)"
if [[ -z "$chat_id_values" ]]; then chat_id_values="$(read_env TELEGRAM_ALLOW_USER_IDS)"; fi
if [[ -n "$telegram_token" && -n "$chat_id_values" ]]; then
  IFS=',' read -ra chat_ids <<< "$chat_id_values"
  for chat_id in "${chat_ids[@]}"; do
    curl --max-time 8 --silent --output /dev/null "https://api.telegram.org/bot${telegram_token}/sendMessage" \
      --data-urlencode "chat_id=${chat_id// /}" \
      --data-urlencode "text=ALERT: Wazap health check failed and automatic restart did not recover it. Status ${retry}." || true
  done
fi
exit 1
