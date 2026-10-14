// Small scenario builders shared by the billing state-machine integration
// tests. These call the real lib/payment-integrity.ts functions (the thing
// under test) - they are not themselves mocks. Safe to import from any test
// file: whichever test file's own vi.mock("@/lib/paypal"|"@/lib/dodo", ...)
// is active applies transitively to everything these call into.
import { chargeOnce as recordVerifiedCharge, lifecycleOnce as applyVerifiedLifecycle } from "./typed-calls";
import { prisma } from "@/lib/prisma";
import { uid, daysFromNow, assertNotDuplicate } from "./helpers";
import { runPostTransactionActions } from "./wiring";

// Establishes a live, paying user on `plan` with a single active subscription
// S0 (ACTIVATED/subscription.active lifecycle event, then the first charge) -
// the steady state most other scenarios start from.
export async function bootstrapLiveSubscription(opts: {
  provider: "paypal" | "dodo";
  userId: string;
  plan: string;
  amount: number;
  subscriptionId?: string;
  occurredAt?: Date;
  periodEnd?: Date | null;
}) {
  const S0 = opts.subscriptionId ?? uid("sub");
  const t0 = opts.occurredAt ?? new Date(Date.now() - 60_000);

  await applyVerifiedLifecycle({
    provider: opts.provider, eventId: uid("evt"), subscriptionId: S0, occurredAt: t0,
    userId: opts.userId, plan: opts.plan, endAccess: false,
  });

  const chargeId = uid("charge");
  const chargeResult = await recordVerifiedCharge({
    provider: opts.provider, chargeId, userId: opts.userId, plan: opts.plan,
    amount: opts.amount, currency: "USD", subscriptionId: S0,
    occurredAt: new Date(t0.getTime() + 1000),
    periodEnd: opts.periodEnd ?? daysFromNow(30),
  });
  assertNotDuplicate(chargeResult);
  await runPostTransactionActions({
    cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId: opts.userId,
  });
  return { subscriptionId: S0, chargeId, chargeResult };
}

// Directly inserts a pending BillingPlanChange row, exactly as the (not
// under test here) POST /api/billing/change route would after
// reconcilePendingPlanChange + createPendingPlanChange succeed.
export async function createPendingChange(opts: {
  userId: string; kind: "upgrade" | "downgrade" | "renew"; fromPlan: string; toPlan: string;
  provider: "paypal" | "dodo"; oldSubscriptionId: string | null; newSubscriptionId: string | null;
  effectiveAt?: Date | null; status?: string; createdAt?: Date;
}) {
  return prisma.billingPlanChange.create({
    data: {
      userId: opts.userId, kind: opts.kind, fromPlan: opts.fromPlan, toPlan: opts.toPlan, provider: opts.provider,
      oldSubscriptionId: opts.oldSubscriptionId, newSubscriptionId: opts.newSubscriptionId,
      effectiveAt: opts.effectiveAt ?? null, status: opts.status ?? "pending",
      ...(opts.createdAt ? { createdAt: opts.createdAt, updatedAt: opts.createdAt } : {}),
    },
  });
}
