import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PLAN_PRICES } from "@/lib/billing";
import { getPayPalPlanId, paypalRequest } from "@/lib/paypal";
import { notifySupportMessage } from "@/lib/support-notify";
import { normalizeLanguage } from "@/lib/localization";
import { recordFunnelEvent } from "@/lib/funnel";

import { currentSubscriptionRecord } from "@/lib/subscription-record";
import { sameSiteRequest } from "@/lib/crm";
import { sharedRateLimit } from "@/lib/shared-rate-limit";

export const runtime = "nodejs";

type PayPalSubscriptionResponse = {
  id?: string;
  links?: Array<{ href: string; rel: string; method?: string }>;
};

const PAYPAL_LOCALE_BY_LANGUAGE: Record<string, string> = {
  ar: "ar-AE",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  pt: "pt-BR",
  ru: "ru-RU",
  tr: "tr-TR",
  zh: "zh-CN",
  lv: "en-US",
  ms: "en-MY",
  nl: "nl-NL",
  ja: "ja-JP",
  pl: "pl-PL",
  ko: "ko-KR",
  th: "th-TH",
  fil: "en-PH",
  en: "en-US",
};

export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  let checkoutUserId: string | null = null;
  let checkoutPlan: string | null = null;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Create or sign in to your Wazap account before payment." }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    const email = (session.user.email ?? "").toLowerCase();
    if (!userId || !email) {
      return NextResponse.json({ error: "Please sign in again before payment." }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { plan?: string; locale?: string; country?: string };
    const plan = (body.plan ?? "").toLowerCase();
    checkoutUserId = userId;
    checkoutPlan = plan;
    const language = normalizeLanguage(body.locale);
    const paypalLocale = PAYPAL_LOCALE_BY_LANGUAGE[language] || "en-US";
    const planId = getPayPalPlanId(plan);
    if (!(plan in PLAN_PRICES)) {
      return NextResponse.json({ error: "Unknown Wazap plan." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.email !== email) {
      return NextResponse.json({ error: "Account not found. Please sign in again." }, { status: 401 });
    }

    const existingSubscription = await currentSubscriptionRecord(user.id);
    if (existingSubscription) return NextResponse.json({ error: "You already have a subscription. Manage your current plan in the dashboard before starting another.", manageUrl: "/dashboard#billing" }, { status: 409 });
    if (!(await sharedRateLimit(`checkout:${user.id}`, 10, 60_000))) return NextResponse.json({ error: "Please wait a minute before trying checkout again." }, { status: 429 });

    if (!planId || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      const amount = PLAN_PRICES[plan];
      const txId = `paypal_invoice_${Date.now()}`;
      await prisma.payment.create({
        data: {
          userId: user.id,
          email: user.email,
          plan,
          amount,
          method: "paypal_invoice",
          txId,
          status: "invoice_requested",
        },
      });
      await prisma.contactMessage.create({
        data: {
          name: user.name || "Wazap customer",
          email: user.email,
          subject: `PayPal invoice request: ${plan} plan`,
          message: `Customer requested a PayPal invoice for Wazap ${plan} at USD ${amount}/month. Payment record: ${txId}. Send the PayPal invoice and activate the plan after payment confirmation.`,
        },
      });
      await notifySupportMessage({
        name: user.name || "Wazap customer",
        email: user.email,
        subject: `PayPal invoice request: ${plan} plan`,
        message: `Send PayPal invoice for Wazap ${plan} at USD ${amount}/month. Payment record: ${txId}.`,
      });
      await recordFunnelEvent("checkout_started", {
        userId: user.id,
        source: "paypal_invoice",
        metadata: { plan, amount },
      });
      return NextResponse.json({
        manual: true,
        message: "PayPal invoice request received. We will send your PayPal invoice and activate your plan after payment confirmation.",
      });
    }

    const base = process.env.NEXTAUTH_URL ?? "https://wazap.lt";
    const subscription = await paypalRequest<PayPalSubscriptionResponse>("/v1/billing/subscriptions", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        plan_id: planId,
        custom_id: user.id,
        quantity: "1",
        subscriber: {
          email_address: email,
          name: user.name ? { given_name: user.name.slice(0, 140) } : undefined,
        },
        application_context: {
          brand_name: "Wazap",
          locale: paypalLocale,
          shipping_preference: "NO_SHIPPING",
          user_action: "SUBSCRIBE_NOW",
          return_url: `${base}/dashboard?upgraded=1&provider=paypal&plan=${encodeURIComponent(plan)}`,
          cancel_url: `${base}/pricing?cancelled=1`,
        },
      }),
    });

    const approvalUrl = subscription.links?.find((link) => link.rel === "approve")?.href;
    if (!approvalUrl) {
      await recordFunnelEvent("payment_failed", {
        userId: user.id,
        source: "paypal_create",
        metadata: { plan, reason: "missing_approval_url" },
      });
      return NextResponse.json({ error: "Could not start PayPal checkout." }, { status: 502 });
    }

    await prisma.payment.create({
      data: {
        userId: user.id,
        email: user.email,
        plan,
        amount: PLAN_PRICES[plan],
        method: "paypal",
        txId: subscription.id ?? null,
        status: "pending",
      },
    });

    await recordFunnelEvent("checkout_started", {
      userId: user.id,
      source: "paypal",
      metadata: { plan, amount: PLAN_PRICES[plan] },
    });

    return NextResponse.json({ url: approvalUrl });
  } catch (err) {
    console.error("[paypal/create]", err);
    await recordFunnelEvent("payment_failed", {
      userId: checkoutUserId,
      source: "paypal_create",
      metadata: {
        plan: checkoutPlan,
        reason: err instanceof Error ? err.message.slice(0, 180) : "unknown_error",
      },
    });
    return NextResponse.json({ error: "Could not start PayPal checkout. Please try again." }, { status: 500 });
  }
}
