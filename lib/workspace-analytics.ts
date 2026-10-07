import { prisma } from "@/lib/prisma";

export const ANALYTICS_WINDOWS = [7, 30, 90] as const;

function grouped<T extends { _count: { _all: number } }>(rows: T[], key: keyof T) {
  return Object.fromEntries(rows.map((row) => [String(row[key] ?? "unknown"), row._count._all]));
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function workspaceAnalytics(workspaceId: string, requestedDays = 30) {
  const days = ANALYTICS_WINDOWS.includes(requestedDays as typeof ANALYTICS_WINDOWS[number]) ? requestedDays : 30;
  const now = new Date();
  const since = new Date(now.getTime() - days * 86_400_000);
  const [
    conversations, messageStatuses, leads, starts, automationRuns, aiRuns,
    apiRequests, webhookDeliveries, channelEvents, installs, campaignRuns,
    campaignRecipientRuns,
  ] = await Promise.all([
    prisma.inboxConversation.findMany({ where: { workspaceId, createdAt: { gte: since } }, select: { channel: true, status: true, createdAt: true, firstResponseAt: true, resolvedAt: true } }),
    prisma.inboxMessage.groupBy({ by: ["deliveryStatus"], where: { conversation: { workspaceId }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.lead.findMany({ where: { workspaceId, createdAt: { gte: since } }, select: { status: true, estimatedValue: true, source: true, createdAt: true, closedAt: true } }),
    prisma.conversationStart.findMany({ where: { workspaceId, createdAt: { gte: since } }, select: { source: true, createdAt: true } }),
    prisma.automationRun.groupBy({ by: ["status"], where: { workspaceId, startedAt: { gte: since } }, _count: { _all: true } }),
    prisma.aiRun.groupBy({ by: ["status"], where: { workspaceId, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.apiRequestLog.findMany({ where: { workspaceId, createdAt: { gte: since } }, select: { statusCode: true, latencyMs: true } }),
    prisma.webhookDelivery.groupBy({ by: ["status"], where: { endpoint: { workspaceId }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.channelEvent.groupBy({ by: ["status"], where: { workspaceId, receivedAt: { gte: since } }, _count: { _all: true } }),
    prisma.marketplaceInstall.count({ where: { workspaceId, status: "active" } }),
    prisma.whatsAppCampaign.groupBy({ by: ["status"], where: { workspaceId, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.whatsAppCampaignRecipient.groupBy({ by: ["status"], where: { workspaceId, createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const byChannel = Object.entries(conversations.reduce((acc: Record<string, number>, item) => ({ ...acc, [item.channel]: (acc[item.channel] || 0) + 1 }), {})).map(([channel, count]) => ({ channel, count }));
  const byLeadSource = Object.entries(leads.reduce((acc: Record<string, number>, item) => ({ ...acc, [item.source || "Direct"]: (acc[item.source || "Direct"] || 0) + 1 }), {})).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  const byStartSource = Object.entries(starts.reduce((acc: Record<string, number>, item) => ({ ...acc, [item.source || "Direct"]: (acc[item.source || "Direct"] || 0) + 1 }), {})).map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 10);
  const responses = conversations.filter((item) => item.firstResponseAt).map((item) => Math.max(0, item.firstResponseAt!.getTime() - item.createdAt.getTime()));
  const resolutions = conversations.filter((item) => item.resolvedAt).map((item) => Math.max(0, item.resolvedAt!.getTime() - item.createdAt.getTime()));
  const won = leads.filter((item) => item.status === "won");
  const automation = grouped(automationRuns, "status"), ai = grouped(aiRuns, "status");
  const webhooks = grouped(webhookDeliveries, "status"), channels = grouped(channelEvents, "status");
  const deliveryStatuses = grouped(messageStatuses, "deliveryStatus");
  const campaignStatuses = grouped(campaignRuns, "status");
  const campaignRecipientStatuses = grouped(campaignRecipientRuns, "status");
  const campaignAccepted = (campaignRecipientStatuses.accepted || 0) + (campaignRecipientStatuses.sent || 0) + (campaignRecipientStatuses.delivered || 0) + (campaignRecipientStatuses.read || 0);
  const campaignDelivered = (campaignRecipientStatuses.delivered || 0) + (campaignRecipientStatuses.read || 0);
  const dailyCount = <T extends { createdAt: Date }>(items: T[]) => items.reduce((counts: Record<string, number>, item) => {
    const key = dayKey(item.createdAt);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const startDays = dailyCount(starts), conversationDays = dailyCount(conversations), leadDays = dailyCount(leads);
  const wonDays = won.reduce((counts: Record<string, number>, item) => {
    if (item.closedAt) {
      const key = dayKey(item.closedAt);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, {});
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(since.getTime() + index * 86_400_000);
    const key = dayKey(date);
    return {
      date: key,
      conversationStarts: startDays[key] || 0,
      conversations: conversationDays[key] || 0,
      leads: leadDays[key] || 0,
      wonLeads: wonDays[key] || 0,
    };
  });
  return {
    window: `${days}d`,
    range: { from: since, to: now },
    metrics: {
      conversations: conversations.length,
      messages: Object.values(deliveryStatuses).reduce((sum, value) => sum + value, 0),
      openConversations: conversations.filter((item) => item.status !== "resolved").length,
      averageResponseMinutes: responses.length ? Math.round(responses.reduce((a, b) => a + b, 0) / responses.length / 60_000) : null,
      averageResolutionHours: resolutions.length ? Math.round(resolutions.reduce((a, b) => a + b, 0) / resolutions.length / 3_600_000 * 10) / 10 : null,
      conversationStarts: starts.length,
      leads: leads.length,
      wonLeads: won.length,
      leadConversionRate: leads.length ? Math.round(won.length / leads.length * 1000) / 10 : 0,
      wonValue: won.reduce((sum, item) => sum + (item.estimatedValue || 0), 0),
      automationSuccess: (automation.succeeded || 0) + (automation.dry_run || 0),
      automationFailures: automation.failed || 0,
      aiCompleted: ai.completed || 0,
      aiFailures: ai.failed || 0,
      apiRequests: apiRequests.length,
      apiErrorRate: apiRequests.length ? Math.round(apiRequests.filter((item) => item.statusCode >= 400).length / apiRequests.length * 1000) / 10 : 0,
      apiP95LatencyMs: apiRequests.length ? [...apiRequests].sort((a, b) => a.latencyMs - b.latencyMs)[Math.floor((apiRequests.length - 1) * .95)].latencyMs : null,
      activeMarketplaceInstalls: installs,
      webhookDelivered: webhooks.delivered || 0,
      webhookFailed: webhooks.failed || 0,
      channelProcessed: channels.processed || 0,
      channelFailed: channels.failed || 0,
      campaigns: Object.values(campaignStatuses).reduce((sum, value) => sum + value, 0),
      campaignRecipients: Object.values(campaignRecipientStatuses).reduce((sum, value) => sum + value, 0),
      campaignAccepted,
      campaignDelivered,
      campaignRead: campaignRecipientStatuses.read || 0,
      campaignFailed: campaignRecipientStatuses.failed || 0,
      campaignExcluded: campaignRecipientStatuses.excluded || 0,
      campaignDeliveryRate: campaignAccepted ? Math.round(campaignDelivered / campaignAccepted * 1000) / 10 : 0,
      campaignReadRate: campaignDelivered ? Math.round((campaignRecipientStatuses.read || 0) / campaignDelivered * 1000) / 10 : 0,
    },
    byChannel,
    byLeadSource,
    byStartSource,
    daily,
    deliveryStatuses,
    campaignStatuses,
    campaignRecipientStatuses,
    automationRuns,
    aiRuns,
    webhookDeliveries,
    channelEvents,
  };
}
