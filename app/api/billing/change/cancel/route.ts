import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sameSiteRequest } from "@/lib/crm";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { auditBilling, cancelProviderSubscription } from "@/lib/billing-actions";
import { cancelDodoScheduledChange } from "@/lib/dodo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Customer cancels their own scheduled downgrade. The current plan stays
// until the period end either way.
// - Dodo: the change is dropped at Dodo; the subscription carries on as is.
// - PayPal, new subscription not approved yet: cancel it; the old one carries on.
// - PayPal, already approved: the old subscription was cancelled at approval,
//   so cancelling the new one leaves no renewal. Auto-pay is then Off and the
//   customer can turn it back on (Renew) to keep the current plan.
export async function POST(req: Request) {
  if (process.env.BILLING_PLAN_CHANGES_ENABLED !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await sharedRateLimit(`billing-change-cancel:${userId}`, 10, 60_000))) {
    return NextResponse.json({ error: "Please wait a minute before trying again." }, { status: 429 });
  }

  const pending = await prisma.billingPlanChange.findFirst({ where: { userId, status: "pending", kind: "downgrade" } });
  if (!pending) return NextResponse.json({ error: "No scheduled plan change to cancel." }, { status: 409 });

  let autoRenewOff = false;
  if (pending.provider === "dodo") {
    try {
      await cancelDodoScheduledChange(pending.oldSubscriptionId || "");
    } catch {
      return NextResponse.json({ error: "Dodo could not cancel the scheduled change. No changes were made." }, { status: 502 });
    }
  } else if (pending.newSubscriptionId) {
    const approved = Boolean(await prisma.payment.findFirst({ where: { userId, method: "paypal", txId: pending.newSubscriptionId, status: "subscription_active" } }));
    const result = await cancelProviderSubscription("paypal", pending.newSubscriptionId, "scheduled_downgrade_cancelled");
    if (!result.ok) return NextResponse.json({ error: "PayPal could not cancel the scheduled change. No changes were made." }, { status: 502 });
    await prisma.payment.updateMany({
      where: { userId, method: "paypal", txId: pending.newSubscriptionId, status: { in: ["pending", "subscription_active"] } },
      data: { status: "subscription_inactive" },
    });
    if (approved) {
      await prisma.securityUserBilling.updateMany({ where: { userId }, data: { autoRenew: false } });
      autoRenewOff = true;
    }
  }

  await prisma.billingPlanChange.updateMany({ where: { id: pending.id, status: "pending" }, data: { status: "cancelled", updatedAt: new Date() } });
  await auditBilling(prisma, { actorUserId: userId, userId, action: "plan_change_downgrade_cancelled", detail: { planChangeId: pending.id, provider: pending.provider, toPlan: pending.toPlan, autoRenewOff } });
  return NextResponse.json({ ok: true, autoRenewOff });
}
