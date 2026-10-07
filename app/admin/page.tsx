import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { planPrice } from "@/lib/billing";
import { redirect } from "next/navigation";
import AdminDashboard from "./AdminDashboard";
import { backupRestoreStatus } from "@/lib/system-operations";
import { adminConversationNorthStar } from "@/lib/admin-growth-metrics";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) redirect("/login");

  await prisma.user.updateMany({
    where: {
      plan: { not: "free" },
      planExpiresAt: { not: null, lte: new Date() },
    },
    data: { plan: "free", planExpiresAt: null },
  });

  const nowD = new Date();
  const thirtyDaysAgo = new Date(nowD.getTime() - 30 * 86_400_000);
  // Analytics v2 records one acquisition session per browser/day and excludes
  // staff/bots. Earlier route-level QA data is intentionally omitted.
  const cleanTrafficStartedAt = new Date("2026-08-02T00:00:00.000Z");
  const cleanTrafficSince = thirtyDaysAgo > cleanTrafficStartedAt ? thirtyDaysAgo : cleanTrafficStartedAt;
  const cleanVisitorWhere = {
    createdAt: { gte: cleanTrafficSince },
    path: { startsWith: "/" },
    NOT: [
      { source: { equals: "31.97.189.118" } },
      { source: { equals: "wazap.lt" } },
    ],
    OR: [{ userId: null }, { user: { isAdmin: false } }],
  };
  const [users, allPayments, contactMessages, supportConversations, funnelEvents, visitCountries, visitSources, yahooPaths, yahooVisits7d, yahooVisits30d, yahooKnownVisits, queuedEmails, emailFailures, emailAwaitingDelivery] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        payments: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    }),
    prisma.payment.findMany({
      where: {
        activatedAt: { not: null },
        txId: { not: null },
        method: { in: ["dodo", "paypal"] },
        status: { notIn: ["refunded", "chargeback"] },
        NOT: { method: "paypal", txId: { startsWith: "I-" } },
      },
      select: { userId: true, amount: true, method: true, status: true },
    }),
    prisma.contactMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.supportConversation.findMany({
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      include: { messages: { orderBy: { createdAt: "asc" }, take: 100 } },
    }),
    prisma.funnelEvent.findMany({
      where: {
        createdAt: { gte: thirtyDaysAgo },
        OR: [{ userId: null }, { user: { isAdmin: false } }],
      },
      select: { name: true, userId: true, id: true },
    }),
    prisma.siteVisit.groupBy({
      by: ["country"], where: cleanVisitorWhere, _count: { _all: true }, orderBy: { _count: { country: "desc" } }, take: 8,
    }),
    prisma.siteVisit.groupBy({
      by: ["source"], where: cleanVisitorWhere, _count: { _all: true }, orderBy: { _count: { source: "desc" } }, take: 8,
    }),
    prisma.siteVisit.groupBy({
      by: ["path"],
      where: { ...cleanVisitorWhere, source: { contains: "yahoo", mode: "insensitive" } },
      _count: { _all: true },
      orderBy: { _count: { path: "desc" } },
      take: 8,
    }),
    prisma.siteVisit.count({
      where: { ...cleanVisitorWhere, createdAt: { gte: new Date(Math.max(cleanTrafficSince.getTime(), nowD.getTime() - 7 * 86_400_000)) }, source: { contains: "yahoo", mode: "insensitive" } },
    }),
    prisma.siteVisit.count({
      where: { ...cleanVisitorWhere, source: { contains: "yahoo", mode: "insensitive" } },
    }),
    prisma.siteVisit.count({
      where: { ...cleanVisitorWhere, source: { contains: "yahoo", mode: "insensitive" }, userId: { not: null } },
    }),
    prisma.outboundEmail.count({ where: { status: "queued" } }),
    prisma.outboundEmail.count({
      where: {
        status: { in: ["failed", "deferred"] },
        createdAt: { gte: thirtyDaysAgo },
        NOT: [
          { recipient: { endsWith: ".invalid" } },
          { recipient: { endsWith: "@example.com" } },
          { type: { startsWith: "delivery_test" } },
        ],
      },
    }),
    prisma.outboundEmail.count({ where: { status: { in: ["accepted", "sent"] } } }),
  ]);

  const funnelCounts = new Map<string, Set<string>>();
  for (const event of funnelEvents) {
    const identities = funnelCounts.get(event.name) ?? new Set<string>();
    identities.add(event.userId ? `user:${event.userId}` : `event:${event.id}`);
    funnelCounts.set(event.name, identities);
  }

  const [backupRestore, northStar] = await Promise.all([
    backupRestoreStatus(),
    adminConversationNorthStar(nowD),
  ]);
  const totalRevenue = allPayments.reduce((s, p) => s + p.amount, 0);
  const customerUsers = users.filter(u => !u.isAdmin);
  const in7 = new Date(nowD.getTime() + 7 * 86_400_000);
  const activeSubs = customerUsers.filter(u => u.plan !== "free" && u.planExpiresAt && u.planExpiresAt > nowD);
  const recurringUserIds = new Set(allPayments.filter(payment => payment.status === "active" && payment.userId).map(payment => payment.userId));
  const paidSubscribers = activeSubs.filter(user => recurringUserIds.has(user.id));
  const subscribers = paidSubscribers.length;
  const mrr = paidSubscribers.reduce((sum, u) => sum + planPrice(u.plan), 0);
  const expiringSoon = activeSubs.filter(u => u.planExpiresAt && u.planExpiresAt <= in7).length;
  const churnedUserIds = new Set(allPayments.filter(payment => payment.status === "inactive" && payment.userId).map(payment => payment.userId));
  const churned = customerUsers.filter(u => u.plan === "free" && churnedUserIds.has(u.id)).length;
  const activeTrials = customerUsers.filter(u => u.plan === "free" && u.trialEndsAt && u.trialEndsAt > nowD).length;

  const data = {
    stats: {
      totalUsers: customerUsers.length,
      subscribers,
      conversionPct: customerUsers.length > 0 ? Math.round((subscribers / customerUsers.length) * 100) : 0,
      totalRevenue: totalRevenue.toFixed(2),
      mrr: mrr.toFixed(2),
      expiringSoon,
      churned,
      activeTrials,
      queuedEmails,
      emailFailures,
      emailAwaitingDelivery,
    },
    system: { backupRestore, northStar },
    funnel: [...funnelCounts].map(([name, identities]) => ({ name, count: identities.size })),
    traffic: {
      countries: visitCountries.map(group => ({ label: group.country, count: group._count._all })),
      sources: visitSources.map(group => ({ label: group.source || "direct", count: group._count._all })),
      yahoo: {
        visits7d: yahooVisits7d,
        visits30d: yahooVisits30d,
        knownUserVisits: yahooKnownVisits,
        paths: yahooPaths.map(group => ({ label: group.path, count: group._count._all })),
      },
    },
    users: users.map(u => ({
      id: u.id, email: u.email, name: u.name, plan: u.plan,
      planExpiresAt: u.planExpiresAt?.toISOString() ?? null,
      trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
      trialPlan: u.trialPlan,
      isAdmin: u.isAdmin, createdAt: u.createdAt.toISOString(),
      payments: u.payments.map(p => ({
        id: p.id, plan: p.plan, amount: p.amount, method: p.method,
        txId: p.txId, status: p.status, createdAt: p.createdAt.toISOString(),
      })),
    })),
    contactMessages: contactMessages.map(m => ({
      id: m.id, name: m.name, email: m.email, subject: m.subject,
      message: m.message, adminReply: m.adminReply, repliedAt: m.repliedAt?.toISOString() ?? null,
      adminReplySeenAt: m.adminReplySeenAt?.toISOString() ?? null,
      read: m.read, createdAt: m.createdAt.toISOString(),
    })),
    supportConversations: supportConversations.map(c => ({
      id: c.id,
      visitorId: c.visitorId,
      name: c.name,
      email: c.email,
    phone: c.phone,
    crmLeadId: c.crmLeadId,
      subject: c.subject,
      status: c.status,
      intent: c.intent,
      leadScore: c.leadScore,
      aiSummary: c.aiSummary,
      lastMessageAt: c.lastMessageAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
      unread: c.messages.filter(m => m.sender === "visitor" && !m.readByAdmin).length,
      messages: c.messages.map(m => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        readByAdmin: m.readByAdmin,
        readByVisitor: m.readByVisitor,
        createdAt: m.createdAt.toISOString(),
      })),
    })),
  };

  return (
    <>
      <div className="w-full min-w-0 max-w-7xl mx-auto px-4 py-8">
        <AdminDashboard data={data} />
      </div>
    </>
  );
}
