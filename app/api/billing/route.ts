import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { paypalRequest } from "@/lib/paypal";
import { rateLimit } from "@/lib/rate-limit";
import { recordFunnelEvent } from "@/lib/funnel";
import { currentSubscriptionRecord } from "@/lib/subscription-record";
import { sameSiteRequest } from "@/lib/crm";
import { isPlanExpired } from "@/lib/billing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANCELLATION_REASONS = new Set([
  "too_expensive",
  "missing_features",
  "switched_service",
  "unused",
  "customer_service",
  "too_complex",
  "other",
]);

async function currentUser() {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, plan: true, planExpiresAt: true },
  });
}

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payment = await currentSubscriptionRecord(user.id);
  return NextResponse.json({
    plan: user.plan,
    accessActive: user.plan !== "free" && !isPlanExpired(user.plan, user.planExpiresAt),
    renewsOrExpiresAt: user.planExpiresAt,
    method: payment?.method || null,
    dodoPortalUrl: payment?.method === "dodo" ? "https://customer.dodopayments.com" : null,
    canCancel: payment?.method === "paypal",
    hasSubscription: Boolean(payment),
  });
}

export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`billing-cancel:${user.id}`, 3, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many billing changes. Please contact support." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { reason?: string };
  const reason = String(body.reason || "");
  if (!CANCELLATION_REASONS.has(reason)) {
    return NextResponse.json({ error: "Choose a cancellation reason." }, { status: 400 });
  }

  const subscription = await currentSubscriptionRecord(user.id);
  if (!subscription?.txId || subscription.method !== "paypal") {
    return NextResponse.json(
      { error: "No cancellable PayPal subscription was found. Open billing support for help." },
      { status: 409 },
    );
  }

  try {
    await paypalRequest(`/v1/billing/subscriptions/${encodeURIComponent(subscription.txId)}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason: `Wazap customer cancellation: ${reason}`.slice(0, 128) }),
    });
  } catch (error) {
    console.error("[billing/cancel] PayPal cancellation failed", error);
    return NextResponse.json(
      { error: "PayPal could not confirm cancellation. No account access was changed." },
      { status: 502 },
    );
  }

  await prisma.payment.updateMany({
    where: { userId: user.id, method: "paypal", txId: subscription.txId, status: { in: ["active", "subscription_active"] } },
    data: { status: "subscription_inactive" },
  });
  await recordFunnelEvent("subscription_cancelled", {
    userId: user.id,
    source: "paypal_self_service",
    metadata: { plan: subscription.plan, reason },
  });

  return NextResponse.json({
    cancelled: true,
    accessUntil: user.planExpiresAt,
    notice: "Renewal cancelled. Your paid access remains available through the current billing period.",
  });
}
