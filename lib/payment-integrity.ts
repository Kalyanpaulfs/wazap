import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { queueBillingNotice, queuePaidReceipt } from "./billing-email";
import { extendPlanExpiry, planExpiry, withGrace } from "./billing";
import { recordCrmPayment } from "./crm-payment";
import { classifyIncomingCharge, decideAccessAfterRefund } from "./billing-rules";
import { auditBilling, subscriptionIdForPayment } from "./billing-actions";
import { recordBillingAttention } from "./billing-attention";
import { syncPlanLimits } from "./plan-limit-sync";

// Never called from inside a transaction - it opens its own. Errors are
// caught and logged so a plan-limit-sync failure never breaks a payment
// webhook or lifecycle event that already committed successfully.
async function syncPlanLimitsSafely(userId: string) {
  try {
    await syncPlanLimits(userId);
  } catch (err) {
    console.error("[plan-limit-sync] failed after billing change", userId, err instanceof Error ? err.message : String(err));
  }
}

async function subscriptionRecord(tx: Prisma.TransactionClient, opts: { provider: string; subscriptionId: string; userId: string; plan: string }, email: string, status: "subscription_active" | "subscription_inactive") {
  const existing = await tx.payment.findFirst({ where: { userId: opts.userId, method: opts.provider, txId: opts.subscriptionId, status: { in: ["pending", "inactive", "subscription_active", "subscription_inactive"] } } });
  if (existing) await tx.payment.updateMany({ where: { userId: opts.userId, method: opts.provider, txId: opts.subscriptionId, status: { in: ["pending", "inactive", "subscription_active", "subscription_inactive"] } }, data: { status, activatedAt: new Date() } });
  else await tx.payment.create({ data: { userId: opts.userId, email, plan: opts.plan, amount: 0, currency: "USD", method: opts.provider, txId: opts.subscriptionId, status, activatedAt: new Date() } });
}

export type DuplicateSubscriptionInfo = { paymentId?: string; provider: string; subscriptionId: string };

export async function recordVerifiedCharge(opts: {
  provider: "dodo" | "paypal"; chargeId: string; userId: string; plan: string;
  amount: number; currency: string; subscriptionId: string; occurredAt: Date; checkoutId?: string;
  // Provider's next billing date, when known. Access runs until then plus grace.
  periodEnd?: Date | null;
}) {
  if (!opts.chargeId || opts.chargeId.length > 200 || !Number.isFinite(opts.amount) || opts.amount <= 0 || !/^[A-Z]{3}$/.test(opts.currency)) throw new Error("Invalid verified charge data");
  if (!opts.subscriptionId || !Number.isFinite(opts.occurredAt.getTime())) throw new Error("Invalid provider event time or subscription");
  const autoRefundDuplicates = process.env.BILLING_AUTO_REFUND_DUPLICATES === "true";
  let flagAttentionForDuplicate = false;
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"billing:" + opts.userId}, 0))`;
    const existing = await tx.$queryRaw<Array<{ paymentId: string }>>`SELECT "paymentId" FROM "SecurityPaymentCharge" WHERE "provider" = ${opts.provider} AND "chargeId" = ${opts.chargeId}`;
    if (existing.length) {
      // A provider retry of a duplicate charge whose auto-refund never ran
      // (process died after commit): hand it back so the refund is retried.
      const paymentId = existing[0].paymentId;
      const chargeLog = await tx.billingAuditLog.findFirst({ where: { userId: opts.userId, action: "charge", detail: { path: ["paymentId"], equals: paymentId } } });
      const markedDuplicate = (chargeLog?.detail as { duplicateRefund?: boolean } | null)?.duplicateRefund === true;
      if (markedDuplicate && !(await tx.billingRefund.findUnique({ where: { paymentId } }))) {
        return { duplicate: true, duplicateSubscription: { paymentId, provider: opts.provider, subscriptionId: opts.subscriptionId } as DuplicateSubscriptionInfo };
      }
      return { duplicate: true };
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: opts.userId } });
    // Backstop historical rows even when the ledger was introduced later.
    const historical = await tx.payment.findFirst({ where: { method: opts.provider, txId: opts.chargeId, status: "active" }, orderBy: { createdAt: "asc" } });
    if (historical) {
      await tx.$executeRaw`INSERT INTO "SecurityPaymentCharge" ("provider", "chargeId", "paymentId", "currency") VALUES (${opts.provider}, ${opts.chargeId}, ${historical.id}, ${opts.currency})`;
      return { duplicate: true };
    }

    const pendingChange = await tx.billingPlanChange.findFirst({ where: { userId: user.id, status: "pending" } });
    const pointerRows = await tx.$queryRaw<Array<{ occurredAt: Date; provider: string; subscriptionId: string }>>`SELECT "occurredAt", "provider", "subscriptionId" FROM "SecurityUserBilling" WHERE "userId" = ${user.id}`;
    const pointerRow = pointerRows[0] ?? null;
    let pointerLive = false;
    if (pointerRow) {
      const liveRow = await tx.payment.findFirst({ where: { userId: user.id, method: pointerRow.provider, txId: pointerRow.subscriptionId, status: "subscription_active" } });
      pointerLive = Boolean(liveRow);
    }
    const classification = classifyIncomingCharge({
      pointerSubscriptionId: pointerRow?.subscriptionId ?? null,
      pointerLive,
      incomingSubscriptionId: opts.subscriptionId,
      incomingPlan: opts.plan,
      pendingChange: pendingChange && pendingChange.provider === opts.provider
        ? { newSubscriptionId: pendingChange.newSubscriptionId, oldSubscriptionId: pendingChange.oldSubscriptionId, toPlan: pendingChange.toPlan }
        : null,
    });

    let cancelOld: { provider: string; subscriptionId: string; planChangeId: string } | null = null;
    let duplicateSubscription: DuplicateSubscriptionInfo | null = null;
    const skipAccessChange = classification === "duplicate" && autoRefundDuplicates;

    if (!skipAccessChange) {
      const providerEnd = opts.periodEnd && Number.isFinite(opts.periodEnd.getTime()) && opts.periodEnd.getTime() > Date.now() ? withGrace(opts.periodEnd) : null;
      const fallback = user.plan === opts.plan && user.planExpiresAt && user.planExpiresAt.getTime() > Date.now() + 20 * 86_400_000
        ? user.planExpiresAt : user.plan === opts.plan ? extendPlanExpiry(opts.plan, user.planExpiresAt) : withGrace(planExpiry(opts.plan)!);
      // Prefer the provider's real billing date; never shorten existing paid access -
      // except for an expected plan change, where leftover days are intentionally dropped.
      const defaultExpiry = providerEnd
        ? (user.plan === opts.plan && user.planExpiresAt && user.planExpiresAt > providerEnd ? user.planExpiresAt : providerEnd)
        : fallback;
      const expiry = classification === "expected_change" ? (providerEnd ?? withGrace(planExpiry(opts.plan)!)) : defaultExpiry;

      const newer = pointerRow ? [{ occurredAt: pointerRow.occurredAt }] : [];
      const subscriptionState = await tx.$queryRaw<Array<{ occurredAt: Date }>>`SELECT "occurredAt" FROM "SecuritySubscriptionState" WHERE "provider" = ${opts.provider} AND "subscriptionId" = ${opts.subscriptionId}`;
      if ((!newer[0] || newer[0].occurredAt <= opts.occurredAt) && (!subscriptionState[0] || subscriptionState[0].occurredAt <= opts.occurredAt)) {
        await tx.user.update({ where: { id: user.id }, data: { plan: opts.plan, planExpiresAt: expiry } });
        if (opts.subscriptionId !== ("chargeId" in opts ? opts.chargeId : undefined)) await subscriptionRecord(tx, opts, user.email, "subscription_active");
        await tx.$executeRaw`INSERT INTO "SecurityUserBilling" ("userId", "provider", "subscriptionId", "occurredAt") VALUES (${user.id}, ${opts.provider}, ${opts.subscriptionId}, ${opts.occurredAt}) ON CONFLICT ("userId") DO UPDATE SET "provider" = EXCLUDED."provider", "subscriptionId" = EXCLUDED."subscriptionId", "occurredAt" = EXCLUDED."occurredAt", "autoRenew" = CASE WHEN "SecurityUserBilling"."subscriptionId" = EXCLUDED."subscriptionId" THEN "SecurityUserBilling"."autoRenew" ELSE true END`;
        if (classification === "expected_change" && pendingChange) {
          await tx.billingPlanChange.update({ where: { id: pendingChange.id }, data: { status: "completed", updatedAt: new Date() } });
          // Only an upgrade still has the old subscription running: a scheduled
          // downgrade cancelled it when the new one was approved, a renew had none.
          if (pendingChange.kind === "upgrade" && pendingChange.oldSubscriptionId && pendingChange.oldSubscriptionId !== opts.subscriptionId) {
            cancelOld = { provider: pendingChange.provider, subscriptionId: pendingChange.oldSubscriptionId, planChangeId: pendingChange.id };
          }
        }
      }
    } else {
      duplicateSubscription = { provider: opts.provider, subscriptionId: opts.subscriptionId };
    }

    await tx.$executeRaw`INSERT INTO "SecuritySubscriptionState" ("provider", "subscriptionId", "userId", "occurredAt") VALUES (${opts.provider}, ${opts.subscriptionId}, ${user.id}, ${opts.occurredAt}) ON CONFLICT ("provider", "subscriptionId") DO UPDATE SET "occurredAt" = GREATEST("SecuritySubscriptionState"."occurredAt", EXCLUDED."occurredAt")`;
    // A subscription/checkout identifier is not a charge identifier; do not
    // consume an arbitrary pending checkout belonging to the same customer.
    const payment = await tx.payment.create({ data: { userId: user.id, email: user.email, plan: opts.plan, amount: opts.amount, currency: opts.currency, method: opts.provider, txId: opts.chargeId, status: "active", activatedAt: new Date() } });
    await tx.$executeRaw`INSERT INTO "SecurityPaymentCharge" ("provider", "chargeId", "paymentId", "currency") VALUES (${opts.provider}, ${opts.chargeId}, ${payment.id}, ${opts.currency})`;
    await auditBilling(tx, { actorUserId: null, userId: user.id, action: "charge", detail: { paymentId: payment.id, subscriptionId: opts.subscriptionId, ...(duplicateSubscription ? { duplicateRefund: true } : {}) } });
    if (duplicateSubscription) duplicateSubscription.paymentId = payment.id;
    await recordCrmPayment(tx, { ...opts, paymentId: payment.id, email: user.email, name: user.name });
    if (opts.checkoutId || opts.provider === "paypal") await tx.payment.updateMany({ where: { userId: user.id, method: opts.provider, txId: opts.checkoutId || opts.subscriptionId, status: "pending" }, data: { status: "subscription_active", activatedAt: new Date() } });
    // No "paid" receipt for a charge that is about to be refunded automatically.
    if (!duplicateSubscription) await queuePaidReceipt({ key: `${opts.provider}:${opts.chargeId}`, userId: user.id, email: user.email, name: user.name, plan: opts.plan, amount: opts.amount, currency: opts.currency, txId: opts.chargeId }, tx);
    return { duplicate: false, cancelOld, duplicateSubscription, classification };
  }, { timeout: 15_000 });

  const classification = "classification" in result ? result.classification : undefined;
  if (!result.duplicate && classification === "duplicate" && !autoRefundDuplicates) flagAttentionForDuplicate = true;
  if (flagAttentionForDuplicate) {
    await recordBillingAttention({
      provider: opts.provider, eventId: `dup:${opts.provider}:${opts.chargeId}`, eventType: "second_live_subscription",
      reason: "Second live subscription detected", chargeId: opts.chargeId, userId: opts.userId, amount: opts.amount, currency: opts.currency,
    });
  }
  if (!result.duplicate) await syncPlanLimitsSafely(opts.userId);
  return result;
}

export async function applyVerifiedLifecycle(opts: {
  provider: "dodo" | "paypal"; eventId: string; subscriptionId: string; occurredAt: Date;
  userId: string; plan: string; endAccess: boolean; state?: "cancelled" | "failed" | "expired" | "paused"; periodEnd?: Date | null;
  // The subscription is over for good even though state is "failed" (Dodo
  // subscription.failed: it never started). PayPal's PAYMENT.FAILED is not.
  subscriptionEnded?: boolean;
}) {
  if (!opts.eventId || !opts.subscriptionId || !Number.isFinite(opts.occurredAt.getTime())) throw new Error("Incomplete verified lifecycle event");
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"billing:" + opts.userId}, 0))`;
    const seen = await tx.$queryRaw<Array<{ eventId: string }>>`SELECT "eventId" FROM "SecurityBillingEvent" WHERE "provider" = ${opts.provider} AND "eventId" = ${opts.eventId}`;
    if (seen.length) return { duplicate: true, stale: false };
    const state = await tx.$queryRaw<Array<{ occurredAt: Date }>>`SELECT "occurredAt" FROM "SecuritySubscriptionState" WHERE "provider" = ${opts.provider} AND "subscriptionId" = ${opts.subscriptionId}`;
    const active = await tx.$queryRaw<Array<{ provider: string; subscriptionId: string; occurredAt: Date }>>`SELECT "provider", "subscriptionId", "occurredAt" FROM "SecurityUserBilling" WHERE "userId" = ${opts.userId}`;
    const stale = Boolean(state[0] && state[0].occurredAt > opts.occurredAt) || Boolean(active[0] && active[0].occurredAt > opts.occurredAt);
    await tx.$executeRaw`INSERT INTO "SecurityBillingEvent" ("provider", "eventId", "occurredAt") VALUES (${opts.provider}, ${opts.eventId}, ${opts.occurredAt})`;
    if (stale) return { duplicate: false, stale: true };
    const user = await tx.user.findUniqueOrThrow({ where: { id: opts.userId } });
    let scheduledActivated: Awaited<ReturnType<typeof tx.billingPlanChange.findFirst>> = null;
    let duplicateSubscription: DuplicateSubscriptionInfo | null = null;
    if (opts.state) {
      await queueBillingNotice({ key: `${opts.provider}:${opts.eventId}`, userId: user.id, email: user.email, name: user.name, plan: opts.plan, state: opts.state, accessUntil: user.planExpiresAt }, tx);
      await subscriptionRecord(tx, opts, user.email, opts.subscriptionEnded || opts.state === "cancelled" || opts.state === "expired" ? "subscription_inactive" : "subscription_active");
      const ownsCurrentAccess = !active[0] || (active[0].provider === opts.provider && active[0].subscriptionId === opts.subscriptionId);
      if (opts.endAccess && ownsCurrentAccess) await tx.user.update({ where: { id: user.id }, data: { plan: "free", planExpiresAt: null } });
      if (ownsCurrentAccess) await tx.$executeRaw`UPDATE "SecurityUserBilling" SET "occurredAt" = GREATEST("occurredAt", ${opts.occurredAt}) WHERE "userId" = ${user.id}`;
      // A cancel event (not a failed charge, pause or expiry) for the pointer
      // subscription: the provider will not bill it again, so auto-pay is off.
      // Not when this is the old subscription of a pending change whose new
      // subscription will take over billing (scheduled downgrade).
      const replacedByPending = await tx.billingPlanChange.findFirst({
        where: { userId: user.id, status: "pending", oldSubscriptionId: opts.subscriptionId, newSubscriptionId: { not: opts.subscriptionId } },
      });
      if (ownsCurrentAccess && opts.state === "cancelled" && active[0] && !replacedByPending) {
        await tx.$executeRaw`UPDATE "SecurityUserBilling" SET "autoRenew" = false WHERE "userId" = ${user.id}`;
      }
    } else {
      const pendingChange = await tx.billingPlanChange.findFirst({ where: { userId: user.id, status: "pending" } });
      const scheduledForThis = Boolean(
        pendingChange && pendingChange.newSubscriptionId === opts.subscriptionId &&
        pendingChange.effectiveAt && pendingChange.effectiveAt.getTime() > opts.occurredAt.getTime(),
      );
      const pointerRow = active[0] ?? null;
      const isExpected = !pointerRow || pointerRow.subscriptionId === opts.subscriptionId || Boolean(pendingChange && pendingChange.newSubscriptionId === opts.subscriptionId);

      if (scheduledForThis && pendingChange) {
        // A future-dated (scheduled downgrade/renew) subscription was just
        // approved. Record it, but leave plan/expiry/pointer untouched until
        // it actually starts billing; the caller cancels the old subscription.
        await subscriptionRecord(tx, opts, user.email, "subscription_active");
        scheduledActivated = pendingChange;
        if (pendingChange.kind === "renew") {
          // The user re-approved auto-pay for the same plan: reflect that
          // immediately rather than waiting for the first charge.
          await tx.$executeRaw`UPDATE "SecurityUserBilling" SET "autoRenew" = true WHERE "userId" = ${user.id}`;
        }
      } else if (!isExpected && process.env.BILLING_AUTO_REFUND_DUPLICATES === "true") {
        const liveRow = await tx.payment.findFirst({ where: { userId: user.id, method: pointerRow!.provider, txId: pointerRow!.subscriptionId, status: "subscription_active" } });
        if (liveRow) {
          // The current pointer subscription is still genuinely live: this is
          // an unexpected second subscription activating. Record it for
          // visibility, but do not move access onto it.
          await subscriptionRecord(tx, opts, user.email, "subscription_active");
          duplicateSubscription = { provider: opts.provider, subscriptionId: opts.subscriptionId };
        } else {
          // The pointer subscription isn't actually live any more (e.g. it
          // lapsed): this is a normal takeover, same as today's behaviour.
          const supplied = opts.periodEnd && Number.isFinite(opts.periodEnd.getTime()) ? withGrace(opts.periodEnd) : withGrace(planExpiry(opts.plan)!);
          const expiry = user.plan === opts.plan && user.planExpiresAt && supplied && user.planExpiresAt > supplied ? user.planExpiresAt : supplied;
          await tx.user.update({ where: { id: user.id }, data: { plan: opts.plan, planExpiresAt: expiry } });
          if (opts.subscriptionId !== ("chargeId" in opts ? opts.chargeId : undefined)) await subscriptionRecord(tx, opts, user.email, "subscription_active");
          await tx.$executeRaw`INSERT INTO "SecurityUserBilling" ("userId", "provider", "subscriptionId", "occurredAt") VALUES (${user.id}, ${opts.provider}, ${opts.subscriptionId}, ${opts.occurredAt}) ON CONFLICT ("userId") DO UPDATE SET "provider" = EXCLUDED."provider", "subscriptionId" = EXCLUDED."subscriptionId", "occurredAt" = EXCLUDED."occurredAt", "autoRenew" = CASE WHEN "SecurityUserBilling"."subscriptionId" = EXCLUDED."subscriptionId" THEN "SecurityUserBilling"."autoRenew" ELSE true END`;
        }
      } else {
        const supplied = opts.periodEnd && Number.isFinite(opts.periodEnd.getTime()) ? withGrace(opts.periodEnd) : withGrace(planExpiry(opts.plan)!);
        const expiry = user.plan === opts.plan && user.planExpiresAt && supplied && user.planExpiresAt > supplied ? user.planExpiresAt : supplied;
        await tx.user.update({ where: { id: user.id }, data: { plan: opts.plan, planExpiresAt: expiry } });
        if (opts.subscriptionId !== ("chargeId" in opts ? opts.chargeId : undefined)) await subscriptionRecord(tx, opts, user.email, "subscription_active");
        await tx.$executeRaw`INSERT INTO "SecurityUserBilling" ("userId", "provider", "subscriptionId", "occurredAt") VALUES (${user.id}, ${opts.provider}, ${opts.subscriptionId}, ${opts.occurredAt}) ON CONFLICT ("userId") DO UPDATE SET "provider" = EXCLUDED."provider", "subscriptionId" = EXCLUDED."subscriptionId", "occurredAt" = EXCLUDED."occurredAt", "autoRenew" = CASE WHEN "SecurityUserBilling"."subscriptionId" = EXCLUDED."subscriptionId" THEN "SecurityUserBilling"."autoRenew" ELSE true END`;
      }
    }
    await tx.$executeRaw`INSERT INTO "SecuritySubscriptionState" ("provider", "subscriptionId", "userId", "occurredAt") VALUES (${opts.provider}, ${opts.subscriptionId}, ${user.id}, ${opts.occurredAt}) ON CONFLICT ("provider", "subscriptionId") DO UPDATE SET "occurredAt" = EXCLUDED."occurredAt"`;
    return { duplicate: false, stale: false, scheduledActivated, duplicateSubscription };
  }, { timeout: 15_000 });
  if (!result.duplicate && !result.stale) await syncPlanLimitsSafely(opts.userId);
  return result;
}

export type ReversalKind = "refund" | "chargeback" | "dispute_opened";

// Applies a verified refund, chargeback or dispute to the charge it belongs to.
// A full refund or a lost chargeback ends the paid access that charge bought,
// unless a newer verified charge already covers the user. No-op on access if
// the payment is already 'refunded' (our own admin/duplicate refund already
// applied it locally, ahead of the provider's webhook).
export async function applyVerifiedReversal(opts: {
  provider: "dodo" | "paypal"; eventId: string; chargeId: string; occurredAt: Date; kind: ReversalKind; amount?: number | null; partial?: boolean;
}) {
  if (!opts.eventId || !opts.chargeId || !Number.isFinite(opts.occurredAt.getTime())) throw new Error("Incomplete verified reversal event");
  const payment = await prisma.payment.findFirst({ where: { method: opts.provider, txId: opts.chargeId, userId: { not: null } }, orderBy: { createdAt: "asc" } });
  if (!payment?.userId) return { matched: false as const };
  const userId = payment.userId;
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"billing:" + userId}, 0))`;
    const seen = await tx.$queryRaw<Array<{ eventId: string }>>`SELECT "eventId" FROM "SecurityBillingEvent" WHERE "provider" = ${opts.provider} AND "eventId" = ${opts.eventId}`;
    if (seen.length) return { matched: true as const, duplicate: true, userId, paymentId: payment.id, status: payment.status, accessEnded: false, ourRefund: false };
    await tx.$executeRaw`INSERT INTO "SecurityBillingEvent" ("provider", "eventId", "occurredAt") VALUES (${opts.provider}, ${opts.eventId}, ${opts.occurredAt})`;
    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const alreadyRefunded = current.status === "refunded";
    const partial = opts.kind === "refund" && (opts.partial === true || (opts.amount != null && opts.amount < payment.amount - 0.005));
    const status = opts.kind === "dispute_opened" ? "disputed" : partial ? "partially_refunded" : opts.kind === "refund" ? "refunded" : "charged_back";
    await tx.payment.update({ where: { id: payment.id }, data: { status } });
    let accessEnded = false;
    if (!alreadyRefunded && (status === "refunded" || status === "charged_back")) {
      const refundedSubscriptionId = await subscriptionIdForPayment(tx, userId, payment.id);
      const pointer = await tx.securityUserBilling.findUnique({ where: { userId } });
      let pointerLive = false;
      if (pointer) {
        const live = await tx.payment.findFirst({ where: { userId, method: pointer.provider, txId: pointer.subscriptionId, status: "subscription_active" } });
        pointerLive = Boolean(live);
      }
      const newerChargeExists = Boolean(await tx.payment.findFirst({ where: { userId: userId, id: { not: payment.id }, status: "active", method: { in: ["dodo", "paypal"] }, createdAt: { gt: payment.createdAt } } }));
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      const shouldEnd = decideAccessAfterRefund({ refundedSubscriptionId, pointerSubscriptionId: pointer?.subscriptionId ?? null, pointerLive, newerChargeExists, planMatches: user.plan === payment.plan });
      if (shouldEnd) {
        // Refunded: no trial again.
        await tx.user.update({ where: { id: userId }, data: { plan: "free", planExpiresAt: null, ...(user.trialEndsAt && user.trialEndsAt.getTime() > Date.now() ? { trialEndsAt: new Date() } : {}) } });
        accessEnded = true;
      }
    }
    // Our own admin/duplicate refund already applied it: the provider event is just the echo.
    const ourRefund = alreadyRefunded && Boolean(await tx.billingRefund.findFirst({ where: { paymentId: payment.id, status: "succeeded" } }));
    return { matched: true as const, duplicate: false, userId, paymentId: payment.id, status, accessEnded, ourRefund };
  }, { timeout: 15_000 });
  if (result.accessEnded) await syncPlanLimitsSafely(userId);
  return result;
}
