// Shared "turn auto-pay back on" logic (spec 12f/12c.3 "renew" and 12c.5
// "auto-pay on"): the same code path is used from both POST /api/billing/change
// (same plan again, auto-renew currently off) and POST /api/billing/autopay
// ({on:true}).
import { prisma } from "./prisma";
import { auditBilling, reconcilePendingPlanChange, createPendingPlanChange } from "./billing-actions";
import { periodEndFromExpiry, isFutureDate } from "./billing-rules";
import { createPayPalSubscription, getPayPalPlanId, cancelPayPalSubscription } from "./paypal";
import { getDodoSubscription, setDodoAutoRenew } from "./dodo";
import { PLAN_PRICES, BILLING_GRACE_DAYS } from "./billing";

type UserLike = { id: string; email: string; name: string | null; plan: string; planExpiresAt: Date | null };

export async function performAutoRenewOn(opts: {
  user: UserLike;
  provider: "paypal" | "dodo";
  oldSubscriptionId: string;
  now: Date;
  paypalLocale: string;
  base: string;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { user, provider, oldSubscriptionId: S0, now, paypalLocale, base } = opts;

  const pointer = await prisma.securityUserBilling.findUnique({ where: { userId: user.id } });
  if (pointer?.autoRenew) {
    // Already on: do nothing rather than start a second renewal subscription.
    return { status: 200, body: { ok: true, alreadyOn: true, accessUntil: user.planExpiresAt } };
  }

  if (provider === "dodo") {
    let ended: boolean;
    try {
      const sub = await getDodoSubscription(S0);
      ended = sub.status === "cancelled" || sub.status === "expired";
    } catch {
      return { status: 502, body: { error: "Could not reach Dodo to turn auto-pay back on. Please try again." } };
    }
    if (ended) {
      // Nothing left to resume: send the caller through a normal checkout.
      return { status: 200, body: { checkout: true } };
    }
    try {
      await setDodoAutoRenew(S0, true);
    } catch {
      return { status: 502, body: { error: "Dodo could not confirm the auto-pay change. No changes were made." } };
    }
    await prisma.securityUserBilling.update({ where: { userId: user.id }, data: { autoRenew: true } });
    await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "autopay_on", detail: { provider, subscriptionId: S0 } });
    return { status: 200, body: { ok: true, applied: "autorenew_enabled", accessUntil: user.planExpiresAt } };
  }

  // PayPal: no in-place auto-pay flag - a new subscription is created,
  // scheduled to start at the current period end so no days are lost.
  const periodEnd = periodEndFromExpiry(user.planExpiresAt, BILLING_GRACE_DAYS);
  if (!isFutureDate(periodEnd, now)) return { status: 200, body: { checkout: true } };

  const pendingCheck = await reconcilePendingPlanChange(user.id, now);
  if (!pendingCheck.ok) return { status: pendingCheck.status, body: { error: pendingCheck.error } };

  const planId = getPayPalPlanId(user.plan);
  if (!planId) return { status: 501, body: { error: "This Wazap plan is not available for PayPal renewal yet." } };

  const { id: S1, approvalUrl } = await createPayPalSubscription({
    planId, userId: user.id, email: user.email, name: user.name, locale: paypalLocale, startTime: periodEnd as Date,
    returnUrl: `${base}/dashboard?upgraded=1&provider=paypal&plan=${encodeURIComponent(user.plan)}&change=renew`,
    cancelUrl: `${base}/pricing?cancelled=1`,
  });
  if (!approvalUrl || !S1) return { status: 502, body: { error: "Could not start the renewal checkout." } };

  const inserted = await createPendingPlanChange({
    userId: user.id, kind: "renew", fromPlan: user.plan, toPlan: user.plan, provider: "paypal", oldSubscriptionId: S0, newSubscriptionId: S1, effectiveAt: periodEnd, status: "pending",
  });
  if (!inserted.ok) {
    await cancelPayPalSubscription(S1, "duplicate_plan_change_request").catch(() => {});
    return { status: inserted.status, body: { error: inserted.error } };
  }
  await prisma.payment.create({ data: { userId: user.id, email: user.email, plan: user.plan, amount: PLAN_PRICES[user.plan], method: "paypal", txId: S1, status: "pending" } });
  await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "plan_change_renew_started", detail: { plan: user.plan, provider: "paypal", oldSubscriptionId: S0, newSubscriptionId: S1, effectiveAt: periodEnd } });
  return { status: 200, body: { url: approvalUrl } };
}
