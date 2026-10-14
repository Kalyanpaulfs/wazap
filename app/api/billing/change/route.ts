import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sameSiteRequest } from "@/lib/crm";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { PLAN_PRICES, BILLING_GRACE_DAYS, isPlanExpired } from "@/lib/billing";
import { decidePlanChange, computeScheduledEffectiveAt } from "@/lib/billing-rules";
import { currentSubscriptionRecord } from "@/lib/subscription-record";
import { auditBilling, reconcilePendingPlanChange, createPendingPlanChange } from "@/lib/billing-actions";
import { createPayPalSubscription, getPayPalPlanId, getPayPalSubscription, cancelPayPalSubscription } from "@/lib/paypal";
import { changeDodoPlan, getDodoSubscription } from "@/lib/dodo";
import { normalizeLanguage } from "@/lib/localization";
import { performAutoRenewOn } from "@/lib/billing-plan-change";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAYPAL_LOCALE_BY_LANGUAGE: Record<string, string> = {
  ar: "ar-AE", de: "de-DE", es: "es-ES", fr: "fr-FR", it: "it-IT", pt: "pt-BR", ru: "ru-RU",
  tr: "tr-TR", zh: "zh-CN", lv: "en-US", ms: "en-MY", nl: "nl-NL", ja: "ja-JP", pl: "pl-PL",
  ko: "ko-KR", th: "th-TH", fil: "en-PH", en: "en-US",
};

function formatDate(date: Date | null | undefined) {
  if (!date) return "your renewal date";
  return date.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  if (process.env.BILLING_PLAN_CHANGES_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await sharedRateLimit(`billing-change:${userId}`, 10, 60_000))) {
    return NextResponse.json({ error: "Please wait a minute before changing your plan again." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { plan?: string; locale?: string };
  const plan = String(body.plan || "").toLowerCase();

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Account not found. Please sign in again." }, { status: 401 });

  const pointer = await prisma.securityUserBilling.findUnique({ where: { userId: user.id } });
  const record = await currentSubscriptionRecord(user.id);
  const accessActive = user.plan !== "free" && !isPlanExpired(user.plan, user.planExpiresAt);
  // Same plan with auto-pay off: PayPal's cancelled subscription has no live
  // record any more, but it can still be renewed from the pointer.
  const renewable = Boolean(pointer && !pointer.autoRenew && plan === user.plan);
  const decision = decidePlanChange({
    currentPlan: user.plan,
    accessActive,
    hasLiveSubscription: Boolean(record) || renewable,
    autoRenew: pointer?.autoRenew ?? true,
    targetPlan: plan,
  });

  if (decision === "invalid") return NextResponse.json({ error: "Unknown Wazap plan." }, { status: 400 });
  if (decision === "checkout") return NextResponse.json({ checkout: true });
  if (decision === "blocked_autorenew") {
    return NextResponse.json({ error: `Your plan renews automatically on ${formatDate(user.planExpiresAt)}` }, { status: 409 });
  }

  // upgrade / downgrade need a live subscription to act on; renew needs the pointer.
  if (!pointer || (decision !== "renew" && !record)) {
    return NextResponse.json({ error: "No active subscription found to change. Please contact support." }, { status: 409 });
  }
  const provider = pointer.provider as "paypal" | "dodo";
  const S0 = pointer.subscriptionId;
  const now = new Date();
  const base = process.env.NEXTAUTH_URL ?? "https://wazap.lt";
  const language = normalizeLanguage(body.locale);
  const paypalLocale = PAYPAL_LOCALE_BY_LANGUAGE[language] || "en-US";

  if (decision === "renew") {
    const result = await performAutoRenewOn({ user, provider, oldSubscriptionId: S0, now, paypalLocale, base });
    return NextResponse.json(result.body, { status: result.status });
  }

  const pendingCheck = await reconcilePendingPlanChange(user.id, now);
  if (!pendingCheck.ok) return NextResponse.json({ error: pendingCheck.error }, { status: pendingCheck.status });

  if (decision === "upgrade") {
    if (provider === "paypal") {
      const planId = getPayPalPlanId(plan);
      if (!planId) return NextResponse.json({ error: "This Wazap plan is not available for PayPal upgrades yet." }, { status: 501 });
      const { id: S1, approvalUrl } = await createPayPalSubscription({
        planId, userId: user.id, email: user.email, name: user.name, locale: paypalLocale,
        returnUrl: `${base}/dashboard?upgraded=1&provider=paypal&plan=${encodeURIComponent(plan)}&change=upgrade`,
        cancelUrl: `${base}/pricing?cancelled=1`,
      });
      if (!approvalUrl || !S1) return NextResponse.json({ error: "Could not start the upgrade checkout." }, { status: 502 });
      const inserted = await createPendingPlanChange({ userId: user.id, kind: "upgrade", fromPlan: user.plan, toPlan: plan, provider, oldSubscriptionId: S0, newSubscriptionId: S1, effectiveAt: null, status: "pending" });
      if (!inserted.ok) {
        // Lost the race to another request: never leave an unapproved PayPal
        // subscription the buyer can't see behind.
        await cancelPayPalSubscription(S1, "duplicate_plan_change_request").catch(() => {});
        return NextResponse.json({ error: inserted.error }, { status: inserted.status });
      }
      await prisma.payment.create({ data: { userId: user.id, email: user.email, plan, amount: PLAN_PRICES[plan], method: "paypal", txId: S1, status: "pending" } });
      await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "plan_change_upgrade_started", detail: { fromPlan: user.plan, toPlan: plan, provider, oldSubscriptionId: S0, newSubscriptionId: S1 } });
      return NextResponse.json({ url: approvalUrl });
    }

    // Dodo: insert the change row first, then ask Dodo to change the plan.
    const inserted = await createPendingPlanChange({ userId: user.id, kind: "upgrade", fromPlan: user.plan, toPlan: plan, provider, oldSubscriptionId: S0, newSubscriptionId: S0, effectiveAt: null, status: "pending" });
    if (!inserted.ok) return NextResponse.json({ error: inserted.error }, { status: inserted.status });
    const change = inserted.change;
    try {
      await changeDodoPlan(S0, plan, "upgrade");
    } catch (err) {
      await prisma.billingPlanChange.update({ where: { id: change.id }, data: { status: "failed", updatedAt: new Date() } });
      await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "plan_change_upgrade_failed", detail: { fromPlan: user.plan, toPlan: plan, provider, error: err instanceof Error ? err.message.slice(0, 200) : String(err) } });
      return NextResponse.json({ error: "Could not start the plan change with Dodo. No changes were made." }, { status: 502 });
    }
    await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "plan_change_upgrade_started", detail: { fromPlan: user.plan, toPlan: plan, provider, subscriptionId: S0 } });
    return NextResponse.json({ ok: true, applied: "pending_webhook" });
  }

  // decision === "downgrade"
  if (provider === "paypal") {
    let providerPeriodEnd: Date | null = null;
    try {
      const sub = await getPayPalSubscription(S0);
      const raw = sub.billing_info?.next_billing_time;
      if (raw) providerPeriodEnd = new Date(raw);
    } catch {
      // fall through to the local fallback below
    }
    const effectiveAt = computeScheduledEffectiveAt({ providerPeriodEnd, fallbackPlanExpiresAt: user.planExpiresAt, graceDays: BILLING_GRACE_DAYS, now });
    if (!effectiveAt) return NextResponse.json({ error: "Could not determine your current billing period end. Please contact support." }, { status: 409 });
    const planId = getPayPalPlanId(plan);
    if (!planId) return NextResponse.json({ error: "This Wazap plan is not available for PayPal downgrades yet." }, { status: 501 });
    const { id: S1, approvalUrl } = await createPayPalSubscription({
      planId, userId: user.id, email: user.email, name: user.name, locale: paypalLocale, startTime: effectiveAt,
      returnUrl: `${base}/dashboard?upgraded=1&provider=paypal&plan=${encodeURIComponent(plan)}&change=downgrade`,
      cancelUrl: `${base}/pricing?cancelled=1`,
    });
    if (!approvalUrl || !S1) return NextResponse.json({ error: "Could not start the downgrade checkout." }, { status: 502 });
    const inserted = await createPendingPlanChange({ userId: user.id, kind: "downgrade", fromPlan: user.plan, toPlan: plan, provider, oldSubscriptionId: S0, newSubscriptionId: S1, effectiveAt, status: "pending" });
    if (!inserted.ok) {
      await cancelPayPalSubscription(S1, "duplicate_plan_change_request").catch(() => {});
      return NextResponse.json({ error: inserted.error }, { status: inserted.status });
    }
    await prisma.payment.create({ data: { userId: user.id, email: user.email, plan, amount: PLAN_PRICES[plan], method: "paypal", txId: S1, status: "pending" } });
    await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "plan_change_downgrade_started", detail: { fromPlan: user.plan, toPlan: plan, provider, oldSubscriptionId: S0, newSubscriptionId: S1, effectiveAt } });
    return NextResponse.json({ url: approvalUrl });
  }

  // Dodo downgrade.
  let nextBillingDate: Date | null = null;
  try {
    const sub = await getDodoSubscription(S0);
    if (sub.next_billing_date) nextBillingDate = new Date(sub.next_billing_date);
  } catch {
    return NextResponse.json({ error: "Could not reach Dodo to schedule this downgrade. Please try again." }, { status: 502 });
  }
  const effectiveAt = computeScheduledEffectiveAt({ providerPeriodEnd: nextBillingDate, fallbackPlanExpiresAt: user.planExpiresAt, graceDays: BILLING_GRACE_DAYS, now });
  if (!effectiveAt) return NextResponse.json({ error: "Could not determine your current billing period end. Please contact support." }, { status: 409 });
  const insertedDowngrade = await createPendingPlanChange({ userId: user.id, kind: "downgrade", fromPlan: user.plan, toPlan: plan, provider, oldSubscriptionId: S0, newSubscriptionId: S0, effectiveAt, status: "pending" });
  if (!insertedDowngrade.ok) return NextResponse.json({ error: insertedDowngrade.error }, { status: insertedDowngrade.status });
  const change = insertedDowngrade.change;
  try {
    await changeDodoPlan(S0, plan, "downgrade");
  } catch (err) {
    await prisma.billingPlanChange.update({ where: { id: change.id }, data: { status: "failed", updatedAt: new Date() } });
    await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "plan_change_downgrade_failed", detail: { fromPlan: user.plan, toPlan: plan, provider, error: err instanceof Error ? err.message.slice(0, 200) : String(err) } });
    return NextResponse.json({ error: "Could not schedule the downgrade with Dodo. No changes were made." }, { status: 502 });
  }
  await auditBilling(prisma, { actorUserId: user.id, userId: user.id, action: "plan_change_downgrade_started", detail: { fromPlan: user.plan, toPlan: plan, provider, subscriptionId: S0, effectiveAt } });
  return NextResponse.json({ ok: true, effectiveAt });
}
