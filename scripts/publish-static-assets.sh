#!/usr/bin/env bash
set -euo pipefail

# Keep hashed assets from the previous release available while the next build
# is compiled and the running Next.js process is restarted. On local machines
# the shared production directory does not exist, so only permissions are set.
find .next/static -type d -exec chmod 755 {} +
find .next/static -type f -exec chmod 644 {} +

shared_static="/opt/wazap-static"
if [[ -d "$shared_static" && -w "$shared_static" ]]; then
  cp -a .next/static/. "$shared_static"/
  find "$shared_static" -type d -exec chmod 755 {} +
  find "$shared_static" -type f -exec chmod 644 {} +
fi

# Nginx serves these SEO files directly, so publish the freshly generated
# metadata-route bodies on every production build instead of leaving stale
# copies behind after pricing, policy, or route changes.
seo_root="/var/www/wazap-seo"
if [[ -d "$seo_root" && -w "$seo_root" ]]; then
  install -m 644 .next/server/app/robots.txt.body "$seo_root/robots.txt"
fi
