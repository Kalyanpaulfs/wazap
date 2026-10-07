import { prisma } from "@/lib/prisma";

export const PARTNER_METRIC_DEFINITION = {
  value: "Verified active provider payments attributed to introduced workspace owners.",
  currency: "USD",
  period: "lifetime",
  includedMethods: ["paypal", "dodo"],
  excluded: ["pending", "inactive", "refunded", "disputed", "manual", "invoice-requested", "test"],
};

export async function partnerSummary(workspaceId: string) {
  const partner = await prisma.partnerAccount.findUnique({
    where: { workspaceId },
    include: {
      referralTouches: { orderBy: { createdAt: "desc" }, take: 100, select: { id: true, source: true, landingPage: true, expiresAt: true, claimedAt: true, createdAt: true } },
      attributions: {
        orderBy: { createdAt: "desc" },
        take: 100,
        include: {
          attributedWorkspace: {
            select: {
              owner: {
                select: {
                  payments: {
                    where: { status: "active", method: { in: ["paypal", "dodo"] }, txId: { not: null }, activatedAt: { not: null } },
                    select: { amount: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!partner) return {
    partner: null,
    payoutsEnabled: false,
    metrics: { touches: 0, activeUnclaimedTouches: 0, signups: 0, customers: 0, conversionRate: 0, influencedRevenue: 0 },
    metricDefinition: PARTNER_METRIC_DEFINITION,
  };
  const attributions = partner.attributions.map((item) => ({
    id: item.id, source: item.source, landingPage: item.landingPage,
    status: item.status, createdAt: item.createdAt,
  }));
  const customers = partner.attributions.filter((item) => item.status === "customer").length;
  const activeUnclaimedTouches = partner.referralTouches.filter((item) => !item.claimedAt && item.expiresAt > new Date()).length;
  const influencedRevenue = partner.attributions.reduce((sum, item) => sum + item.attributedWorkspace.owner.payments.reduce((paymentSum, payment) => paymentSum + payment.amount, 0), 0);
  return {
    partner: {
      id: partner.id,
      referralCode: partner.referralCode,
      status: partner.status,
      channel: partner.channel,
      website: partner.website,
      termsVersion: partner.termsVersion,
      termsAcceptedAt: partner.termsAcceptedAt,
      attributionWindowDays: partner.attributionWindowDays,
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
      attributions,
    },
    payoutsEnabled: false,
    metrics: {
      touches: partner.referralTouches.length,
      activeUnclaimedTouches,
      signups: attributions.length,
      customers,
      conversionRate: attributions.length ? Math.round(customers / attributions.length * 1000) / 10 : 0,
      influencedRevenue: Math.round(influencedRevenue * 100) / 100,
    },
    metricDefinition: PARTNER_METRIC_DEFINITION,
  };
}
