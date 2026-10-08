import { applyVerifiedLifecycle, recordVerifiedCharge } from "@/lib/payment-integrity";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { planExpiry, PLAN_PRICES } from "@/lib/billing";
import { queueBillingNotice, queuePaidReceipt } from "@/lib/billing-email";
import { recordFunnelEvent } from "@/lib/funnel";
import { markPartnerCustomer } from "@/lib/partners";

export const runtime = "nodejs";

const ACTIVATE_EVENTS = new Set(["subscription.active", "subscription.renewed", "payment.succeeded"]);
const DEACTIVATE_EVENTS = new Set([
  "subscription.cancelled",
  "subscription.canceled",
  "subscription.expired",
  "subscription.failed",
  "subscription.on_hold",
]);
const END_ACCESS_EVENTS = new Set(["subscription.expired"]);

function hasDodoSignatureHeaders(req: Request) {
  return ["webhook-id", "webhook-signature", "webhook-timestamp"].every((header) => Boolean(req.headers.get(header)));
}

export async function POST(req: Request) {
  const secret = process.env.DODO_WEBHOOK_KEY;
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
  const plan = String(meta.plan || "").toLowerCase();
  const txId =
    (data.payment_id as string) ||
    (data.subscription_id as string) ||
    (sub.subscription_id as string) ||
    (data.id as string) ||
    null;

  if (!ACTIVATE_EVENTS.has(type) && !DEACTIVATE_EVENTS.has(type)) {
    return NextResponse.json({ ok: true, ignored: type });
  }
  const pendingByTx = txId
    ? await prisma.payment.findFirst({ where: { txId, method: "dodo" }, orderBy: { createdAt: "desc" } })
    : null;
  const resolvedPlan = plan || pendingByTx?.plan || "";
  if (!(resolvedPlan in PLAN_PRICES)) {
    return NextResponse.json({ ok: true, note: "no Wazap plan in metadata" });
  }

  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : pendingByTx?.userId
      ? await prisma.user.findUnique({ where: { id: pendingByTx.userId } })
    : email
      ? await prisma.user.findUnique({ where: { email } })
      : null;
  if (!user) return NextResponse.json({ ok: true, note: "user not found" });

  const occurredAt = new Date(String(evt.timestamp || ""));
  const subscriptionId = String(data.subscription_id || sub.subscription_id || txId || "");
  if (!Number.isFinite(occurredAt.getTime()) || !subscriptionId) return NextResponse.json({ error: "Missing verified event identity." }, { status: 422 });
  if (type === "payment.succeeded") {
    const amount = Number(data.total_amount);
    const currency = String(data.currency || "").toUpperCase();
    // Dodo total_amount is denominated in currency minor units.
    const minorDigits = new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ?? 2;
    if (!data.payment_id || !Number.isSafeInteger(amount) || amount <= 0) return NextResponse.json({ error: "Missing verified charge data." }, { status: 422 });
    const result = await recordVerifiedCharge({ provider: "dodo", chargeId: String(data.payment_id), userId: user.id, plan: resolvedPlan, amount: amount / (10 ** minorDigits), currency, subscriptionId, occurredAt, checkoutId: typeof data.checkout_session_id === "string" ? data.checkout_session_id : undefined });
    if (!result.duplicate) {
      await recordFunnelEvent("subscription_renewed", { userId: user.id, source: "dodo", metadata: { plan: resolvedPlan, event: type } });
      await markPartnerCustomer(user.id);
    }
    return NextResponse.json({ ok: true, activated: user.id, event: type, duplicate: result.duplicate });
  }

  const deactivating = DEACTIVATE_EVENTS.has(type);
  const state = deactivating ? type === "subscription.failed" ? "failed" : type === "subscription.expired" ? "expired" : type === "subscription.on_hold" ? "paused" : "cancelled" : undefined;
  const result = await applyVerifiedLifecycle({ provider: "dodo", eventId: req.headers.get("webhook-id")!, subscriptionId, occurredAt, userId: user.id, plan: resolvedPlan, endAccess: END_ACCESS_EVENTS.has(type), state, periodEnd: typeof data.next_billing_date === "string" ? new Date(data.next_billing_date) : null });
  if (!result.duplicate && !result.stale && !deactivating) await markPartnerCustomer(user.id);
  return NextResponse.json({ ok: true, event: type, ...result });
}
