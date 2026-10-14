import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PLAN_PRICES } from "@/lib/billing";
import { recordFunnelEvent } from "@/lib/funnel";
import { dodoProductForPlan, getDodoClient } from "@/lib/dodo";

import { currentSubscriptionRecord } from "@/lib/subscription-record";
import { sameSiteRequest } from "@/lib/crm";
import { sharedRateLimit } from "@/lib/shared-rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let checkoutUserId: string | null = null;
  let checkoutPlan: string | null = null;
  try {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Dodo payments are being set up." }, { status: 501 });
    }

    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Create or sign in to your Wazap account before payment." }, { status: 401 });
    }

    const dodoEnvAllowed =
      process.env.DODO_ENVIRONMENT === "live_mode" ||
      (process.env.DODO_ENVIRONMENT === "test_mode" && process.env.NODE_ENV !== "production");
    if (!dodoEnvAllowed || process.env.DODO_CHECKOUT_ENABLED !== "true") {
      return NextResponse.json({ error: "Card checkout is not available yet. Please use PayPal." }, { status: 503 });
    }

    const userId = (session.user as { id?: string }).id;
    const email = (session.user.email ?? "").toLowerCase();
    if (!userId) {
      return NextResponse.json({ error: "Please sign in again before payment." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { plan?: string };
    const plan = (body.plan ?? "").toLowerCase();
    checkoutUserId = userId;
    checkoutPlan = plan;
    const productId = dodoProductForPlan(plan);
    if (!productId || !(plan in PLAN_PRICES)) {
      return NextResponse.json({ error: "This Wazap plan is still being connected to Dodo." }, { status: 501 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== email) {
      return NextResponse.json({ error: "Account not found. Please sign in again." }, { status: 401 });
    }

    const existingSubscription = await currentSubscriptionRecord(user.id);
    if (existingSubscription) return NextResponse.json({ error: "You already have a subscription. Manage your current plan in the dashboard before starting another.", manageUrl: "/dashboard#billing" }, { status: 409 });
    if (!(await sharedRateLimit(`checkout:${user.id}`, 10, 60_000))) return NextResponse.json({ error: "Please wait a minute before trying checkout again." }, { status: 429 });

    const client = await getDodoClient();
    const base = process.env.NEXTAUTH_URL ?? "https://wazap.lt";
    const sessionResponse = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email, name: user.name || undefined },
      return_url: `${base}/dashboard?upgraded=1&provider=dodo&plan=${encodeURIComponent(plan)}`,
      metadata: { user_id: user.id, plan, email },
    });
    const checkout = sessionResponse as { checkout_url?: string; payment_link?: string; session_id?: string; id?: string };
    const url = checkout.checkout_url || checkout.payment_link;
    if (!url) {
      await recordFunnelEvent("payment_failed", {
        userId: user.id,
        source: "dodo_create",
        metadata: { plan, reason: "missing_checkout_url" },
      });
      return NextResponse.json({ error: "Could not start Dodo checkout." }, { status: 502 });
    }

    await prisma.payment.create({
      data: {
        userId: user.id,
        email: user.email,
        plan,
        amount: PLAN_PRICES[plan],
        method: "dodo",
        txId: checkout.session_id || checkout.id || null,
        status: "pending",
      },
    });
    await recordFunnelEvent("checkout_started", {
      userId: user.id,
      source: "dodo",
      metadata: { plan, amount: PLAN_PRICES[plan] },
    });

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[dodo/create]", err);
    await recordFunnelEvent("payment_failed", {
      userId: checkoutUserId,
      source: "dodo_create",
      metadata: {
        plan: checkoutPlan,
        reason: err instanceof Error ? err.message.slice(0, 180) : "unknown_error",
      },
    });
    return NextResponse.json({ error: "Could not start checkout. Please try again." }, { status: 500 });
  }
}
