// Server-only billing actions: refunds, provider-subscription cancellation,
// local access recalculation, and the shared audit trail (billing spec 12f,
// 12c.8/9/10). Called from payment integrity (webhooks) and from admin/API
// routes that issue refunds or plan changes.
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { canRefund, decideAccessAfterRefund, isStalePendingChange } from "./billing-rules";
import { cancelPayPalSubscription, refundPayPalSale } from "./paypal";
import { cancelDodoSubscriptionNow, refundDodoPayment } from "./dodo";
import { recordBillingAttention } from "./billing-attention";
import { syncPlanLimits } from "./plan-limit-sync";

async function syncPlanLimitsSafely(userId: string) {
  try {
    await syncPlanLimits(userId);
  } catch (err) {
    console.error("[plan-limit-sync] failed after refund", userId, err instanceof Error ? err.message : String(err));
  }
}

type Db = Prisma.TransactionClient | typeof prisma;
type Provider = "paypal" | "dodo";

export async function auditBilling(
  db: Db,
  opts: { actorUserId?: string | null; userId: string; action: string; detail?: Record<string, unknown> | null },
) {
  await db.billingAuditLog.create({
    data: {
      actorUserId: opts.actorUserId ?? null,
      userId: opts.userId,
      action: opts.action,
      detail: (opts.detail ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

// Provider error messages for "there is nothing left to cancel" vary by
// provider and by exact state, but all mean the same thing for us: the
// subscription will not bill again, so the cancel is treated as a success
// instead of being surfaced as a failure that blocks a refund or plan change.
const ALREADY_CANCELLED_PATTERNS = [
  /already\s*cancel/i,
  /subscription_status_invalid/i,
  /status\s*is\s*not\s*active/i,
  /resource_not_found/i,
  /no\s*such\s*subscription/i,
  /invalid_resource_id/i,
];

function isAlreadyCancelledError(message: string) {
  return ALREADY_CANCELLED_PATTERNS.some((pattern) => pattern.test(message));
}

export async function cancelProviderSubscription(
  provider: Provider,
  subscriptionId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (provider === "paypal") await cancelPayPalSubscription(subscriptionId, reason);
    else await cancelDodoSubscriptionNow(subscriptionId);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isAlreadyCancelledError(message)) return { ok: true };
    return { ok: false, error: message.slice(0, 300) };
  }
}

// A charge's subscription isn't on the Payment row itself; recordVerifiedCharge
// writes it to a BillingAuditLog 'charge' row at the same time it records the
// charge, so refunds and reversals can look it up later.
export async function subscriptionIdForPayment(db: Db, userId: string, paymentId: string): Promise<string | null> {
  const log = await db.billingAuditLog.findFirst({
    where: { userId, action: "charge", detail: { path: ["paymentId"], equals: paymentId } },
    orderBy: { createdAt: "desc" },
  });
  const detail = log?.detail as { subscriptionId?: string } | null;
  return detail?.subscriptionId ?? null;
}

// Applies a succeeded refund's effect on access immediately, without waiting
// for the provider's own refund webhook. Idempotent: safe to call more than
// once, and a no-op on access once the payment is already 'refunded'.
export async function applyLocalRefund(
  paymentId: string,
  opts?: { subscriptionId?: string | null },
): Promise<{ accessEnded: boolean }> {
  const result = await prisma.$transaction(async (tx): Promise<{ accessEnded: boolean; userId: string | null }> => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment?.userId) return { accessEnded: false, userId: null };
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"billing:" + payment.userId}, 0))`;
    // Re-read under the lock: another caller may have refunded this payment
    // (or changed the user's plan) between our first read and the lock.
    const current = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    if (current.status === "refunded") return { accessEnded: false, userId: null };
    await tx.payment.update({ where: { id: paymentId }, data: { status: "refunded" } });

    const refundedSubscriptionId = opts?.subscriptionId ?? (await subscriptionIdForPayment(tx, payment.userId, paymentId));
    const pointer = await tx.securityUserBilling.findUnique({ where: { userId: payment.userId } });
    let pointerLive = false;
    if (pointer) {
      const live = await tx.payment.findFirst({
        where: { userId: payment.userId, method: pointer.provider, txId: pointer.subscriptionId, status: "subscription_active" },
      });
      pointerLive = Boolean(live);
    }
    const newerChargeExists = Boolean(await tx.payment.findFirst({ where: { userId: payment.userId, id: { not: paymentId }, status: "active", method: { in: ["dodo", "paypal"] }, createdAt: { gt: payment.createdAt } } }));
    const user = await tx.user.findUniqueOrThrow({ where: { id: payment.userId } });
    const shouldEnd = decideAccessAfterRefund({
      refundedSubscriptionId,
      pointerSubscriptionId: pointer?.subscriptionId ?? null,
      pointerLive,
      newerChargeExists,
      planMatches: user.plan === payment.plan,
    });
    if (!shouldEnd) return { accessEnded: false, userId: null };

    const data: Prisma.UserUpdateInput = { plan: "free", planExpiresAt: null };
    // Refund within 48h of a new purchase: back to free at once, no trial again.
    if (user.trialEndsAt && user.trialEndsAt.getTime() > Date.now()) data.trialEndsAt = new Date();
    await tx.user.update({ where: { id: payment.userId }, data });
    return { accessEnded: true, userId: payment.userId };
  }, { timeout: 15_000 });
  if (result.accessEnded && result.userId) await syncPlanLimitsSafely(result.userId);
  return { accessEnded: result.accessEnded };
}

export type RefundResult =
  | { ok: true; accessEnded: boolean; cancelled: boolean }
  | { ok: false; reason: string };

// One-click refund (12c.8) and automatic duplicate-subscription refund
// (12c.9). kind 'duplicate' is exempt only from the 48h window check -
// everything else (method, active status, amount, txId, already-refunded)
// still applies.
export async function refundPayment(opts: {
  paymentId: string;
  kind: "admin" | "duplicate";
  actorUserId: string | null;
  reason: string;
  now: Date;
  subscriptionId?: string | null;
}): Promise<RefundResult> {
  const payment = await prisma.payment.findUnique({ where: { id: opts.paymentId } });
  if (!payment?.userId) return { ok: false, reason: "not_found" };
  const userId = payment.userId;

  const existingRefund = await prisma.billingRefund.findUnique({ where: { paymentId: opts.paymentId } });
  const alreadyRefunded = Boolean(existingRefund && existingRefund.status !== "failed");
  const check = canRefund({ paymentCreatedAt: payment.createdAt, status: payment.status, method: payment.method, alreadyRefunded, now: opts.now });
  const windowOnlyFailure = !check.ok && check.reason === "window_closed" && opts.kind === "duplicate";
  if (!check.ok && !windowOnlyFailure) return { ok: false, reason: check.reason };
  if (!(payment.amount > 0)) return { ok: false, reason: "invalid_amount" };
  const txId = payment.txId;
  if (!txId) return { ok: false, reason: "missing_txid" };

  if (existingRefund) {
    if (existingRefund.status !== "failed") return { ok: false, reason: "already_refunded" };
    // Allow a retry after a previously failed attempt, guarded so a
    // concurrent retry can't both "win" the same failed row.
    const retried = await prisma.billingRefund.updateMany({
      where: { paymentId: opts.paymentId, status: "failed" },
      data: { status: "requested", error: null, reason: opts.reason, kind: opts.kind, requestedBy: opts.actorUserId ?? undefined },
    });
    if (retried.count === 0) return { ok: false, reason: "already_refunded" };
  } else {
    try {
      await prisma.billingRefund.create({
        data: {
          paymentId: opts.paymentId, provider: payment.method, amount: payment.amount, currency: payment.currency,
          reason: opts.reason, kind: opts.kind, requestedBy: opts.actorUserId ?? undefined, status: "requested",
        },
      });
    } catch {
      // Unique constraint on paymentId: a concurrent call won the race.
      return { ok: false, reason: "already_refunded" };
    }
  }

  let providerRefundId: string | null = null;
  try {
    if (payment.method === "paypal") {
      const result = await refundPayPalSale(txId, {});
      providerRefundId = result?.id ?? null;
    } else if (payment.method === "dodo") {
      const result = (await refundDodoPayment(txId, opts.reason)) as { id?: string; refund_id?: string } | null;
      providerRefundId = result?.id ?? result?.refund_id ?? null;
    } else {
      return { ok: false, reason: "unsupported_method" };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Leave the row as 'failed' (not deleted) so a retry can reuse it, but
    // never leaves a payment permanently unrefundable because of a transient
    // provider error.
    await prisma.billingRefund.update({ where: { paymentId: opts.paymentId }, data: { status: "failed", error: message.slice(0, 300) } });
    await recordBillingAttention({
      provider: payment.method as Provider, eventId: `refund:${opts.paymentId}`, eventType: "refund_failed",
      reason: `Refund attempt failed: ${message.slice(0, 200)}`, chargeId: txId, userId,
      email: payment.email, amount: payment.amount, currency: payment.currency,
    });
    await auditBilling(prisma, {
      actorUserId: opts.actorUserId, userId, action: opts.kind === "duplicate" ? "refund_duplicate_failed" : "refund_failed",
      detail: { paymentId: opts.paymentId, reason: message.slice(0, 200) },
    });
    return { ok: false, reason: "provider_error" };
  }

  await prisma.billingRefund.update({ where: { paymentId: opts.paymentId }, data: { status: "succeeded", providerRefundId, error: null } });

  // Payments recorded before the charge audit row existed have no
  // subscription on record: fall back to the user's current subscription
  // with the same provider (the 48h window keeps that the right one).
  let subscriptionId = opts.subscriptionId ?? (await subscriptionIdForPayment(prisma, userId, opts.paymentId));
  if (!subscriptionId) {
    const pointer = await prisma.securityUserBilling.findUnique({ where: { userId } });
    if (pointer && pointer.provider === payment.method) subscriptionId = pointer.subscriptionId;
  }
  let cancelled = false;
  if (subscriptionId) {
    const cancelResult = await cancelProviderSubscription(payment.method as Provider, subscriptionId, `refund:${opts.kind}`);
    cancelled = cancelResult.ok;
    if (!cancelResult.ok) {
      await recordBillingAttention({
        provider: payment.method as Provider, eventId: `refund-cancel:${opts.paymentId}`, eventType: "refund_cancel_failed",
        reason: `Refund succeeded but could not cancel subscription ${subscriptionId}: ${cancelResult.error}`,
        chargeId: txId, userId, email: payment.email,
      });
    }
  } else {
    await recordBillingAttention({
      provider: payment.method as Provider, eventId: `refund-cancel:${opts.paymentId}`, eventType: "refund_cancel_failed",
      reason: "Refund succeeded but no subscription was found to cancel. Check the provider dashboard.",
      chargeId: txId, userId, email: payment.email,
    });
  }

  const { accessEnded } = await applyLocalRefund(opts.paymentId, { subscriptionId });

  // A refunded customer must not be billed again by a scheduled downgrade or
  // renewal subscription they approved earlier.
  if (accessEnded) {
    const pending = await prisma.billingPlanChange.findFirst({ where: { userId, status: "pending" } });
    if (pending) {
      if (pending.newSubscriptionId && pending.newSubscriptionId !== subscriptionId) {
        const result = await cancelProviderSubscription(pending.provider as Provider, pending.newSubscriptionId, `refund:${opts.kind}`);
        if (!result.ok) {
          await recordBillingAttention({
            provider: pending.provider as Provider, eventId: `refund-pending-cancel:${pending.id}`, eventType: "refund_cancel_failed",
            reason: `Refund succeeded but could not cancel the scheduled subscription ${pending.newSubscriptionId}: ${result.error}`,
            chargeId: pending.newSubscriptionId, userId, email: payment.email,
          });
        }
      }
      await prisma.billingPlanChange.updateMany({ where: { id: pending.id, status: "pending" }, data: { status: "cancelled", updatedAt: new Date() } });
    }
  }

  await auditBilling(prisma, {
    actorUserId: opts.actorUserId, userId, action: opts.kind === "duplicate" ? "refund_duplicate" : "refund",
    detail: { paymentId: opts.paymentId, reason: opts.reason, providerRefundId, accessEnded, subscriptionCancelled: cancelled, subscriptionId },
  });

  return { ok: true, accessEnded, cancelled };
}

// Spec 12f: only one pending BillingPlanChange per user. A stale pending
// change (older than 1h, buyer never approved the new subscription) is
// cancelled so a new plan change can start; otherwise 409. Call this right
// before inserting any new pending BillingPlanChange row.
export async function reconcilePendingPlanChange(
  userId: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const pending = await prisma.billingPlanChange.findFirst({ where: { userId, status: "pending" } });
  if (!pending) return { ok: true };
  const inPlace = pending.newSubscriptionId === pending.oldSubscriptionId;
  let stale: boolean;
  if (inPlace) {
    // Dodo changes the plan on the same subscription, which is always live,
    // so "approved" says nothing. An upgrade whose charge never arrived in a
    // day, or a scheduled change a few days past its date, is dead.
    const age = now.getTime() - pending.createdAt.getTime();
    stale = (pending.kind === "upgrade" && age > 24 * 3_600_000)
      || Boolean(pending.effectiveAt && now.getTime() > pending.effectiveAt.getTime() + 3 * 86_400_000);
  } else {
    const approved = pending.newSubscriptionId
      ? Boolean(await prisma.payment.findFirst({ where: { userId, txId: pending.newSubscriptionId, status: "subscription_active" } }))
      : false;
    stale = isStalePendingChange({ createdAt: pending.createdAt, now, newSubscriptionWasApproved: approved });
  }
  if (stale) {
    const marked = await prisma.billingPlanChange.updateMany({ where: { id: pending.id, status: "pending" }, data: { status: "cancelled", updatedAt: new Date() } });
    // Cancel the never-approved new subscription at the provider too, so an
    // old approval link can't start a second live subscription later.
    if (marked.count && !inPlace && pending.newSubscriptionId) {
      const result = await cancelProviderSubscription(pending.provider as Provider, pending.newSubscriptionId, "plan_change_abandoned");
      if (!result.ok) {
        await recordBillingAttention({
          provider: pending.provider as Provider, eventId: `plan-change-abandoned:${pending.id}`, eventType: "plan_change_abandoned_cancel_failed",
          reason: `Abandoned plan change: could not cancel unapproved subscription ${pending.newSubscriptionId}: ${result.error}`,
          chargeId: pending.newSubscriptionId, userId,
        });
      }
    }
    return { ok: true };
  }
  return { ok: false, status: 409, error: "A plan change is already in progress" };
}

// Only one pending BillingPlanChange per user is enforced by a partial
// unique index at the DB level (Prisma cannot express it in the schema -
// prisma/billing_plan_change_20261014.sql). reconcilePendingPlanChange
// checks and clears a stale row first, but two concurrent requests can still
// both pass that check and race to insert (e.g. two browser tabs); this
// turns the resulting unique-constraint violation into the same friendly
// 409 instead of a raw 500.
export async function createPendingPlanChange(
  data: Prisma.BillingPlanChangeCreateInput,
): Promise<{ ok: true; change: Prisma.PromiseReturnType<typeof prisma.billingPlanChange.create> } | { ok: false; status: number; error: string }> {
  try {
    const change = await prisma.billingPlanChange.create({ data });
    return { ok: true, change };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, status: 409, error: "A plan change is already in progress" };
    }
    throw err;
  }
}

// After an upgrade/downgrade activates the new subscription, cancel the old
// one via the provider API. A cancel failure never undoes the plan change
// that already happened locally; it only gets flagged for a human to retry,
// and flips the already-completed BillingPlanChange row to 'failed' so it is
// visible as needing attention.
export async function completeOldSubscriptionCancel(change: {
  id?: string | null;
  userId: string;
  provider: string;
  oldSubscriptionId: string | null;
}): Promise<{ ok: boolean }> {
  if (!change.oldSubscriptionId) return { ok: true };
  const provider = change.provider as Provider;
  const result = await cancelProviderSubscription(provider, change.oldSubscriptionId, "plan_change");
  if (!result.ok) {
    await recordBillingAttention({
      provider, eventId: `plan-change-cancel:${change.id || change.oldSubscriptionId}`, eventType: "plan_change_old_cancel_failed",
      reason: `Plan change applied, but could not cancel the old subscription ${change.oldSubscriptionId}: ${result.error}`,
      chargeId: change.oldSubscriptionId, userId: change.userId,
    });
    if (change.id) await prisma.billingPlanChange.updateMany({ where: { id: change.id, status: "completed" }, data: { status: "failed" } });
  }
  await auditBilling(prisma, {
    actorUserId: null, userId: change.userId, action: "plan_change_old_subscription_cancelled",
    detail: { oldSubscriptionId: change.oldSubscriptionId, ok: result.ok, error: result.error ?? null },
  });
  return { ok: result.ok };
}
