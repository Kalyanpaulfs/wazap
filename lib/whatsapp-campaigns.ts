import { prisma } from "@/lib/prisma";
import { sendMetaTemplateMessage } from "@/lib/meta-cloud";

const TERMINAL_RECIPIENT_STATES = ["excluded", "accepted", "sent", "delivered", "read", "failed", "cancelled"];

function connectionConfig(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

export async function refreshWhatsAppCampaign(campaignId: string) {
  const groups = await prisma.whatsAppCampaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(groups.map((group) => [group.status, group._count._all]));
  const queued = (counts.queued || 0) + (counts.processing || 0);
  const accepted = (counts.accepted || 0) + (counts.sent || 0) + (counts.delivered || 0) + (counts.read || 0);
  const total = groups.reduce((sum, group) => sum + group._count._all, 0);
  const terminal = groups.filter((group) => TERMINAL_RECIPIENT_STATES.includes(group.status)).reduce((sum, group) => sum + group._count._all, 0);
  const campaign = await prisma.whatsAppCampaign.findUnique({ where: { id: campaignId }, select: { status: true } });
  const completed = campaign?.status === "sending" && total > 0 && terminal === total && queued === 0;
  return prisma.whatsAppCampaign.update({
    where: { id: campaignId },
    data: {
      sentCount: accepted,
      deliveredCount: (counts.delivered || 0) + (counts.read || 0),
      readCount: counts.read || 0,
      failedCount: counts.failed || 0,
      optOutCount: counts.excluded || 0,
      ...(completed ? { status: "completed", completedAt: new Date() } : {}),
    },
  });
}

export async function processWhatsAppCampaignBatch(batchSize = 50) {
  const now = new Date();
  const campaigns = await prisma.whatsAppCampaign.findMany({
    where: {
      status: { in: ["scheduled", "sending"] },
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    },
    include: { connection: true, template: true },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
    take: 10,
  });
  let attempted = 0, accepted = 0, failed = 0, excluded = 0;
  for (const campaign of campaigns) {
    if (attempted >= batchSize) break;
    if (campaign.connection.status !== "active" || campaign.connection.provider !== "meta_cloud" || !campaign.connection.accessTokenEncrypted || campaign.template.status !== "approved") {
      await prisma.whatsAppCampaign.update({ where: { id: campaign.id }, data: { status: "paused", lastError: "Active Meta connection and approved template are required." } });
      continue;
    }
    if (campaign.status === "scheduled") {
      await prisma.whatsAppCampaign.update({ where: { id: campaign.id }, data: { status: "sending", startedAt: campaign.startedAt || now, lastError: null } });
    }
    const cfg = connectionConfig(campaign.connection.config);
    const phoneNumberId = String(cfg.phoneNumberId || campaign.connection.externalAccountId || "");
    if (!phoneNumberId) {
      await prisma.whatsAppCampaign.update({ where: { id: campaign.id }, data: { status: "paused", lastError: "Verified Meta phone number ID is unavailable." } });
      continue;
    }
    const recipients = await prisma.whatsAppCampaignRecipient.findMany({
      where: { campaignId: campaign.id, status: "queued" },
      orderBy: { createdAt: "asc" },
      take: Math.max(0, batchSize - attempted),
    });
    for (const recipient of recipients) {
      const claimed = await prisma.whatsAppCampaignRecipient.updateMany({
        where: { id: recipient.id, status: "queued" },
        data: { status: "processing", attemptedAt: new Date(), lastError: null },
      });
      if (!claimed.count) continue;
      attempted++;
      const consent = await prisma.whatsAppConsent.findUnique({
        where: { workspaceId_contactAddress: { workspaceId: campaign.workspaceId, contactAddress: recipient.contactAddress } },
      });
      if (!consent || consent.status !== "opted_in" || consent.expiresAt && consent.expiresAt <= new Date()) {
        await prisma.whatsAppCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "excluded", exclusionReason: "Consent missing, expired, or withdrawn before send." } });
        excluded++;
        continue;
      }
      try {
        const result = await sendMetaTemplateMessage(campaign.connection.accessTokenEncrypted, phoneNumberId, recipient.contactAddress, campaign.template.name, campaign.template.language);
        const providerMessageId = String(result?.messages?.[0]?.id || "").slice(0, 200);
        if (!providerMessageId) throw new Error("Meta accepted the request without returning a message ID.");
        await prisma.whatsAppCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "accepted", providerMessageId, acceptedAt: new Date() } });
        accepted++;
      } catch (error) {
        const detail = error instanceof Error ? error.message.slice(0, 500) : "Meta campaign delivery failed.";
        await prisma.whatsAppCampaignRecipient.update({ where: { id: recipient.id }, data: { status: "failed", lastError: detail } });
        await prisma.whatsAppCampaign.update({ where: { id: campaign.id }, data: { lastError: detail } });
        failed++;
      }
    }
    await refreshWhatsAppCampaign(campaign.id);
  }
  return { campaigns: campaigns.length, attempted, accepted, failed, excluded };
}
