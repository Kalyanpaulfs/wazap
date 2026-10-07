# Wazap Store governance policy

Last updated: 2026-08-03

## Submission and review

- Only free agent and connected-tool packages are accepted while seller identity, tax, refund, dispute, fraud, and payout controls remain incomplete.
- Every release is immutable by semantic version and receives a separate review. A publisher update never replaces the currently published release before approval.
- Review covers manifest behavior, least-privilege scopes, external endpoints, data handling, human-approval boundaries, package type, pricing state, and a recorded risk level.
- Approval requires all review checks and written evidence. Manifest hashes identify the submitted artifact. Rejections and approvals are retained in moderation history.
- Target review SLA: five business days. This is an operating target, not a guaranteed publication date.

## Incidents and reports

- Signed-in businesses can report security, privacy, spam, deceptive behavior, unsafe output, or policy violations without including secrets or full customer conversations.
- Open reports appear in the administrator queue and workspace Operations view. Every resolution or dismissal requires written notes and an accountable administrator.
- Urgent threats may trigger immediate suspension before investigation completes.

## Suspension, removal, and rollback

- Suspension hides the package from discovery, suspends existing installs, pauses installed agents, forces draft-only mode, and preserves configuration and evidence.
- Removal revokes existing installs and preserves customer and moderation history. It does not silently delete customer records.
- Emergency rollback is allowed only to a previously security-approved version. Affected installs are moved to that version but remain suspended with `requires_review`; installed agents remain paused until each workspace reviews and reactivates them.
- Customers receive signed webhook events when their installed package is suspended, removed, or rolled back.

## Publisher enforcement

Wazap may reject a release or suspend a publisher for concealed behavior, unnecessary scopes, impersonation, malicious code, unsafe AI instructions, privacy violations, repeated low-quality submissions, or attempts to bypass review. Reinstatement requires evidence that the root cause is removed and does not automatically reactivate customer installs.

## Commercial boundary

Store commissions and payouts remain disabled until seller identity, tax, accounting, refunds, disputes, fraud monitoring, sanctions screening where applicable, and payout reconciliation are operational and legally reviewed.
