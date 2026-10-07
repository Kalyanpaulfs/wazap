import "server-only";
import { prisma } from "@/lib/prisma";

const DAY_MS = 86_400_000;
const DUBAI_OFFSET_MS = 4 * 60 * 60 * 1000;

function startOfDubaiDay(now: Date) {
  const shifted = new Date(now.getTime() + DUBAI_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()) - DUBAI_OFFSET_MS);
}

export async function adminConversationNorthStar(now = new Date()) {
  const today = startOfDubaiDay(now);
  const sevenDaysAgo = new Date(today.getTime() - 6 * DAY_MS);
  const previousWeekStart = new Date(sevenDaysAgo.getTime() - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(today.getTime() - 29 * DAY_MS);
  const customerWorkspace = { owner: { isAdmin: false } };
  const [
    startsToday,
    inboxToday,
    starts7d,
    inbox7d,
    startsPrevious7d,
    inboxPrevious7d,
    starts30d,
    inbox30d,
    conversationStartsToday,
    newInboxConversationsToday,
  ] = await Promise.all([
    prisma.conversationStart.findMany({ where: { workspaceId: { not: null }, workspace: customerWorkspace, createdAt: { gte: today } }, distinct: ["workspaceId"], select: { workspaceId: true } }),
    prisma.inboxConversation.findMany({ where: { workspace: customerWorkspace, createdAt: { gte: today } }, distinct: ["workspaceId"], select: { workspaceId: true } }),
    prisma.conversationStart.findMany({ where: { workspaceId: { not: null }, workspace: customerWorkspace, createdAt: { gte: sevenDaysAgo } }, distinct: ["workspaceId"], select: { workspaceId: true } }),
    prisma.inboxConversation.findMany({ where: { workspace: customerWorkspace, createdAt: { gte: sevenDaysAgo } }, distinct: ["workspaceId"], select: { workspaceId: true } }),
    prisma.conversationStart.findMany({ where: { workspaceId: { not: null }, workspace: customerWorkspace, createdAt: { gte: previousWeekStart, lt: sevenDaysAgo } }, distinct: ["workspaceId"], select: { workspaceId: true } }),
    prisma.inboxConversation.findMany({ where: { workspace: customerWorkspace, createdAt: { gte: previousWeekStart, lt: sevenDaysAgo } }, distinct: ["workspaceId"], select: { workspaceId: true } }),
    prisma.conversationStart.findMany({ where: { workspaceId: { not: null }, workspace: customerWorkspace, createdAt: { gte: thirtyDaysAgo } }, distinct: ["workspaceId"], select: { workspaceId: true } }),
    prisma.inboxConversation.findMany({ where: { workspace: customerWorkspace, createdAt: { gte: thirtyDaysAgo } }, distinct: ["workspaceId"], select: { workspaceId: true } }),
    prisma.conversationStart.count({ where: { workspaceId: { not: null }, workspace: customerWorkspace, createdAt: { gte: today } } }),
    prisma.inboxConversation.count({ where: { workspace: customerWorkspace, createdAt: { gte: today } } }),
  ]);
  const inboxTodayIds = new Set(inboxToday.map((item) => item.workspaceId));
  const inbox7dIds = new Set(inbox7d.map((item) => item.workspaceId));
  const previousInbox7dIds = new Set(inboxPrevious7d.map((item) => item.workspaceId));
  const retained7d = [...inbox7dIds].filter((workspaceId) => previousInbox7dIds.has(workspaceId)).length;
  return {
    timezone: "Asia/Dubai",
    dayStartedAt: today.toISOString(),
    inboxBusinessesToday: inboxTodayIds.size,
    trackedLinkBusinessesToday: startsToday.length,
    trackedLinkStartsToday: conversationStartsToday,
    newInboxConversationsToday,
    inboxBusinesses7d: inbox7dIds.size,
    inboxBusinesses30d: inbox30d.length,
    trackedLinkBusinesses7d: starts7d.length,
    trackedLinkBusinesses30d: starts30d.length,
    retainedBusinesses7d: retained7d,
    retainedBusinesses7dRate: previousInbox7dIds.size ? Math.round(retained7d / previousInbox7dIds.size * 1000) / 10 : null,
  };
}
