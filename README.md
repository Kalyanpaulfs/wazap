# Wazap Business

Private source repository for https://wazap.lt.

Initial source snapshot from the maintained `wazap-production` workspace on 7 October 2026. Historical business-workspace commits, credentials, database contents, backups, installed dependencies and build outputs are excluded. This import is not a production deployment.

Latest source refresh: 8 October 2026. See [developer update](docs/developer-update-20261008.md) for the changes and validation boundaries.

## Local development

Use Node.js 22 LTS or a version compatible with the pinned Next.js release, npm and an isolated PostgreSQL database.

```bash
git clone git@github.com:astraterra-properties/wazap-business.git
cd wazap-business
npm ci
cp .env.example .env
# Set local database credentials and generate a unique local NEXTAUTH_SECRET.
npx prisma generate
npx prisma db push
npm run dev
```

Open http://localhost:3000. The `db push` command is only for a new disposable local database. Never point it at production. Historical SQL files include destructive changes; they are not a batch bootstrap script.

Provision sandbox credentials separately for external integrations. Google sign-in is hidden when credentials are absent; local OAuth requires its own approved local callback. Source presence does not prove a provider is enabled or approved in production.

## Source map

- `app/`: website, admin/CRM interfaces and API routes.
- `lib/`: authentication, payments, routing, support and integration logic.
- `prisma/`: database schema and historical SQL changes.
- `public/`: public assets and localization bundles.
- `data/site-locales/`: localization catalogs; `data/user-country.mmdb`: country lookup data.
- `scripts/`, `ops/` and root shell scripts: QA and operational helpers.
- `docs/`: application and operations documentation.
- `extension/`: browser extension source.
- `mobile/`: separate mobile application and package manifest.

Read `AGENTS.md` and nested instructions before edits. Its referenced localization release report is in the owner's separate operations workspace; request it before changing release orchestration. Preserve country detection and the manual language selector.

## Validation

```bash
npx prisma generate
npx tsc --noEmit
npm run build
```

QA scripts are not uniformly read-only: some create users, modify databases, queue mail, or change provider products. Inspect their target and side effects and use isolated services; do not run every script indiscriminately.

## Production and collaboration

Known production location: Hostinger `/opt/wazap`, PM2 process `wazap`. Server access is separate from repository access. This initial repository has no automatic deployment pipeline. A push is not a production release.

Use branches and pull requests. Before deployment, reconcile current server source, back up appropriately, stage the build, verify login, entitlements, CRM isolation, payments and public pages, and retain a rollback release. Do not reset production data or apply historical migrations blindly.

The owner must invite named GitHub collaborators. Never share credentials through commits, issues, pull requests or repository attachments; use an approved secret manager.
