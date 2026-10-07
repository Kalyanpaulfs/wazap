#!/usr/bin/env bash
# If available RAM falls below the threshold, cull leaked headless Chrome
# renderer processes (the known leak source) to keep wazap + agents alive.
set -uo pipefail
THRESH_MB=1200
LOG=/var/log/wazap-mem-watchdog.log
AVAIL=$(free -m | awk '/^Mem:/{print $7}')
if [ "$AVAIL" -lt "$THRESH_MB" ]; then
  N=$(pgrep -c -f 'chrome --headless' || echo 0)
  echo "$(date -Is) LOW MEM ${AVAIL}MB < ${THRESH_MB}MB — killing $N headless chrome procs" >> "$LOG"
  pkill -9 -f 'chrome --headless' || true
  # also drop dead renderer zombies
  pkill -9 -f 'chrome_crashpad' || true
fi
