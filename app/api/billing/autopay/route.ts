import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sameSiteRequest } from "@/lib/crm";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { currentSubscriptionRecord } from "@/lib/subscription-record";
import { auditBilling, cancelProviderSubscription } from "@/lib/billing-actions";
import { setDodoAutoRenew } from "@/lib/dodo";
import { performAutoRenewOn } from "@/lib/billing-plan-change";
import { normalizeLanguage } from "@/lib/localization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYPAL_LOCALE_BY_LANGUAGE: Record<string, string> = {
  ar: "ar-AE", de: "de-DE", es: "es-ES", fr: "fr-FR", it: "it-IT", pt: "pt-BR", ru: "ru-RU",
  tr: "tr-TR", zh: "zh-CN", lv: "en-US", ms: "en-MY", nl: "nl-NL", ja: "ja-JP", pl: "pl-PL",
  ko: "ko-KR", th: "th-TH", fil: "en-PH", en: "en-US",
};

const CANCELLATION_REASONS = new Set([
  "too_expensive", "missing_features", "switched_service", "unused", "customer_service", "too_complex", "other",
]);

export async function POST(req: Request) {
  if (process.env.BILLING_PLAN_CHANGES_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await sharedRateLimit(`billing-autopay:${userId}`, 10, 60_000))) {
    return NextResponse.json({ error: "Please wait a minute before trying again." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { on?: boolean; reason?: string; locale?: string };
  if (typeof body.on !== "boolean") return NextResponse.json({ error: "Missing on/off value." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Account not found. Please sign in again." }, { status: 401 });

  const pointer = await prisma.securityUserBilling.findUnique({ where: { userId: user.id } });
  const record = await currentSubscriptionRecord(user.id);
  // Turning PayPal auto-pay off cancels the subscription, so its record is no
  // longer active; turning it back on only needs the pointer.
  const canTurnBackOn = body.on && pointer && !pointer.autoRenew;
  if (!pointer || (!canTurnBackOn && (!record || record.method !== pointer.provider))) {
    return NextResponse.json({ error: "No active subscription found." }, { status: 409 });
  }
  const provider = pointer.provider as "paypal" | "dodo";
  const S0 = pointer.subscriptionId;

  if (body.on) {
    const now = new Date();
    const language = normalizeLanguage(body.locale);
    const paypalLocale = PAYPAL_LOCALE_BY_LANGUAGE[language] || "en-US";
    const base = process.env.NEXTAUTH_URL ?? "https://wazap.lt";
    const result = await performAutoRenewOn({ user, provider, oldSubscriptionId: S0, now, paypalLocale, base });
    return NextResponse.json(result.body, { status: result.status });
  }

  // Turning auto-pay off.
  const reason = String(body.reason || "");
  if (!CANCELLATION_REASONS.has(reason)) {
    return NextResponse.json({ error: "Choose a reason." }, { status: 400 });
  }

  // A pending plan change has (or will have) its own subscription that would
  // bill at the period end: cancel that too, or "off" would not mean off.
  const pending = await prisma.billingPlanChange.findFirst({ where: { userId: user.id, status: "pending" } });
  if (pending) {
    if (pending.newSubscriptionId && pending.newSubscriptionId !== S0) {
      const result = await cancelProviderSubscription(pending.provider as "paypal" | "dodo", pending.newSubscriptionId, `Wazap customer cancellation: ${reason}`.slice(0, 128));
      if (!result.ok) return NextResponse.json({ error: "Could not cancel your scheduled plan change. No account access was changed." }, { status: 502 });
      await prisma.payment.updateMany({
        where: { userId: user.id, method: pending.provider, txId: pending.newSubscriptionId, status: { in: ["pending", "active", "subscription_active"] } },
        data: { status: "subscription_inactive" },
      });
    }
    await prisma.billingPlanChange.updateMany({ where: { id: pending.id, status: "pending" }, data: { status: "cancelled", updatedAt: new Date() } });
    await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "plan_change_cancelled_by_autopay_off", detail: { planChangeId: pending.id, kind: pending.kind, newSubscriptionId: pending.newSubscriptionId } });
  }

  if (provider === "paypal") {
    const result = await cancelProviderSubscription("paypal", S0, `Wazap customer cancellation: ${reason}`.slice(0, 128));
    if (!result.ok) return NextResponse.json({ error: "PayPal could not confirm cancellation. No account access was changed." }, { status: 502 });
    await prisma.payment.updateMany({
      where: { userId: user.id, method: "paypal", txId: S0, status: { in: ["active", "subscription_active"] } },
      data: { status: "subscription_inactive" },
    });
  } else {
    try {
      await setDodoAutoRenew(S0, false);
    } catch {
      return NextResponse.json({ error: "Dodo could not confirm the auto-pay change. No changes were made." }, { status: 502 });
    }
  }

  await prisma.securityUserBilling.update({ where: { userId: user.id }, data: { autoRenew: false } });
  await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "autopay_off", detail: { provider, subscriptionId: S0, reason } });

  return NextResponse.json({ ok: true, accessUntil: user.planExpiresAt });
}
