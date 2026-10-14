import { applyVerifiedLifecycle, applyVerifiedReversal, recordVerifiedCharge, type ReversalKind } from "@/lib/payment-integrity";
import { completeOldSubscriptionCancel, cancelProviderSubscription, refundPayment } from "@/lib/billing-actions";
import { recordBillingAttention } from "@/lib/billing-attention";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { planExpiry, PLAN_PRICES } from "@/lib/billing";
import { getDodoSubscription, planForDodoProduct } from "@/lib/dodo";
import { queueBillingNotice, queuePaidReceipt } from "@/lib/billing-email";
import { recordFunnelEvent } from "@/lib/funnel";
import { markPartnerCustomer } from "@/lib/partners";

export const runtime = "nodejs";

// subscription.plan_changed is deliberately not handled: it may arrive for a
// change that is only scheduled, or before the upgrade charge succeeded. A
// plan change takes effect on its payment.succeeded instead.
const ACTIVATE_EVENTS = new Set(["subscription.active", "subscription.renewed", "payment.succeeded"]);
const DEACTIVATE_EVENTS = new Set([
  "subscription.cancelled",
  "subscription.canceled",
  "subscription.expired",
  "subscription.failed",
  "subscription.on_hold",
]);
const END_ACCESS_EVENTS = new Set(["subscription.expired"]);
// Refunds and disputes. Opened disputes are flagged; refunds and lost disputes end access.
const REVERSAL_EVENTS: Record<string, ReversalKind> = {
  "refund.succeeded": "refund",
  "dispute.opened": "dispute_opened",
  "dispute.lost": "chargeback",
  "dispute.accepted": "chargeback",
};

function minorToMajor(amount: unknown, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value) || !/^[A-Z]{3}$/.test(currency)) return null;
  const digits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
  return value / (10 ** digits);
}

function hasDodoSignatureHeaders(req: Request) {
  return ["webhook-id", "webhook-signature", "webhook-timestamp"].every((header) => Boolean(req.headers.get(header)));
}

// Post-transaction follow-ups (cancelling an old subscription, auto-refunding
// a duplicate) call out to providers and must never turn a successfully
// processed webhook into a non-2xx response - failures only go to BillingAttention.
async function runPostTransactionActions(opts: {
  cancelOld?: { provider: string; subscriptionId: string; planChangeId?: string | null } | null;
  duplicateSubscription?: { paymentId?: string; provider: string; subscriptionId: string } | null;
  userId: string;
}) {
  try {
    if (opts.cancelOld) {
      await completeOldSubscriptionCancel({ id: opts.cancelOld.planChangeId ?? null, userId: opts.userId, provider: opts.cancelOld.provider, oldSubscriptionId: opts.cancelOld.subscriptionId });
    }
    if (opts.duplicateSubscription) {
      if (opts.duplicateSubscription.paymentId) {
        await refundPayment({ paymentId: opts.duplicateSubscription.paymentId, kind: "duplicate", actorUserId: null, reason: "Automatic duplicate subscription refund", now: new Date(), subscriptionId: opts.duplicateSubscription.subscriptionId });
      } else {
        const cancelResult = await cancelProviderSubscription(opts.duplicateSubscription.provider as "paypal" | "dodo", opts.duplicateSubscription.subscriptionId, "duplicate_subscription");
        await recordBillingAttention({
          provider: opts.duplicateSubscription.provider as "paypal" | "dodo", eventId: `dup-activation:${opts.duplicateSubscription.provider}:${opts.duplicateSubscription.subscriptionId}`,
          eventType: "second_live_subscription_activated", userId: opts.userId,
          reason: cancelResult.ok ? "Second live subscription detected and cancelled automatically." : `Second live subscription detected; cancel failed: ${cancelResult.error}`,
        });
      }
    }
  } catch (err) {
    console.error("[dodo/webhook] post-transaction billing action failed", err);
  }
}

export async function POST(req: Request) {
  const secret = process.env.DODO_WEBHOOK_KEY;
  const webhookId = req.headers.get("webhook-id") || "";
  if (!secret) return NextResponse.json({ error: "Webhook not configured." }, { status: 501 });

  const raw = await req.text();
  let evt: { type?: string; timestamp?: string; data?: Record<string, unknown> };
  try {
    if (!hasDodoSignatureHeaders(req)) {
      return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
    }
    const { Webhook } = await import("standardwebhooks");
    const wh = new Webhook(secret);
    evt = wh.verify(raw, {
      "webhook-id": req.headers.get("webhook-id") || "",
      "webhook-signature": req.headers.get("webhook-signature") || "",
      "webhook-timestamp": req.headers.get("webhook-timestamp") || "",
    }) as { type?: string; timestamp?: string; data?: Record<string, unknown> };
  } catch (err) {
    console.error("[dodo/webhook] bad signature", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  const type = String(evt.type || "");
  const data = (evt.data || {}) as Record<string, unknown>;
  const sub = (data.subscription as Record<string, unknown>) || {};
  const meta = (data.metadata || sub.metadata || {}) as Record<string, string>;
  const customer = (data.customer || {}) as Record<string, string>;
  const userId = meta.user_id || null;
  const email = String(meta.email || customer.email || "").toLowerCase();
  // PAY-5: a Dodo plan change swaps the product on the existing subscription
  // without new metadata, so the product id is the trustworthy source; the
  // checkout-time metadata is only a fallback for the original purchase.
  const productId = (data.product_id as string) || (sub.product_id as string) || null;
  const plan = planForDodoProduct(productId) || String(meta.plan || "").toLowerCase();
  const txId =
    (data.payment_id as string) ||
    (data.subscription_id as string) ||
    (sub.subscription_id as string) ||
    (data.id as string) ||
    null;

  if (type in REVERSAL_EVENTS) {
    const chargeId = String(data.payment_id || "");
    const currency = String(data.currency || "").toUpperCase();
    const amount = minorToMajor(data.amount, currency);
    const occurredAt = new Date(String(evt.timestamp || ""));
    if (!chargeId || !Number.isFinite(occurredAt.getTime())) return NextResponse.json({ error: "Missing verified event identity." }, { status: 422 });
    const result = await applyVerifiedReversal({ provider: "dodo", eventId: webhookId, chargeId, occurredAt, kind: REVERSAL_EVENTS[type], amount, partial: data.is_partial === true });
    if (!(result.matched && result.ourRefund)) {
      await recordBillingAttention({ provider: "dodo", eventId: webhookId, eventType: type, chargeId, userId: result.matched ? result.userId : null, amount, currency,
        reason: !result.matched ? "Refund or dispute for a payment Wazap has no record of." : result.accessEnded ? `Payment ${result.status}. Paid access was removed.` : `Payment ${result.status}. Access unchanged; review the customer.` });
    }
    return NextResponse.json({ ok: true, event: type, ...result });
  }
  if (!ACTIVATE_EVENTS.has(type) && !DEACTIVATE_EVENTS.has(type)) {
    return NextResponse.json({ ok: true, ignored: type });
  }
  const pendingByTx = txId
    ? await prisma.payment.findFirst({ where: { txId, method: "dodo" }, orderBy: { createdAt: "desc" } })
    : null;
  const resolvedPlan = plan || pendingByTx?.plan || "";
  if (!(resolvedPlan in PLAN_PRICES)) {
    await recordBillingAttention({ provider: "dodo", eventId: webhookId, eventType: type, reason: "Verified payment event without a Wazap plan.", chargeId: txId, email: email || null });
    return NextResponse.json({ ok: true, note: "no Wazap plan in metadata" });
  }

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : pendingByTx?.userId
      ? await prisma.user.findUnique({ where: { id: pendingByTx.userId } })
    : email
      ? await prisma.user.findUnique({ where: { email } })
      : null;
  if (!user) {
    // Keep it visible and let Dodo retry: the account may be created moments later.
    await recordBillingAttention({ provider: "dodo", eventId: webhookId, eventType: type, reason: `Verified ${resolvedPlan} payment event for an unknown Wazap account.`, chargeId: txId, email: email || null });
    return NextResponse.json({ error: "User not found." }, { status: 503 });
  }

  const occurredAt = new Date(String(evt.timestamp || ""));
  const subscriptionId = String(data.subscription_id || sub.subscription_id || txId || "");
  if (!Number.isFinite(occurredAt.getTime()) || !subscriptionId) return NextResponse.json({ error: "Missing verified event identity." }, { status: 422 });
  if (type === "payment.succeeded") {
    const amount = Number(data.total_amount);
    const currency = String(data.currency || "").toUpperCase();
    // Dodo total_amount is denominated in currency minor units.
    const minorDigits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    // A $0 payment is Dodo verifying a card (e.g. "Update card"), not a charge.
    if (data.payment_id && amount === 0) return NextResponse.json({ ok: true, ignored: "zero_amount_card_check" });
    if (!data.payment_id || !Number.isSafeInteger(amount) || amount <= 0) return NextResponse.json({ error: "Missing verified charge data." }, { status: 422 });
    // A subscription payment carries no product id, and the checkout metadata
    // keeps the original plan after a plan change. Read the plan (and billing
    // date) from the live subscription.
    let chargePlan = resolvedPlan;
    let nextBillingDate = typeof sub.next_billing_date === "string" ? sub.next_billing_date : null;
    if (data.subscription_id) {
      try {
        const live = await getDodoSubscription(String(data.subscription_id));
        chargePlan = planForDodoProduct(live.product_id) || resolvedPlan;
        nextBillingDate = nextBillingDate || live.next_billing_date || null;
      } catch (err) {
        // Only a customer who ever changed plan on Dodo can be on a plan that
        // differs from the metadata; for them, let Dodo retry.
        const changed = await prisma.billingPlanChange.findFirst({ where: { userId: user.id, provider: "dodo" } });
        if (changed) {
          console.error("[dodo/webhook] subscription lookup failed", err instanceof Error ? err.message : String(err));
          return NextResponse.json({ error: "Subscription lookup failed." }, { status: 503 });
        }
      }
    }
    const result = await recordVerifiedCharge({ provider: "dodo", chargeId: String(data.payment_id), userId: user.id, plan: chargePlan, amount: amount / (10 ** minorDigits), currency, subscriptionId, occurredAt, checkoutId: typeof data.checkout_session_id === "string" ? data.checkout_session_id : undefined, periodEnd: nextBillingDate ? new Date(nextBillingDate) : null });
    if (!result.duplicate) {
      await recordFunnelEvent("subscription_renewed", { userId: user.id, source: "dodo", metadata: { plan: resolvedPlan, event: type } });
      await markPartnerCustomer(user.id);
    }
    await runPostTransactionActions({ cancelOld: result.cancelOld, duplicateSubscription: result.duplicateSubscription, userId: user.id });
    return NextResponse.json({ ok: true, activated: user.id, event: type, duplicate: result.duplicate });
  }

  const deactivating = DEACTIVATE_EVENTS.has(type);
  const state = deactivating ? type === "subscription.failed" ? "failed" : type === "subscription.expired" ? "expired" : type === "subscription.on_hold" ? "paused" : "cancelled" : undefined;
  const result = await applyVerifiedLifecycle({ provider: "dodo", eventId: webhookId, subscriptionId, occurredAt, userId: user.id, plan: resolvedPlan, endAccess: END_ACCESS_EVENTS.has(type), state, subscriptionEnded: type === "subscription.failed", periodEnd: typeof data.next_billing_date === "string" ? new Date(data.next_billing_date) : null });
  if (!result.duplicate && !result.stale && !deactivating) await markPartnerCustomer(user.id);
  if (!result.duplicate && !result.stale && !deactivating) {
    // A scheduled (future-dated) subscription has just been approved.
    // Downgrade: cancel the old subscription now, but the change stays
    // 'pending' until the first charge on the new one. Renew: the old
    // subscription was already cancelled when auto-pay was turned off, so
    // there is nothing to cancel - applyVerifiedLifecycle already set
    // SecurityUserBilling.autoRenew back to true for that case.
    await runPostTransactionActions({
      // Dodo changes plans in place (old === new): never cancel the subscription itself.
      cancelOld: result.scheduledActivated?.kind === "downgrade" && result.scheduledActivated.oldSubscriptionId && result.scheduledActivated.oldSubscriptionId !== result.scheduledActivated.newSubscriptionId
        ? { provider: result.scheduledActivated.provider, subscriptionId: result.scheduledActivated.oldSubscriptionId, planChangeId: result.scheduledActivated.id }
        : null,
      duplicateSubscription: result.duplicateSubscription,
      userId: user.id,
    });
  }
  return NextResponse.json({ ok: true, event: type, duplicate: result.duplicate, stale: result.stale, scheduled: Boolean(result.scheduledActivated), secondSubscription: Boolean(result.duplicateSubscription) });
}
