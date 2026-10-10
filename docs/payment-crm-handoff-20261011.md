# CRM payment synchronization handoff — 11 October 2026

This source update matches the narrow payment/CRM changes already deployed on Wazap. It includes `lib/crm-payment.ts`, the hook in `lib/payment-integrity.ts`, amount/currency display in `app/admin/crm/BillingWorkspace.tsx`, and `scripts/qa-crm-payments.cjs`.

Verified account-mapped PayPal and Dodo charges append a deduplicated CRM payment activity within the same database transaction as the captured payment ledger. The activity includes currency, amount, plan, provider and transaction/payment references. Subscription lifecycle events are not recorded as cash. Existing charge deduplication and receipts remain in place. CRM writes preserve pipeline stage, opportunity value, contact restrictions and marketing consent. This does not import arbitrary wallet transfers or resolve unmapped payer identities automatically.

One historical receipt was reconciled to an existing customer payment with owner confirmation and a restricted pre-change backup. The existing row was corrected rather than duplicated, and current access was unchanged. Do not replay that correction on another database or generate a new charge, receipt, subscription or entitlement from it. Customer identifiers, provider evidence, database snapshots and private reconciliation notes are deliberately excluded from GitHub.

Validation completed before the production release: synthetic fixture against the real charge handler and CRM helper (capture, renewal, retries, provider/currency separation, consent preservation and rollback), local webpack build, isolated production build, provider read-only checks 52/52, signed-in CRM timeline and billing reference, health and public static assets. No test charge was performed. Production invariant audit passed 39/40; an existing Business149 pricing-card audit mismatch was outside this change. Local default Turbopack had an external node_modules symlink limitation; webpack passed.

No schema migration is needed. The existing SecurityPaymentCharge and CRM tables must already be provisioned. `node scripts/qa-crm-payments.cjs` uses a synthetic transaction fixture and performs no provider or production database writes. Other repository scripts may mutate data, queue email or change provider products; inspect each before running.

The homepage and other VPS processes were preserved. This repository sync is not a new production release. Reconcile current live source before any later deployment and retain the project's staged-build/rollback procedure. Do not apply historical SQL or database-reset commands blindly.

Joseph requested a work freeze after this synchronization. Codex should make no further application, database, provider, infrastructure or customer-communication changes until Joseph explicitly instructs it. Reviewing or learning from developer changes also requires his request. No developer messages, new schedules or agents are authorized by this handoff.
