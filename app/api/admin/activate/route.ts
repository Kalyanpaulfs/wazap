import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planExpiry, PURCHASABLE_PLANS } from "@/lib/billing";
import { auditBilling } from "@/lib/billing-actions";
import { syncPlanLimits } from "@/lib/plan-limit-sync";
import { sameSiteRequest } from "@/lib/crm";

async function syncPlanLimitsSafely(userId: string, previousPlan?: string | null) {
  try {
    await syncPlanLimits(userId, previousPlan);
  } catch (err) {
    console.error("[plan-limit-sync] failed after admin activate", userId, err instanceof Error ? err.message : String(err));
  }
}

const ACTIVATABLE_PLANS = new Set<string>(PURCHASABLE_PLANS);

// BUG-8: an admin "change plan" used to be silently undone by the next
// provider renewal (the subscription was never told about it). We cannot fix
// that without touching the provider subscription itself here, but every
// such grant/revoke must now be audited, and the admin must be warned up
// front when a live subscription will indeed overwrite it at renewal.
async function livePlanWarning(userId: string): Promise<string | null> {
  const pointer = await prisma.securityUserBilling.findUnique({ where: { userId } });
  if (!pointer) return null;
  const live = await prisma.payment.findFirst({ where: { userId, method: pointer.provider, txId: pointer.subscriptionId, status: "subscription_active" } });
  if (!live) return null;
  const providerLabel = pointer.provider === "dodo" ? "Dodo" : "PayPal";
  return `A live ${providerLabel} subscription will overwrite this at renewal.`;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const admin = session?.user as { id?: string; isAdmin?: boolean } | undefined;
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const { userId, plan, reason } = await req.json();
  if (!userId || !ACTIVATABLE_PLANS.has(plan)) return NextResponse.json({ error: "Invalid activation request" }, { status: 400 });

  const before = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true } });
  if (!before) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const expiry = planExpiry(plan);
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { plan, planExpiresAt: expiry } });
    await auditBilling(tx, {
      actorUserId: admin.id ?? null,
      userId,
      action: "admin_activate",
      detail: {
        before: { plan: before.plan, planExpiresAt: before.planExpiresAt },
        after: { plan, planExpiresAt: expiry },
        reason: typeof reason === "string" && reason ? reason.slice(0, 300) : null,
      },
    });
  });
  // before.plan is read before this update: a same-plan re-activation (or an
  // upgrade) never pauses rotators/short links/ad links; only a genuine
  // downgrade to a lower-ranked plan does.
  await syncPlanLimitsSafely(userId, before.plan);
  const warning = await livePlanWarning(userId);
  return NextResponse.json({ success: true, planExpiresAt: expiry?.toISOString() ?? null, ...(warning ? { warning } : {}) });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  const admin = session?.user as { id?: string; isAdmin?: boolean } | undefined;
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const { userId, reason } = await req.json();
  if (!userId) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true } });
  if (!before) return NextResponse.json({ error: "User not found" }, { status: 404 });

  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: userId }, data: { plan: "free", planExpiresAt: null } });
    await auditBilling(tx, {
      actorUserId: admin.id ?? null,
      userId,
      action: "admin_deactivate",
      detail: {
        before: { plan: before.plan, planExpiresAt: before.planExpiresAt },
        after: { plan: "free", planExpiresAt: null },
        reason: typeof reason === "string" && reason ? reason.slice(0, 300) : null,
      },
    });
  });
  // before.plan is read before this update: admin deactivate always moves
  // the user down to free, a genuine downgrade whenever they weren't
  // already on free.
  await syncPlanLimitsSafely(userId, before.plan);
  const warning = await livePlanWarning(userId);
  return NextResponse.json({ success: true, ...(warning ? { warning } : {}) });
}
