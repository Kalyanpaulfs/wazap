# Wazap system audit — 8 October 2026

## Verified results

- Production readiness healthy; AI support worker active.
- 73 registered accounts at the audit snapshot.
- 74 isolated CRM, signup, access-control, workspace-isolation, billing-label and support checks passed. No customer billing or production accounts were mutated by these tests.
- Five additional support-widget regression checks passed; TypeScript and the 188-page production build passed.
- 52 read-only Dodo/PayPal configuration checks passed, including live products, prices and webhooks. This is not proof of a fresh successful customer payment.
- Production dependency audit: zero vulnerabilities reported.
- Latest daily database backup restored successfully in three seconds.
- Email snapshot: 47 confirmed deliveries, 121 provider-accepted sends, two held and three test-suppressed records. No queued or failed records in the checked query. Acceptance is not inbox delivery.
- Google OAuth provider is exposed alongside password login. A fresh Google round trip and password-reset inbox receipt still require an end-to-end check.
- SEO audit checked 83 canonical pages. Three multilingual title/description length warnings remain; those recommendations are not indexing failures. Search-engine console coverage and rankings were not verified in this audit.

## Repairs released

- tawk.to loading now clears its failed or timed-out initialization, allowing a genuine retry rather than remaining stuck.
- Router creation rejects malformed JSON and non-string number lists with a client validation error instead of a server crash.
- Previously released: simplified footer, AI-only first-party chat, and live human support exclusively through tawk.to, with the personal phone link removed.
- Production rebuild used an isolated build directory and retained rollback artifacts.

## Remaining priorities

1. Review the 20 open legacy support records individually. Do not bulk-close or automatically message them; separate tests from real unanswered customers. Confirm an accountable tawk.to operator and actual response coverage before advertising response-time promises.
2. Verify a real customer checkout, webhook entitlement activation, cancellation and password-reset receipt with approved test identities. Configuration checks cannot prove all of these outcomes.
3. Full repository lint is not clean: generated build folders, macOS sidecar files and pre-existing source issues contribute errors. Address the lint configuration and genuine source issues separately; a successful build is not a clean lint result.
4. Load-test simultaneous router requests and quota enforcement in isolation before claiming concurrency guarantees.
5. Complete a fresh mobile/keyboard journey and authenticated search-console review. Do not claim perfect usability or presence on every search engine based on HTTP checks.

## QA safety

The directory `/opt/wazap-qa-20261008` points to the production database despite its name. It was not used for mutation tests. The actual isolated test database was `wazap_crm_qa_20261007`, with external email automation disabled and no payment credentials. Always inspect connection targets before reusing a QA directory.

## Service recommendation

Keep the primary journey short: create account, configure router, test link, see usage, upgrade when needed. Keep AI assistance visible and human escalation routed to tawk.to. Faster support requires staffing and queue ownership in addition to reliable widgets.
