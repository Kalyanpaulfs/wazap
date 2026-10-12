import { applyVerifiedLifecycle, applyVerifiedReversal, recordVerifiedCharge, type ReversalKind } from "@/lib/payment-integrity";
import { recordBillingAttention } from "@/lib/billing-attention";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extendPlanExpiry, planExpiry, PLAN_PRICES } from "@/lib/billing";
import { getPlanFromPayPalPlanId, paypalRequest } from "@/lib/paypal";
import { queueBillingNotice, queuePaidReceipt } from "@/lib/billing-email";
import { recordFunnelEvent } from "@/lib/funnel";
import { markPartnerCustomer } from "@/lib/partners";

export const runtime = "nodejs";

const ACTIVATE_EVENTS = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.RE-ACTIVATED",
]);

const RENEWAL_EVENTS = new Set([
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.CAPTURE.COMPLETED",
]);

const DEACTIVATE_EVENTS = new Set([
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED",
]);
const END_ACCESS_EVENTS = new Set(["BILLING.SUBSCRIPTION.EXPIRED"]);
// Refunds, reversals (chargebacks) and disputes.
const REVERSAL_EVENTS: Record<string, ReversalKind> = {
  "PAYMENT.SALE.REFUNDED": "refund",
  "PAYMENT.CAPTURE.REFUNDED": "refund",
  "PAYMENT.SALE.REVERSED": "chargeback",
  "PAYMENT.CAPTURE.REVERSED": "chargeback",
  "CUSTOMER.DISPUTE.CREATED": "dispute_opened",
};

// The original charge a refund/reversal/dispute refers to.
function reversedChargeId(type: string, resource: Record<string, any>): string {
  if (type.startsWith("CUSTOMER.DISPUTE.")) return String(resource.disputed_transactions?.[0]?.seller_transaction_id || "");
  if (resource.sale_id) return String(resource.sale_id);
  const up = Array.isArray(resource.links) ? resource.links.find((link: { rel?: string; href?: string }) => link.rel === "up")?.href : "";
  if (up) return String(up).split("/").pop() || "";
  return type.endsWith(".REVERSED") ? String(resource.id || "") : "";
}

type PayPalWebhookEvent = {
  id?: string;
  create_time?: string;
  event_type?: string;
  resource?: Record<string, any>;
};

type PayPalSubscription = {
  id?: string;
  custom_id?: string;
  plan_id?: string;
  billing_info?: { next_billing_time?: string };
  subscriber?: { email_address?: string; name?: { given_name?: string; surname?: string } };
};

function hasPayPalSignatureHeaders(req: Request) {
  return [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ].every((header) => Boolean(req.headers.get(header)));
}

async function verifyPayPalWebhook(req: Request, event: PayPalWebhookEvent) {
  // Local development only: PayPal cannot sign events sent to localhost.
  if (process.env.NODE_ENV !== "production" && process.env.PAYMENT_WEBHOOK_DEV_SKIP_VERIFY === "true") return;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) throw new Error("PayPal webhook ID is not configured.");
  if (!hasPayPalSignatureHeaders(req)) {
    throw new Error("Missing PayPal signature headers.");
  }

  const result = await paypalRequest<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: JSON.stringify({
      auth_algo: req.headers.get("paypal-auth-algo"),
      cert_url: req.headers.get("paypal-cert-url"),
      transmission_id: req.headers.get("paypal-transmission-id"),
      transmission_sig: req.headers.get("paypal-transmission-sig"),
      transmission_time: req.headers.get("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    }),
  });

  if (result.verification_status !== "SUCCESS") {
    throw new Error(`PayPal webhook verification failed: ${result.verification_status || "unknown"}`);
  }
}

function moneyAmount(resource: Record<string, any>, plan: string) {
  const amount = resource.amount?.total || resource.amount?.value || PLAN_PRICES[plan];
  const parsed = Number(amount);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : PLAN_PRICES[plan];
}

function renewalExpiry(plan: string, currentExpiresAt: Date | null | undefined) {
  if (currentExpiresAt && currentExpiresAt.getTime() > Date.now() + 20 * 86_400_000) {
    return currentExpiresAt;
  }
  return extendPlanExpiry(plan, currentExpiresAt);
}

async function getSubscription(resource: Record<string, any>): Promise<{ subscription: PayPalSubscription | null; failed: boolean }> {
  const id =
    resource.billing_agreement_id ||
    resource.subscription_id ||
    resource.supplementary_data?.related_ids?.subscription_id ||
    resource.supplementary_data?.related_ids?.billing_agreement_id;
  if (!id) return { subscription: null, failed: false };
  try {
    return { subscription: await paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${id}`), failed: false };
  } catch (error) {
    console.error("[paypal/webhook] subscription lookup failed", { id: String(id).slice(0, 12), error });
    return { subscription: null, failed: true };
  }
}

export async function POST(req: Request) {
  const raw = await req.text();
  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(raw) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  try {
    await verifyPayPalWebhook(req, event);
  } catch (err) {
    if (!(err instanceof Error && err.message === "Missing PayPal signature headers.")) {
      console.error("[paypal/webhook] bad signature", err);
    }
    return NextResponse.json({ error: "Invalid PayPal signature." }, { status: 400 });
  }

  const type = String(event.event_type || "");
  const resource = event.resource || {};
  if (type in REVERSAL_EVENTS) {
    const chargeId = reversedChargeId(type, resource);
    const occurredAt = new Date(String(event.create_time || ""));
    if (!event.id || !chargeId || !Number.isFinite(occurredAt.getTime())) return NextResponse.json({ error: "Missing verified event identity." }, { status: 422 });
    const amountValue = Number(resource.amount?.total ?? resource.amount?.value ?? resource.disputed_transactions?.[0]?.gross_amount?.value);
    const amount = Number.isFinite(amountValue) && amountValue > 0 ? amountValue : null;
    const currency = String(resource.amount?.currency ?? resource.amount?.currency_code ?? resource.disputed_transactions?.[0]?.gross_amount?.currency_code ?? "").toUpperCase() || null;
    const result = await applyVerifiedReversal({ provider: "paypal", eventId: event.id, chargeId, occurredAt, kind: REVERSAL_EVENTS[type], amount });
    await recordBillingAttention({ provider: "paypal", eventId: event.id, eventType: type, chargeId, userId: result.matched ? result.userId : null, amount, currency,
      reason: !result.matched ? "Refund, reversal or dispute for a payment Wazap has no record of." : result.accessEnded ? `Payment ${result.status}. Paid access was removed.` : `Payment ${result.status}. Access unchanged; review the customer.` });
    return NextResponse.json({ ok: true, event: type, ...result });
  }
  if (!ACTIVATE_EVENTS.has(type) && !RENEWAL_EVENTS.has(type) && !DEACTIVATE_EVENTS.has(type)) {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const lookup = ACTIVATE_EVENTS.has(type)
    ? { subscription: resource as PayPalSubscription, failed: false }
    : await getSubscription(resource);
  // Without the subscription we may not know the plan or customer: let PayPal retry.
  if (lookup.failed) return NextResponse.json({ error: "Subscription lookup failed." }, { status: 503 });
  const subscription = lookup.subscription;
  const nextBilling = subscription?.billing_info?.next_billing_time ? new Date(subscription.billing_info.next_billing_time) : null;
  const periodEnd = nextBilling && Number.isFinite(nextBilling.getTime()) ? nextBilling : null;

  const subscriptionId = subscription?.id || resource.billing_agreement_id || resource.subscription_id || resource.supplementary_data?.related_ids?.subscription_id || null;
  const pendingBySubscription = subscriptionId
    ? await prisma.payment.findFirst({ where: { txId: subscriptionId, method: "paypal" }, orderBy: { createdAt: "desc" } })
    : null;
  const plan = getPlanFromPayPalPlanId(subscription?.plan_id || resource.plan_id) || pendingBySubscription?.plan || "";
  if (!(plan in PLAN_PRICES)) {
    await recordBillingAttention({ provider: "paypal", eventId: String(event.id || ""), eventType: type, reason: "Verified PayPal event without a Wazap plan.", chargeId: resource.id || subscriptionId });
    return NextResponse.json({ ok: true, note: "no Wazap plan in PayPal event" });
  }

  const email = String(subscription?.subscriber?.email_address || resource.payer?.payer_info?.email || "").toLowerCase();
  const user = subscription?.custom_id
    ? await prisma.user.findUnique({ where: { id: subscription.custom_id } })
    : pendingBySubscription?.userId
      ? await prisma.user.findUnique({ where: { id: pendingBySubscription.userId } })
    : email
      ? await prisma.user.findUnique({ where: { email } })
      : null;
  if (!user) {
    await recordBillingAttention({ provider: "paypal", eventId: String(event.id || ""), eventType: type, reason: `Verified ${plan} PayPal event for an unknown Wazap account.`, chargeId: resource.id || subscriptionId, email: email || null });
    return NextResponse.json({ error: "User not found." }, { status: 503 });
  }

  const occurredAt = new Date(String(event.create_time || ""));
  if (!event.id || !subscriptionId || !Number.isFinite(occurredAt.getTime())) return NextResponse.json({ error: "Missing verified event identity." }, { status: 422 });
  if (RENEWAL_EVENTS.has(type)) {
    const amount = Number(resource.amount?.total ?? resource.amount?.value);
    const currency = String(resource.amount?.currency ?? resource.amount?.currency_code ?? "").toUpperCase();
    if (!resource.id || !Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return NextResponse.json({ error: "Missing verified charge data." }, { status: 422 });
    const result = await recordVerifiedCharge({ provider: "paypal", chargeId: String(resource.id), userId: user.id, plan, amount, currency, subscriptionId, occurredAt, periodEnd });
    if (!result.duplicate) {
      await recordFunnelEvent("subscription_renewed", { userId: user.id, source: "paypal", metadata: { plan, event: type } });
      await markPartnerCustomer(user.id);
    }
    return NextResponse.json({ ok: true, activated: user.id, event: type, duplicate: result.duplicate });
  }

  const deactivating = DEACTIVATE_EVENTS.has(type);
  const state = deactivating ? type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" ? "failed" : type === "BILLING.SUBSCRIPTION.EXPIRED" ? "expired" : type === "BILLING.SUBSCRIPTION.SUSPENDED" ? "paused" : "cancelled" : undefined;
  const result = await applyVerifiedLifecycle({ provider: "paypal", eventId: event.id, subscriptionId, occurredAt, userId: user.id, plan, endAccess: END_ACCESS_EVENTS.has(type), state, periodEnd: state ? null : periodEnd });
  if (!result.duplicate && !result.stale && !deactivating) await markPartnerCustomer(user.id);
  return NextResponse.json({ ok: true, event: type, ...result });
}
