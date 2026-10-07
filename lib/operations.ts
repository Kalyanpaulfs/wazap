import { prisma } from "@/lib/prisma";

export async function workspaceOperationalHealth(workspaceId: string) {
  const since24h = new Date(Date.now() - 86_400_000); const now = new Date();
  // Avoid consuming the full Prisma pool while user-facing requests are active.
  const [automationFailures, apiErrors, webhookFailures] = await Promise.all([
    prisma.automationRun.count({ where: { workspaceId, status: "failed", startedAt: { gte: since24h } } }),
    prisma.apiRequestLog.count({ where: { workspaceId, statusCode: { gte: 500 }, createdAt: { gte: since24h } } }),
    prisma.webhookDelivery.count({ where: { endpoint: { workspaceId }, status: "failed", createdAt: { gte: since24h } } }),
  ]);
  const [channelFailures, aiFailures, overdueTasks] = await Promise.all([
    prisma.channelEvent.count({ where: { workspaceId, status: "failed", receivedAt: { gte: since24h } } }),
    prisma.aiRun.count({ where: { workspaceId, status: "failed", createdAt: { gte: since24h } } }),
    prisma.inboxTask.count({ where: { workspaceId, status: "open", dueAt: { lte: now } } }),
  ]);
  const [openHandoffs, queuedWebhooks, activeConnections] = await Promise.all([
    prisma.aiHandoff.count({ where: { workspaceId, status: "open" } }),
    prisma.webhookDelivery.count({ where: { endpoint: { workspaceId }, status: "queued", nextAttemptAt: { lte: now } } }),
    prisma.channelConnection.count({ where: { workspaceId, status: "active" } }),
  ]);
  const stuckScheduledBefore = new Date(now.getTime() - 10 * 60_000);
  const stuckSendingBefore = new Date(now.getTime() - 15 * 60_000);
  const [campaignFailures, campaignExclusions, activeCampaigns, stuckCampaigns, uncertainCampaignRecipients, suspendedMarketplaceInstalls, openMarketplaceReports] = await Promise.all([
    prisma.whatsAppCampaignRecipient.count({ where: { workspaceId, status: "failed", updatedAt: { gte: since24h } } }),
    prisma.whatsAppCampaignRecipient.count({ where: { workspaceId, status: "excluded", updatedAt: { gte: since24h } } }),
    prisma.whatsAppCampaign.count({ where: { workspaceId, status: { in: ["scheduled", "sending"] } } }),
    prisma.whatsAppCampaign.count({ where: { workspaceId, OR: [{ status: "scheduled", scheduledFor: { lte: stuckScheduledBefore } }, { status: "sending", updatedAt: { lte: stuckSendingBefore } }] } }),
    prisma.whatsAppCampaignRecipient.count({ where: { workspaceId, status: "processing", updatedAt: { lte: stuckSendingBefore } } }),
    prisma.marketplaceInstall.count({ where: { workspaceId, status: { in: ["suspended", "revoked"] } } }),
    prisma.marketplaceAbuseReport.count({ where: { workspaceId, status: "open" } }),
  ]);
  const metrics = { automationFailures, apiErrors, webhookFailures, channelFailures, aiFailures, overdueTasks, openHandoffs, queuedWebhooks, activeConnections, campaignFailures, campaignExclusions, activeCampaigns, stuckCampaigns, uncertainCampaignRecipients, suspendedMarketplaceInstalls, openMarketplaceReports };
  const issues = [automationFailures ? { code: "AUTOMATION_FAILURES", severity: automationFailures > 5 ? "critical" : "warning", count: automationFailures } : null, apiErrors ? { code: "API_5XX", severity: apiErrors > 10 ? "critical" : "warning", count: apiErrors } : null, webhookFailures ? { code: "WEBHOOK_FAILURES", severity: "critical", count: webhookFailures } : null, channelFailures ? { code: "CHANNEL_EVENT_FAILURES", severity: "warning", count: channelFailures } : null, aiFailures ? { code: "AI_RUN_FAILURES", severity: "warning", count: aiFailures } : null, overdueTasks ? { code: "OVERDUE_TASKS", severity: "warning", count: overdueTasks } : null, openHandoffs ? { code: "OPEN_HANDOFFS", severity: "warning", count: openHandoffs } : null, queuedWebhooks ? { code: "WEBHOOK_BACKLOG", severity: "warning", count: queuedWebhooks } : null, campaignFailures ? { code: "CAMPAIGN_FAILURES", severity: campaignFailures > 10 ? "critical" : "warning", count: campaignFailures } : null, stuckCampaigns ? { code: "STUCK_CAMPAIGNS", severity: "critical", count: stuckCampaigns } : null, uncertainCampaignRecipients ? { code: "UNCERTAIN_CAMPAIGN_DELIVERIES", severity: "critical", count: uncertainCampaignRecipients } : null, suspendedMarketplaceInstalls ? { code: "MARKETPLACE_INSTALLS_SUSPENDED", severity: "warning", count: suspendedMarketplaceInstalls } : null, openMarketplaceReports ? { code: "MARKETPLACE_ABUSE_REPORTS_OPEN", severity: "warning", count: openMarketplaceReports } : null].filter(Boolean) as Array<{ code: string; severity: string; count: number }>;
  const status = issues.some(issue => issue.severity === "critical") ? "critical" : issues.length ? "degraded" : "healthy";
  return { status, metrics, issues, measuredAt: now };
}
