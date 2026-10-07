# Developer Platform Reliability

## Contract

All `/api/v1/*` responses identify `v1`, the `2026-08-03` contract date, and the public lifecycle policy. Compatible additions stay inside v1. Normal breaking changes receive at least 90 days' notice and move to a new version; urgent security or legal changes may move faster with an incident notice.

Mutations require an `Idempotency-Key` retained for 24 hours. The key is bound to the authenticated workspace, operation, target resource, and normalized request body. An exact replay returns the original result; changed-body or concurrent reuse returns HTTP 409. Historical message keys without a request hash are treated as unverifiable and cannot be replayed.

## Published 30-day objectives

| Signal | Objective | Denominator | Evidence threshold |
| --- | ---: | --- | ---: |
| API availability | 99.9% | API requests, with HTTP 5xx counted unavailable | 100 requests |
| API p95 latency | <= 750 ms | Retained API request latency, excluding downstream provider time | 100 requests |
| Webhook terminal success | 99.5% | Delivered plus terminally failed webhook deliveries | 20 terminal deliveries |
| Webhook delivered within 15 minutes | 99% | Successfully delivered webhooks | 20 terminal deliveries |

The product returns `null` for an objective result until its evidence threshold is reached. Empty or small samples are never presented as meeting an objective.

## Delivery and recovery

Webhook attempts are atomically claimed so concurrent workers cannot intentionally process the same queued row. Interrupted `processing` rows are recovered after 15 minutes. Delivery retries are scheduled after approximately 1 minute, 5 minutes, 15 minutes, 1 hour, 4 hours, 12 hours, and 24 hours, with a maximum of eight attempts. Every attempt stores outcome, response status where available, latency, and a non-secret error code. The endpoint is disabled after terminal failure.

Operators use `docs/operations-runbook.md` for severity, containment, communication, and closure. The public promises and deprecation rules live at `/api-policy`.

## Release proof

Run `npm run qa:developer` against the intended deployment. The script creates an isolated temporary workspace and API key, proves API contract headers, exact replay, changed-body rejection, and one durable side effect for five mutation classes, then removes all fixtures. Run the invariant audit and production health checks separately. Never interpret this deterministic contract test as real-traffic SLO evidence.
