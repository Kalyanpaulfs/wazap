# Wazap production operations runbook

Last reviewed: 2026-07-27  
Production: `https://wazap.lt`  
Application host alias: `hostinger`  
Application path: `/opt/wazap`  
Process: `wazap` in PM2

This runbook is for service, security, privacy, payment, messaging, and provider incidents. Never paste credentials, message content, contact addresses, payment identifiers, database URLs, or API keys into tickets or chat.

## Ownership and response targets

Until named rotations exist, the Wazap owner is the incident commander and privacy/payment decision owner. A technical operator may execute recovery actions but must not make legal, refund, disclosure, or customer-notification decisions without authorization.

| Severity | Example | Acknowledge | Stabilize target | Update cadence |
|---|---|---:|---:|---:|
| SEV-1 | confirmed data exposure, cross-tenant access, active credential theft, unrecoverable writes, widespread message misdelivery | 15 min | 30 min | every 30 min |
| SEV-2 | checkout/webhook outage, channel outage, stuck campaigns, failed backups, major feature unavailable | 30 min | 2 hours | hourly |
| SEV-3 | isolated failure with workaround, delayed queue, non-critical integration degradation | 4 hours | 1 business day | daily |
| SEV-4 | cosmetic defect, documentation problem, feature request | 1 business day | planned | at resolution |

If a response target cannot be met, reduce risk first: pause the affected capability, preserve evidence, and communicate known facts without guessing.

## Universal incident procedure

1. Record the detection time, reporter, affected surface, first known occurrence, and current customer impact.
2. Assign severity and one incident commander.
3. Preserve evidence before mutation:
   - relevant PM2 and cron log timestamps;
   - request IDs, provider event IDs, workspace IDs, and status codes;
   - exact application/database backup paths;
   - current deployed file hashes when code integrity matters.
4. Stop ongoing harm with the narrowest reversible action:
   - pause one campaign, channel, webhook, API key, agent, or automation;
   - do not disable the whole service when tenant-scoped containment is possible.
5. Diagnose from authoritative state: database records, provider status, signed webhook evidence, production logs, and reproduced behavior.
6. Back up every live file before changing it under `/opt/wazap-backups/<purpose>-<timestamp>/`.
7. Validate locally, deploy narrowly, run the safe production rebuild when application code changes, and verify the persisted outcome.
8. Communicate impact, containment, recovery, and any customer action required.
9. Close only after monitoring proves recovery and temporary fixtures are removed.
10. Write a blameless follow-up with root cause, detection gap, prevention, owner, and deadline.

## Fast health assessment

Use read-only checks first:

```bash
ssh hostinger "pm2 list --no-color | grep wazap"
ssh hostinger "cd /opt/wazap && printf 'SELECT 1;' | npx prisma db execute --schema prisma/schema.prisma --stdin"
curl -A "Mozilla/5.0" https://wazap.lt/api/health
```

Expected health response:

```json
{"status":"ok","process":"ready"}
```

Check the latest application logs without dumping historical secrets or customer content:

```bash
ssh hostinger "pm2 logs wazap --lines 100 --nostream"
```

Do not copy full logs outside the server. Extract only the minimum request IDs, timestamps, status codes, and redacted error context needed.

## Deployment rollback

Before a production mutation:

1. Diff each local file against `/opt/wazap/<same-path>`.
2. Copy every affected live file into `/opt/wazap-backups/<purpose>-<timestamp>/`.
3. Create a database backup for schema or data-affecting changes.
4. Preserve `.env` mode `600`; never print it.

For application changes, use:

```bash
ssh hostinger "cd /opt/wazap && /opt/wazap/scripts/safe-production-rebuild.sh"
```

The rebuild installs from the lockfile in an isolated staging directory, runs `scripts/check-dependency-audit.sh`, builds all routes, and swaps artifacts only after those gates pass. It then waits for the public health endpoint to report ready. A missing/invalid audit report or any known high/critical advisory stops the release before PM2 or live artifacts are touched; a restart/readiness failure after swap automatically restores the prior `.next` and `node_modules`. Do not bypass the gate with `npm audit fix --force`; update the exact dependency or reviewed override, prove the peer graph with `npm ls`, and rerun the full build.

After readiness succeeds, full `safe-rebuild-*` artifact backups are pruned to the three newest generations to prevent disk exhaustion. This does not remove named change backups or database archives.

If recovery requires rollback, restore only the exact backed-up files for that deployment, rebuild, and verify health. Never use a broad repository reset against the production directory.

## Database backup and restore

Daily backup:

```bash
ssh hostinger "/opt/wazap/backup-db.sh"
```

Daily isolated restore verification:

```bash
ssh hostinger "/usr/bin/flock -n /tmp/wazap-backup-restore.lock /opt/wazap/scripts/verify-backup-restore.sh"
```

Evidence:

- archives: `/opt/backups/wazap/wazap-*.sql.gz`;
- restore status: `/var/lib/wazap-backup/last-restore-verification.json`;
- scheduled logs: `/var/log/wazap-backup.log` and `/var/log/wazap-backup-restore.log`;
- archives and `.env` must be mode `600`;
- no database named `wazap_restore_verify_*` may remain after a drill.

The automated verifier restores only into a temporary database and must never point at the live database.

For an actual disaster restore:

1. Declare SEV-1 and stop application writes.
2. Preserve the failed database and current logs.
3. Select the newest archive that passed restore verification.
4. Restore into a separate recovery database.
5. Validate core tables, foreign keys, expected workspace counts, recent verified payments, and the most recent critical business records.
6. Obtain owner approval before switching the application database target.
7. Keep the previous database intact until customer and provider reconciliation completes.

Target recovery objectives:

- RPO: no more than 24 hours until continuous recovery is implemented;
- RTO: four hours for database restoration;
- restore verification: daily, after the daily backup.

## Credential compromise

Treat leaked API keys, webhook signing secrets, database URLs, payment credentials, Meta credentials, model-provider keys, auth secrets, and Telegram tokens as SEV-1 or SEV-2 depending on demonstrated access.

1. Revoke or rotate the affected credential at its authoritative provider.
2. Disable affected Wazap keys, webhooks, channels, or sessions.
3. Search request and audit evidence for use after the suspected exposure time.
4. Rotate dependent credentials if the compromised value could reveal or sign them.
5. Rebuild/restart only when environment values changed.
6. Verify old credentials fail and new credentials work.
7. Determine notification obligations from confirmed scope, not assumptions.

Never replay a one-time channel signing secret from an idempotency record or log.

## Cross-tenant or personal-data exposure

Any confirmed cross-workspace access is SEV-1.

1. Disable the exact endpoint, key, or feature capable of continued exposure.
2. Preserve request IDs, affected workspace IDs, actor IDs, time range, response shape, and deployed hash.
3. Do not inspect more personal data than needed to determine scope.
4. Prove tenant filters at database-query and API-response levels.
5. Test with two isolated workspaces before restoring access.
6. Remove all fixtures and prove zero residue.
7. The owner/privacy decision maker determines customer and regulator notifications.

Do not claim that no exposure occurred merely because no complaint exists.

## Privacy requests and account closure

Authenticated users can request a portable account export and recoverable account closure through Wazap. Closure is delayed for seven days and may be blocked by active billing or ownership of shared workspaces.

Operator rules:

- verify account identity before manual assistance;
- never email an export to an unverified address;
- do not bypass ownership-transfer or active-billing blockers;
- preserve the request and completion timestamps;
- retained payment evidence must remain pseudonymized and limited to legitimate accounting obligations;
- never promise immediate deletion from third-party provider records that Wazap does not control.

Escalate disputes about legal retention or identity to the privacy decision owner.

## Abuse, spam, and unsafe automation

Immediately pause a workspace capability when there is credible evidence of:

- unsolicited bulk messaging;
- opt-out suppression or fabricated consent;
- attempts to evade provider enforcement;
- impersonation, phishing, fraud, harassment, or prohibited content;
- automation that continues after human pause/revocation;
- an AI agent making consequential commitments outside its approved mode.

Preserve consent state, campaign status, template ID, workspace ID, provider results, and audit events. Avoid copying recipient lists or message bodies into the incident record.

Restore access only after the abuse path is removed and the owner approves any account action.

## WhatsApp and channel-provider outage

Separate Wazap acceptance from provider delivery:

1. Check channel status and recent channel events.
2. Check whether messages are recorded, accepted, delivered, read, failed, or uncertain.
3. Pause campaigns when provider outcomes are uncertain; do not retry blindly.
4. Keep opt-outs operational even during a marketing-send outage.
5. Reconcile provider IDs before replaying.
6. Resume in a bounded batch and monitor failure/complaint rates.

Direct Meta transport must remain inactive until approved Meta credentials exist. Custom bridges must use signed requests and rotated credentials.

## AI-provider outage or unsafe output

1. Use the workspace **Emergency pause** control for a tenant-specific incident. For a platform-wide incident set `AI_EXECUTION_DISABLED=true`, rebuild/restart safely, and verify generation attempts produce `PLATFORM_KILL_SWITCH` blocked-run evidence.
2. The workspace switch pauses every active agent. Restoring execution does not reactivate agents; an owner or admin must explicitly reactivate each one after a passing evaluation.
3. Keep human handoff and shared inbox available.
4. Preserve run ID, model/provider, policy result, latency, token use, output hash, and redacted evaluation evidence.
5. Never include full customer conversations or evaluation outputs in incident notes.
6. Resume only after role-specific evaluations and human-approval behavior pass.

## Store package incident

1. Record an abuse report or incident reference without copying secrets or full customer conversations.
2. Suspend the listing immediately when continued execution could harm customers. Suspension hides discovery, suspends installs, pauses installed agents, and preserves evidence.
3. Review the exact manifest hash, approved scopes, external endpoints, security evidence, moderation history, and affected install list.
4. Remove the package when the behavior cannot be made safe. Removal revokes installs but does not erase customer or moderation history.
5. Roll back only to a security-approved version. Rolled-back installs remain suspended with `requires_review`; never reactivate customer agents globally.
6. Confirm package governance webhooks are queued for every affected workspace and monitor delivery failures.
7. Resolve or dismiss every associated abuse report with written evidence. Follow `docs/store-governance.md` for publisher enforcement and reinstatement boundaries.

No model key may be created or installed without explicit owner authorization and a privacy/retention decision.

## Payment and entitlement incident

Never test with a real charge.

Diagnose these stages separately:

1. checkout request;
2. provider object creation;
3. buyer approval/capture;
4. signed provider webhook;
5. Wazap payment record;
6. entitlement activation or renewal;
7. receipt/customer communication.

Revenue is recognized only from verified captured/active provider state. Exclude pending checkouts, tests, manual grants, refunds, and chargebacks.

For duplicate or disputed payment:

- preserve provider IDs and signed webhook evidence;
- do not create a second refund;
- the payment decision owner approves refunds;
- update entitlement only after the provider outcome is authoritative;
- communicate timing and limitations clearly.

## Refund request

1. Verify the account and authoritative captured payment.
2. Check refund policy, transaction age, prior refunds, disputes, and current entitlement.
3. Record the decision and approving operator.
4. Execute once at the payment provider.
5. Reconcile the provider refund event into Wazap.
6. Notify the customer and state expected settlement timing.
7. Confirm revenue reporting excludes the refunded amount.

Do not promise a refund before the provider accepts it.

## Queue or webhook backlog

Use operational health and request/delivery records to identify:

- queued webhook deliveries past `nextAttemptAt`;
- repeated endpoint failures;
- email delivery failures;
- stuck scheduled campaigns;
- uncertain campaign recipients;
- failed automation or AI runs.

Disable one failing destination when it threatens shared capacity. Do not discard queued events merely to make the backlog metric green.

For developer-platform incidents, use the workspace reliability view and retained `WebhookDeliveryAttempt` rows. The published 30-day objectives are 99.9% API availability, API p95 latency at or below 750 ms excluding third-party provider time, 99.5% terminal webhook success, and 99% of delivered webhooks within 15 minutes. Do not describe an objective as met or missed until the minimum evidence threshold is reached: 100 API requests or 20 terminal webhook deliveries. A `null` result means insufficient evidence, not success.

Webhook delivery follows bounded retries after approximately 1 minute, 5 minutes, 15 minutes, 1 hour, 4 hours, 12 hours, and 24 hours. Each attempt records its outcome, response status when available, latency, and a non-secret error code. After eight failed attempts the delivery is terminally failed and the endpoint is disabled. Re-enable it only after the destination owner confirms recovery.

## Incident ownership and escalation

Record each material workspace incident in Operations. SEV-1 requires acknowledgement within 15 minutes and an update every 30 minutes; SEV-2 requires acknowledgement within 30 minutes and an update every 60 minutes; SEV-3 requires acknowledgement within four hours and an update every 24 hours. Critical monitor evidence opens an owned SEV-1 automatically. Missing the acknowledgement target creates retained escalation evidence and notifies the workspace owner through the retryable outbound-email queue.

Only the assigned incident owner or a workspace owner/admin may change status. Every transition requires a retained update. Customer-audience updates must contain confirmed impact and safe facts only. Resolution requires at least 20 characters of specific evidence; disappearance of a monitor signal does not automatically resolve an incident.

## Partner attribution disputes

Use `PartnerReferralTouch`, `PartnerAttribution`, workspace audit events, and the accepted terms version as authoritative evidence. The current contract is a server-recorded 30-day first touch: a valid unexpired touch is not overwritten by a later partner link and can be claimed only once when a new workspace is created. Never reconstruct or transfer attribution from screenshots, client storage, verbal claims, or missing historical events.

Tracking does not create compensation. Do not promise or process payouts until separate written commercial terms and approved identity, tax, fraud, refund, dispute, clawback, accounting, and payment controls are operating. Expired unclaimed touches are deleted; claimed touch evidence is retained for up to one year while the durable attribution record remains.

## Customer communication template

Initial:

> We are investigating an issue affecting [specific capability] beginning around [time and timezone]. We have [contained/paused] the affected path. We will update you by [time]. We will not ask you for passwords, API keys, or payment credentials.

Recovery:

> [Capability] recovered at [time and timezone]. The confirmed impact was [facts]. [Customer action/no action] is required. We are monitoring recovery and will provide a follow-up if the confirmed scope changes.

Never speculate about cause or exposure in customer communication.

## Closure checklist

- impact and time range are evidence-backed;
- affected tenants/providers are identified;
- containment is removed only where safe;
- production health, database access, assets, and the affected action are verified;
- temporary databases, users, keys, campaigns, listings, and other fixtures are removed;
- backups and rollback paths exist;
- customer/provider reconciliation is complete;
- notifications and refunds are decided by authorized owners;
- root cause and preventive actions have named owners and deadlines;
- the product roadmap status is updated when an operating capability materially changes.
