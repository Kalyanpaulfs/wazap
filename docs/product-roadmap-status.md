# Wazap product roadmap and production status

Last verified: 2026-08-03  
Vision: the operating system for business conversations.

This document separates software that is deployed from outcomes that require customers, partners, third-party credentials, and time. A phase is not commercially complete merely because its code exists.

## North-star metric

**Daily active business conversations started through Wazap**

Measure it with supporting guardrails:

- unique active workspaces starting at least one customer conversation per day;
- conversations started, qualified, handed off, and resolved;
- 7-day and 30-day retained active workspaces;
- human hours saved by approved automations and AI-assisted work;
- delivery failure, opt-out, complaint, and human-escalation rates.

Revenue is a consequence metric. Consent, retention, and reliable outcomes are guardrails.

The global admin dashboard now reports this north star using tenant-deduplicated customer workspaces, explicit conversation-start events, new inbox threads, 7/30-day active businesses, and week-over-week retained businesses. Admin-owned workspaces are excluded, and daily boundaries use `Asia/Dubai`.

## Phase scorecard

### Phase 0 — Validation

Product state: **deployed foundation; market gate still open**

Production includes public tools, traffic/funnel measurement, account and trial lifecycle, billing, support intake, analytics, and workspace operations.

Commercial exit gate:

- 10–20 paying businesses;
- at least 10 businesses active in three separate weeks;
- five recorded customer interviews;
- one repeated post-first-message problem with evidence strong enough to prioritize;
- no dependency on founder-operated manual provisioning.

### Phase 1 — Traffic engine

Product state: **deployed; SEO and demand compounding remain continuous work**

The public tool collection includes links, QR codes, widgets, vCards, formatting, templates, follow-ups, reply generation, transcript insights, bulk planning, number checking, rotators, short links, catalogs, scheduling, link pages, and ad builders.

Growth gate:

- every indexable tool has a unique search intent, canonical metadata, structured content, examples, and an internal path into a paid workflow;
- search impressions, qualified starts, signup conversion, and paid conversion are reported by landing tool;
- no tool encourages unsolicited messaging, policy evasion, or unsafe automation.

### Phase 2 — Wazap Flow

Product state: **deployed foundation**

Production includes multi-member workspaces, ownership transfer, shared inbox, omnichannel conversation records, CRM leads and pipeline, notes, tasks, follow-up automation, reporting, aggregate analytics, and activity evidence.

Contact migration now has a real preview-and-commit workflow: batches are normalized, deduplicated, checked against existing workspace leads, locked to the previewed fingerprint, constrained by plan capacity, imported atomically, audited, and announced through one completion webhook. Repeat commits are idempotent. Consent, message history, and templates are explicitly never inferred from imported contact files.

The dashboard’s self-serve activation checklist is tied to persisted Flow outcomes: account/workspace creation, first customer conversation, first follow-up task, and first resolved conversation. Marketplace installation is intentionally not required for basic activation.

Activation gate:

- a new workspace can connect or create a channel, receive or record a conversation, assign it, create a follow-up, and resolve it without staff intervention;
- weekly retained workspaces use at least two Flow surfaces;
- conversation and task mutations are tenant-isolated and recoverable where deletion is offered.

### Phase 3 — AI employees

Product state: **governed agent platform deployed; external model activation blocked**

Production includes role-based agent profiles, knowledge, drafts, approval-required modes, handoffs, bounded automation, run history, and installable agent packages. API keys cannot activate agents or enable autonomous sending. The control plane now also has a persistent workspace emergency pause, a platform environment kill switch, forced agent pausing, audited restore behavior, blocked-run evidence, and versioned role-specific evaluations that store pass/fail metrics, latency, token use, output hashes, and redacted safety flags. Once a model provider is enabled, an agent must pass an evaluation before activation.

External activation requirement:

- an approved `OPENAI_API_KEY` or another reviewed model provider;
- a model/privacy decision covering retention, regional processing, redaction, evaluation data, and incident response.

Safety and quality gate:

- run the deployed task-specific evaluation suite against every production agent role and approve threshold/version changes;
- measure accuracy, refusal, escalation, hallucination, latency, token use, and provider cost across representative customer-language datasets (cost remains unset until reviewed provider pricing is configured);
- human approval for consequential claims, payments, collections, employment, property, health, legal, and account changes;
- periodically exercise both kill switches and reconcile complete run/evaluation evidence.

### Phase 4 — Wazap Store

Product state: **deployed foundation**

Production includes publisher enrollment, packages and immutable semantic versions, per-version security review evidence and manifest hashes, moderation history, published listing pages, installs, activation, reviews, abuse reporting, emergency suspension/removal, approved-version rollback, install containment, agent pausing, governance webhooks, operational alerts, public versioned catalog APIs, search/filter/cursor discovery, and safe published projections. Publisher updates remain pending while the current reviewed release stays available. Legacy releases are explicitly marked for retrospective security review.

Marketplace gate:

- exercise the published Store governance policy and five-business-day review target with real independent publishers;
- at least 20 useful reviewed packages from more than five independent publishers;
- install-to-activation and 30-day retained-install metrics;
- commissions only after tax, refunds, disputes, payout identity, fraud, and accounting controls are live.

### Phase 5 — Partner ecosystem

Product state: **attribution foundation deployed; payouts intentionally disabled**

Production includes partner enrollment gated by explicit versioned terms, server-issued 30-day first-touch attribution, single-use atomic signup claims, trial attribution, verified payment conversion, tracking URLs, partner webhooks, privacy-safe workspace reporting, audit evidence, and expiry/retention processing. Tracking never creates a compensation or payout obligation without a separate approved written agreement.

Commercial gate:

- verified identity, tax, fraud, clawback, refund, and payout controls;
- partner-sourced qualified pipeline and retained revenue reported separately from raw signups;
- commissions are never promised until payout operations are approved and tested.

### Phase 6 — API and developer platform

Product state: **reliability-gated foundation**

Production includes hashed least-privilege API keys, explicit scopes, 120-request/minute key limits, body-bound 24-hour mutation idempotency, request logs, encrypted signed webhooks, bounded delivery retries with per-attempt evidence, OpenAPI, compatibility headers, a public API lifecycle policy, and versioned APIs for conversations, messages, leads, tasks, automations, agents, channels, WhatsApp consent/templates/draft campaigns, analytics, operations, partners, audit evidence, and the public Store catalog. A deterministic contract test proves same-body replays and rejects changed-body key reuse across leads, tasks, conversations, conversation updates, and messages.

Reliability gate:

- collect enough real API and terminal-webhook evidence to evaluate the published objectives; until then, reliability results explicitly remain `null` with `insufficient` evidence;
- exercise the documented incident communication and recovery process during a real or staged incident;
- SDKs generated only after the v1 contract stabilizes through real integrations.

### Phase 7 — Omnichannel

Product state: **common channel architecture deployed; direct providers require credentials**

The shared inbox and API model support WhatsApp, Instagram, Messenger, email, SMS, RCS, and Telegram. Signed custom bridges can be created and rotated through the API. Provider-managed credentials remain owner/admin operations inside Wazap.

External activation requirement:

- Meta app ID, app secret, and webhook verification token for direct WhatsApp/Instagram/Messenger transport;
- reviewed provider accounts and credentials for SMS/RCS/email/Telegram as applicable;
- provider-specific compliance, template, consent, delivery, retry, and reconciliation tests.

Channel exit gate:

- bidirectional delivery, idempotency, provider status mapping, opt-out, retry, and outage behavior verified for each provider;
- one inbox identity model does not merge unrelated customers;
- provider credentials can be rotated and revoked without losing conversation history.

### Phase 8 — Autonomous operations

Product state: **deployed operational foundation; autonomy remains an operating discipline**

Production includes recurring billing, verified payment webhooks, trial and expiry lifecycle jobs, outbound email queueing, webhook delivery, automation scheduling, WhatsApp campaign scheduling, operational snapshots, health checks, accountable incident management, atomic private backups, a daily isolated restore-and-integrity drill with operator failure alerts, compliance-grade account export, recoverable account closure, retention processing, support, and workspace audit evidence. Critical monitor evidence opens an owned SEV-1; each incident retains severity, response/update targets, owner, acknowledgement, escalation, internal/customer-safe updates, and specific resolution evidence. Missed acknowledgement targets escalate through the retryable email queue. The versioned export covers the full owned-workspace operating record—including Flow, AI governance, automations, channels, APIs/webhooks, incidents, Store, partner, product-usage, and support evidence—while recursively excluding credentials, authentication hashes, encrypted values, and secret URL parameters.

The production dependency lock is also release-gated: the complete and production-only npm audit trees currently report zero known vulnerabilities. Patched transitive matcher versions are pinned through package overrides, the ESLint/Next peer graph is valid, targeted lint execution passes, and the full production build is verified before deployment.

Operational gate:

- restore drills, not backup existence alone;
- written incident, privacy request, abuse, refund, and provider-outage runbooks;
- exercise automatic incident opening, owner notification, missed-acknowledgement escalation, customer-safe updates, and evidence-backed closure during scheduled drills;
- manual exceptions are counted and reduced without hiding customer harm;
- AI support never blocks access to a human for billing, safety, privacy, or account recovery.

## Product pyramid

### Acquisition layer

Public tools and searchable educational pages create qualified conversation starts.

### Daily-work layer

Inbox, CRM, tasks, automation, analytics, consent, and governed AI make Wazap useful every day.

### Platform layer

APIs, webhooks, Store packages, partners, channels, security evidence, and operational controls create durable integrations and network effects.

Every new feature must strengthen at least one layer without weakening consent, tenant isolation, reliability, or customer control.

## Current external blockers

These are not software defects and must not be bypassed:

1. Direct Meta transport is inactive until approved Meta credentials are supplied.
2. Model-backed AI generation is inactive until the owner explicitly approves a production API key and the model/privacy policy.
3. Marketplace and partner payouts remain inactive until legal, tax, fraud, refund, dispute, and payout operations are approved.
4. Validation, retention, search demand, marketplace liquidity, and partner productivity require real users and elapsed observation time.

## Definition of “whole plan done”

The software foundation is complete when all production capabilities above pass their security and reliability checks. The business roadmap is complete only when every commercial exit gate is evidenced with retained customers and operating history.

An acquisition is not a roadmap milestone Wazap controls. The controllable outcome is a trusted, retained, revenue-generating conversation platform that customers, partners, and developers would be materially worse off without.
