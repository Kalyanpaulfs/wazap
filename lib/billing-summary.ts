// Shared "what can this user do with their billing right now" snapshot.
// Same shape GET /api/billing returns to the signed-in user; also used by
// server components (pricing page, dashboard) that need this before the
// client ever calls the API, so the two never drift apart.
import { prisma } from "./prisma";
import { isPlanExpired } from "./billing";
import { currentSubscriptionRecord } from "./subscription-record";

export type PendingPlanChangeSummary = {
  kind: string;
  toPlan: string;
  effectiveAt: Date | null;
} | null;

export type BillingSummary = {
  plan: string;
  accessActive: boolean;
  renewsOrExpiresAt: Date | null;
  method: string | null;
  provider: string | null;
  autoRenew: boolean;
  canUpdateCard: boolean;
  canCancel: boolean;
  hasSubscription: boolean;
  pendingChange: PendingPlanChangeSummary;
};

export async function getBillingSummary(userId: string): Promise<BillingSummary | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true },
  });
  if (!user) return null;

  const payment = await currentSubscriptionRecord(userId);
  const pointer = await prisma.securityUserBilling.findUnique({ where: { userId } });
  const pendingChange = await prisma.billingPlanChange.findFirst({
    where: { userId, status: "pending" },
    orderBy: { createdAt: "desc" },
    select: { kind: true, toPlan: true, effectiveAt: true },
  });

  return {
    plan: user.plan,
    accessActive: user.plan !== "free" && !isPlanExpired(user.plan, user.planExpiresAt),
    renewsOrExpiresAt: user.planExpiresAt,
    method: payment?.method || null,
    provider: pointer?.provider || payment?.method || null,
    autoRenew: pointer?.autoRenew ?? true,
    canUpdateCard: payment?.method === "dodo",
    canCancel: payment?.method === "paypal",
    hasSubscription: Boolean(payment),
    pendingChange: pendingChange
      ? { kind: pendingChange.kind, toPlan: pendingChange.toPlan, effectiveAt: pendingChange.effectiveAt }
      : null,
  };
}
