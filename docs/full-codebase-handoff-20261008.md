# Full codebase reconciliation — 8 October 2026

The GitHub repository was compared directly with `/opt/wazap` on the production host. Missing and changed application sources were copied into `main`, including login, account security, MFA, shared rate limiting, payment integrity, private-destination webhook protection, support monitoring, localization, routing and database changes. This is a source handoff, not a certification that those features are complete or secure.

## Components

- `app/`: public site, login/signup/reset, customer dashboards, owner CRM, account security and backend API routes.
- `lib/`: business logic, authentication, authorization, payments, integrations and abuse controls.
- `prisma/schema.prisma`: current Prisma model. Historical SQL changes are under `prisma/`.
- `scripts/security-foundation.sql`: additional security tables used by raw SQL code. Prisma alone is not the complete security database bootstrap. Review this script for a new isolated database; never batch-run historical SQL against production.
- `services/support-worker/`: separately deployed private AI support worker and its verification scripts. This previously lived outside the website checkout.
- `extension/` and `mobile/`: existing companion application sources; inclusion does not establish current functionality.
- `scripts/`, `ops/`, `operations/`: operational helpers and test source. Some tests mint privileged sessions or mutate data; read them before execution.

## Worker deployment requirements

Production uses `/opt/wazap-support-worker` and the systemd unit `wazap-support-worker`. The worker listens on `/run/wazap-support-worker/worker.sock`, uses Docker, and mounts an authorized Codex installation and private authentication state. The installed Codex version is recorded in `services/support-worker/codex/package.json`; it is dependency metadata, not the executable distribution. Obtain the matching package through its package manager rather than assuming the copied metadata can run it.

The service uses Node, a private `runtime.env`, `WAZAP_AI_UID_GID`, optional `WAZAP_WORKER_ROOT`, and private authentication at `/var/lib/wazap-support-ai/.codex`. Credentials must be provisioned separately. See the worker source for the pinned container image, filesystem mounts, process/resource limits and tool restrictions. This optional integration is not automatically provisioned by `npm ci` in the website project.

## Intentionally excluded

Production `.env`/worker runtime credentials, authentication sessions, customer databases, private support review exports, logs, backups, generated builds, installed dependencies and workstation sidecar files are not source code and must not be uploaded. Public localization data already tracked under `data/` is retained. GitHub access does not provide production SSH, provider dashboards or database credentials.

## Developer review priorities

Review login and MFA enrollment/recovery, cross-customer authorization, payment verification/idempotency, rate limiting, support privacy, worker isolation and fresh-database bootstrap first. Use the recent audit report as an incomplete checklist, not proof of finished SaaS behavior. Verify the live deployment independently: production source can change outside GitHub.

This upload does not deploy or alter production, contact customers, charge payments or migrate production data.
