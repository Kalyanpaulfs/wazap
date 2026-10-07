#!/usr/bin/env bash
set -euo pipefail

app_dir="/opt/wazap"
release_root="/opt/wazap-releases"
backup_root="/opt/wazap-backups"
stamp="$(date +%Y%m%d-%H%M%S)"
stage_dir="$release_root/build-$stamp"
backup_dir="$backup_root/safe-rebuild-$stamp"
swap_started=0
swap_completed=0

if [[ "$(pwd)" != "$app_dir" ]]; then
  echo "Run this script from $app_dir." >&2
  exit 1
fi

mkdir -p "$stage_dir" "$backup_dir"

cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT

rollback_swap() {
  exit_code=$?
  if [[ "$swap_started" -eq 1 && "$swap_completed" -eq 0 ]]; then
    set +e
    echo "Release failed after artifact swap started; restoring the previous production artifacts." >&2
    pm2 stop wazap --no-color >/dev/null 2>&1
    if [[ -d "$backup_dir/.next" ]]; then
      if [[ -d "$app_dir/.next" ]]; then
        mv "$app_dir/.next" "$backup_dir/.next.failed"
      fi
      mv "$backup_dir/.next" "$app_dir/.next"
    fi
    if [[ -d "$backup_dir/node_modules" ]]; then
      if [[ -d "$app_dir/node_modules" ]]; then
        mv "$app_dir/node_modules" "$backup_dir/node_modules.failed"
      fi
      mv "$backup_dir/node_modules" "$app_dir/node_modules"
    fi
    pm2 restart wazap --update-env --no-color >/dev/null 2>&1
    restart_status=$?
    if [[ -d "$app_dir/.next" && -d "$app_dir/node_modules" && "$restart_status" -eq 0 ]]; then
      echo "Previous production artifacts restored. Failed artifacts remain in $backup_dir." >&2
    else
      echo "Automatic rollback was incomplete. Preserve $backup_dir and escalate immediately." >&2
    fi
  fi
  exit "$exit_code"
}
trap rollback_swap ERR

wait_for_readiness() {
  local attempt
  for attempt in {1..20}; do
    if curl -fsS -A "Mozilla/5.0 WazapReleaseVerification/1.0" \
      "https://wazap.lt/api/health" | grep -q '"process":"ready"'; then
      return 0
    fi
    sleep 1
  done
  echo "Production readiness did not recover within 20 seconds." >&2
  return 1
}

prune_old_rebuilds() {
  local seen=0 ignored_timestamp target
  while read -r ignored_timestamp target; do
    seen=$((seen + 1))
    if [[ "$seen" -le 3 ]]; then
      continue
    fi
    case "$target" in
      "$backup_root"/safe-rebuild-*) rm -rf -- "$target" ;;
      *) echo "Refusing unexpected rebuild-prune target: $target" >&2; return 1 ;;
    esac
  done < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'safe-rebuild-*' -printf '%T@ %p\n' | sort -nr)
}

# Build outside the live application directory. Building in place rewrites
# .next while the running server is still reading it and can create transient
# React client-manifest failures and 502 responses.
rsync -a \
  --exclude='.next*' \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='*.log' \
  "$app_dir/" "$stage_dir/"

cp -a "$app_dir/.env" "$stage_dir/.env"

(
  cd "$stage_dir"
  npm ci
  ./scripts/check-dependency-audit.sh
  export DEPLOYMENT_VERSION="$stamp"
  npm run build
)

cp -a "$app_dir/package.json" "$backup_dir/package.json"
cp -a "$app_dir/package-lock.json" "$backup_dir/package-lock.json"
cp -a "$app_dir/next.config.ts" "$backup_dir/next.config.ts"
cp -a "$app_dir/scripts/publish-static-assets.sh" "$backup_dir/publish-static-assets.sh"
# Stop only for the short artifact swap. The expensive build has already
# completed, so the live server never observes a partially written .next.
pm2 stop wazap --no-color
swap_started=1
mv "$app_dir/.next" "$backup_dir/.next"
mv "$app_dir/node_modules" "$backup_dir/node_modules"
mv "$stage_dir/.next" "$app_dir/.next"
mv "$stage_dir/node_modules" "$app_dir/node_modules"
find "$app_dir/.next/static" -type d -exec chmod 755 {} +
find "$app_dir/.next/static" -type f -exec chmod 644 {} +
pm2 restart wazap --update-env --no-color
wait_for_readiness
swap_completed=1
prune_old_rebuilds

echo "$backup_dir"
