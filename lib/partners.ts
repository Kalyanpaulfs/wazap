import { prisma } from "@/lib/prisma";
import { enqueueWebhookEvent } from "@/lib/developer-platform";

export async function markPartnerCustomer(userId: string) {
  const attributions = await prisma.partnerAttribution.findMany({
    where: { attributedWorkspace: { ownerId: userId }, status: { not: "customer" } },
    select: { id: true, partnerId: true, partner: { select: { workspaceId: true } }, attributedWorkspaceId: true },
  });
  if (!attributions.length) return false;
  await prisma.partnerAttribution.updateMany({
    where: { id: { in: attributions.map((item) => item.id) }, status: { not: "customer" } },
    data: { status: "customer" },
  });
  await Promise.all(attributions.map((item) => enqueueWebhookEvent(item.partner.workspaceId, "partner.customer_converted", {
    attributionId: item.id,
    attributedWorkspaceId: item.attributedWorkspaceId,
    source: "verified_payment",
  })));
  return true;
}
