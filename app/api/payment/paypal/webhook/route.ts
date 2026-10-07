import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { extendPlanExpiry, planExpiry, PLAN_PRICES } from "@/lib/billing";
import { getPlanFromPayPalPlanId, paypalRequest } from "@/lib/paypal";
import { renderPaidReceiptEmail, sendEmail } from "@/lib/email";
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

type PayPalWebhookEvent = {
  id?: string;
  event_type?: string;
  resource?: Record<string, any>;
};

type PayPalSubscription = {
  id?: string;
  custom_id?: string;
  plan_id?: string;
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

async function getSubscription(resource: Record<string, any>) {
  const id =
    resource.billing_agreement_id ||
    resource.subscription_id ||
    resource.supplementary_data?.related_ids?.subscription_id ||
    resource.supplementary_data?.related_ids?.billing_agreement_id;
  if (!id) return null;
  try {
    return await paypalRequest<PayPalSubscription>(`/v1/billing/subscriptions/${id}`);
  } catch (error) {
    console.error("[paypal/webhook] subscription lookup failed", { id: String(id).slice(0, 12), error });
    return null;
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
  if (!ACTIVATE_EVENTS.has(type) && !RENEWAL_EVENTS.has(type) && !DEACTIVATE_EVENTS.has(type)) {
    return NextResponse.json({ ok: true, ignored: type });
  }

  const resource = event.resource || {};
  const subscription = ACTIVATE_EVENTS.has(type)
    ? (resource as PayPalSubscription)
    : await getSubscription(resource);

  const subscriptionId = subscription?.id || resource.billing_agreement_id || resource.subscription_id || resource.supplementary_data?.related_ids?.subscription_id || null;
  const pendingBySubscription = subscriptionId
    ? await prisma.payment.findFirst({ where: { txId: subscriptionId, method: "paypal" }, orderBy: { createdAt: "desc" } })
    : null;
  const plan = getPlanFromPayPalPlanId(subscription?.plan_id || resource.plan_id) || pendingBySubscription?.plan || "";
  if (!(plan in PLAN_PRICES)) {
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
  if (!user) return NextResponse.json({ ok: true, note: "user not found" });

  if (DEACTIVATE_EVENTS.has(type)) {
    if (END_ACCESS_EVENTS.has(type)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { plan: "free", planExpiresAt: null },
      });
    }
    if (subscriptionId) {
      await prisma.payment.updateMany({
        where: { txId: subscriptionId, method: "paypal" },
        data: { status: "inactive" },
      });
    }
    await recordFunnelEvent(type === "BILLING.SUBSCRIPTION.PAYMENT.FAILED" ? "payment_failed" : "subscription_cancelled", {
      userId: user.id,
      source: "paypal",
      metadata: { plan, event: type },
    });
    return NextResponse.json({
      ok: true,
      deactivated: END_ACCESS_EVENTS.has(type) ? user.id : null,
      accessRetainedUntil: END_ACCESS_EVENTS.has(type) ? null : user.planExpiresAt,
      event: type,
    });
  }

  const newExpiry = RENEWAL_EVENTS.has(type)
    ? renewalExpiry(plan, user.planExpiresAt)
    : planExpiry(plan);

  await prisma.user.update({
    where: { id: user.id },
    data: { plan, planExpiresAt: newExpiry },
  });

  await recordFunnelEvent(RENEWAL_EVENTS.has(type) ? "subscription_renewed" : "subscription_activated", {
    userId: user.id,
    source: "paypal",
    metadata: { plan, event: type },
  });
  if (user.trialStartedAt && !RENEWAL_EVENTS.has(type)) {
    await recordFunnelEvent("trial_converted", { userId: user.id, source: "paypal", metadata: { plan } });
  }
  await markPartnerCustomer(user.id);

  // Subscription lifecycle events confirm access, not a cash transaction.
  // Only completed sales/captures below may record revenue and send receipts.
  if (ACTIVATE_EVENTS.has(type)) {
    if (subscriptionId) {
      await prisma.payment.updateMany({
        where: { txId: subscriptionId, method: "paypal" },
        data: { status: "subscription_active", activatedAt: new Date() },
      });
    }
    return NextResponse.json({ ok: true, activated: user.id, event: type });
  }

  const txId = String(resource.id || event.id || subscriptionId || "");

  const already = txId
    ? await prisma.payment.findFirst({ where: { txId, method: "paypal", status: "active" } })
    : null;
  if (!already) {
    await prisma.payment.create({
      data: {
        userId: user.id,
        email: user.email,
        plan,
        amount: moneyAmount(resource, plan),
        method: "paypal",
        txId: txId || null,
        status: "active",
        activatedAt: new Date(),
      },
    });

    await sendEmail({
      to: user.email,
      subject: `Your Wazap ${plan.charAt(0).toUpperCase() + plan.slice(1)} receipt`,
      html: renderPaidReceiptEmail({
        name: user.name,
        plan,
        amount: moneyAmount(resource, plan),
        txId: txId || subscriptionId,
        base: process.env.NEXTAUTH_URL ?? "https://wazap.lt",
      }),
    });
  }

  if (subscriptionId && RENEWAL_EVENTS.has(type)) {
    await prisma.payment.updateMany({
      where: { txId: subscriptionId, method: "paypal", status: "pending" },
      data: { status: "subscription_active", activatedAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, activated: user.id, event: type });
}
