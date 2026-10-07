#!/usr/bin/env bash
set -euo pipefail

release=/opt/wazap-release-20260717-dodo-cleanup
live=/opt/wazap
backup=/opt/wazap-source-backup-20260717-dodo-cleanup
nextnew=/opt/wazap/.next.dodo-cleanup-new
nextbackup=/opt/wazap/.next.backup-20260717-dodo-cleanup

mkdir -p "$backup" "$nextnew"
rsync -a --delete --exclude node_modules --exclude '.next*' --exclude .env --exclude '.env*' --exclude .wa-sessions "$live/" "$backup/"
rsync -a --delete "$release/.next/" "$nextnew/"
rsync -a --delete --exclude node_modules --exclude '.next*' --exclude .env --exclude '.env*' --exclude .wa-sessions "$release/" "$live/"

cd "$live"
npx prisma generate
sed -i 's/^NEXT_PUBLIC_WAZAP_CHECKOUT_PROVIDER=.*/NEXT_PUBLIC_WAZAP_CHECKOUT_PROVIDER=dodo/' .env

mv .next "$nextbackup"
mv "$nextnew" .next
pm2 restart wazap --update-env
pm2 save
pm2 describe wazap --no-color | sed -n '1,45p'
