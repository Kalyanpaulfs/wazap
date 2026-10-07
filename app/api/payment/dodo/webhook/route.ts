import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { planExpiry, PLAN_PRICES } from "@/lib/billing";
import { renderPaidReceiptEmail, sendEmail } from "@/lib/email";
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
  let evt: { type?: string; data?: Record<string, unknown> };
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
    }) as { type?: string; data?: Record<string, unknown> };
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

  if (DEACTIVATE_EVENTS.has(type)) {
    if (END_ACCESS_EVENTS.has(type)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { plan: "free", planExpiresAt: null },
      });
    }
    await recordFunnelEvent(type === "subscription.failed" ? "payment_failed" : "subscription_cancelled", {
      userId: user.id,
      source: "dodo",
      metadata: { plan: resolvedPlan, event: type },
    });
    return NextResponse.json({
      ok: true,
      deactivated: END_ACCESS_EVENTS.has(type) ? user.id : null,
      accessRetainedUntil: END_ACCESS_EVENTS.has(type) ? null : user.planExpiresAt,
    });
  }

  const providerPeriodEnd =
    type.startsWith("subscription.") && typeof data.next_billing_date === "string"
      ? new Date(data.next_billing_date)
      : null;
  const periodEnd = providerPeriodEnd && !Number.isNaN(providerPeriodEnd.getTime())
    ? providerPeriodEnd
    : planExpiry(resolvedPlan);
  await prisma.user.update({
    where: { id: user.id },
    data: { plan: resolvedPlan, planExpiresAt: periodEnd },
  });
  await recordFunnelEvent(type === "subscription.renewed" ? "subscription_renewed" : "subscription_activated", { userId: user.id, source: "dodo", metadata: { plan: resolvedPlan, event: type } });
  if (user.trialStartedAt) {
    await recordFunnelEvent("trial_converted", { userId: user.id, source: "dodo", metadata: { plan: resolvedPlan } });
  }
  await markPartnerCustomer(user.id);

  // Subscription lifecycle events govern access. Only successful charges are
  // revenue. Dodo emits both kinds for initial subscriptions; recording both
  // as payments would double-count revenue and send duplicate receipts.
  if (type !== "payment.succeeded") {
    return NextResponse.json({ ok: true, activated: user.id, event: type });
  }

  const already = txId
    ? await prisma.payment.findFirst({ where: { txId, method: "dodo", status: "active" } })
    : null;
  if (!already) {
    const pending = await prisma.payment.findFirst({
      where: { userId: user.id, method: "dodo", plan: resolvedPlan, status: "pending" },
      orderBy: { createdAt: "desc" },
    });
    if (pending) {
      await prisma.payment.update({
        where: { id: pending.id },
        data: { txId: txId || pending.txId, status: "active", activatedAt: new Date() },
      });
    } else {
      await prisma.payment.create({
        data: {
          userId: user.id,
          email: user.email,
          plan: resolvedPlan,
          amount: PLAN_PRICES[resolvedPlan],
          method: "dodo",
          txId,
          status: "active",
          activatedAt: new Date(),
        },
      });
    }

    await sendEmail({
      to: user.email,
      subject: `Your Wazap ${resolvedPlan.charAt(0).toUpperCase() + resolvedPlan.slice(1)} receipt`,
      html: renderPaidReceiptEmail({
        name: user.name,
        plan: resolvedPlan,
        amount: PLAN_PRICES[resolvedPlan],
        txId,
        base: process.env.NEXTAUTH_URL ?? "https://wazap.lt",
      }),
    });
  }

  return NextResponse.json({ ok: true, activated: user.id, event: type });
}
