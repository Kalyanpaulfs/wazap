# Developer update — 8 October 2026

This source refresh combines the maintained local Wazap application with the current source retrieved read-only from Hostinger `/opt/wazap`. Where deployed files differed, the deployed source was retained in this repository. The original local workspace and production application were not overwritten or redeployed by this sync.

## Changes since the initial import

- Branding: approved logo, reusable `BrandLogo`, navigation/footer/auth-shell changes.
- Product presentation: motion scenes, landing artwork, growth illustrations and sizing metadata.
- Localization: language controls and locale-provider updates.
- Customer email: branded and localized welcome, support, marketing and billing templates and image assets.
- Billing: Dodo/PayPal webhook changes use queued receipts and billing notices; Dodo preserves a valid existing paid period for the applicable payment event.
- Automation: customer-nurture and Zoho-inbox cron routes, Zoho callback, inbox processing and support-email helpers.
- Support: Tawk handoff integration, widget and corresponding Content Security Policy changes.
- Operations: email delivery/webhook processing, plan expiry/reminders, CRM campaign helpers, cron runner and service-worker changes.

## What was checked for this repository refresh

- Existing remote `main` was fetched before import; there were no incoming commits to merge at that point.
- TypeScript `--noEmit` passed using the maintained local application's installed dependencies and generated Prisma client.
- Gitleaks scanned the prepared source with no detected leaks.
- Production secrets, runtime database data, backups, dependencies and generated builds are excluded. Server-side email preview HTML was not imported.

These checks verify source handoff, not a new production release, provider approval, successful payment, inbox delivery or marketing consent. A clean dependency install/build and isolated integration tests remain appropriate before the developer changes or deploys this code. Some integration scripts mutate state: review them rather than executing them all.

## Configuration and review

Inspect environment variables referenced by the new email and integration modules. Obtain sandbox credentials through the owner separately; no live credentials are stored here. Keep marketing automation gated and honor current consent, suppression, opt-out and deletion state. Do not enable a send-ready switch merely because code was imported.

Review database schema compatibility, queued-email idempotency, webhook authentication, transaction boundaries, Zoho callback security, CSP scope and authentication before production changes. Historical SQL files must be reviewed individually, not replayed indiscriminately.

This repository is private and uses `main` as its default source branch. Collaborator access does not grant production server or provider-account access.
