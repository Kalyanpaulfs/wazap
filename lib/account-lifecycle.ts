import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { sanitizeAccountExport } from "@/lib/account-export-sanitize";

export const ACCOUNT_DELETION_GRACE_DAYS = 7;

export async function accountClosureBlockers(userId: string) {
  const [billing, sharedOwnedWorkspaces] = await Promise.all([
    prisma.payment.findFirst({
      where: {
        userId,
        status: { in: ["active", "subscription_active"] },
        txId: { not: null },
        OR: [
          { method: "dodo", status: "subscription_active" },
          { method: "paypal", txId: { startsWith: "I-" } },
        ],
      },
      select: { method: true, plan: true },
      orderBy: [{ activatedAt: "desc" }, { createdAt: "desc" }],
    }),
    prisma.workspace.findMany({
      where: { ownerId: userId, members: { some: { userId: { not: userId } } } },
      select: { id: true, name: true, _count: { select: { members: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    billing: billing ? { method: billing.method, plan: billing.plan } : null,
    sharedOwnedWorkspaces: sharedOwnedWorkspaces.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      members: workspace._count.members,
    })),
  };
}

export async function permanentlyDeleteAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, accountDeletionScheduledFor: true },
  });
  if (!user?.accountDeletionScheduledFor || user.accountDeletionScheduledFor > new Date()) {
    return { deleted: false, reason: "not_due" as const };
  }
  const blockers = await accountClosureBlockers(user.id);
  if (blockers.billing || blockers.sharedOwnedWorkspaces.length) {
    await prisma.user.update({
      where: { id: user.id },
      data: { accountDeletionRequestedAt: null, accountDeletionScheduledFor: null },
    });
    return { deleted: false, reason: "blocked" as const };
  }

  const digest = createHash("sha256").update(`${user.id}:${user.email}`).digest("hex").slice(0, 24);
  const retainedEmail = `deleted+${digest}@wazap.invalid`;
  await prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({ where: { userId: user.id }, data: { email: retainedEmail } });
    await tx.$executeRaw`UPDATE "SecurityPaymentReconciliation" SET "original" = jsonb_set(jsonb_set("original", '{email}', to_jsonb(${retainedEmail}::text)), '{userId}', 'null'::jsonb) WHERE "original" ->> 'userId' = ${user.id}`;
    await tx.outboundEmail.deleteMany({
      where: { OR: [{ userId: user.id }, { recipient: { equals: user.email, mode: "insensitive" } }] },
    });
    await tx.contactMessage.deleteMany({ where: { email: { equals: user.email, mode: "insensitive" } } });
    await tx.workspaceInvitation.deleteMany({ where: { email: { equals: user.email, mode: "insensitive" } } });
    await tx.funnelEvent.deleteMany({ where: { userId: user.id } });
    await tx.siteVisit.deleteMany({ where: { userId: user.id } });
    await tx.user.delete({ where: { id: user.id } });
  });
  return { deleted: true, reason: "completed" as const };
}

export async function buildAccountExport(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      planExpiresAt: true,
      trialStartedAt: true,
      trialEndsAt: true,
      trialPlan: true,
      createdAt: true,
      updatedAt: true,
      accountDeletionRequestedAt: true,
      accountDeletionScheduledFor: true,
      workspaceMemberships: {
        select: {
          id: true,
          role: true,
          createdAt: true,
          workspace: { select: { id: true, name: true, slug: true, ownerId: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) return null;
  const owned = await prisma.workspace.findMany({
    where: { ownerId: userId },
    select: {
      id: true,
      name: true,
      slug: true,
      createdAt: true,
      updatedAt: true,
      members: {
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, email: true, name: true } },
        },
      },
      invitations: {
        select: { id: true, email: true, role: true, status: true, expiresAt: true, createdAt: true, acceptedAt: true },
      },
      leads: { include: { activities: true, conversationStarts: true, catalogOrders: true } },
      inboxConversations: {
        include: {
          messages: { select: { id: true, direction: true, senderType: true, senderMemberId: true, providerMessageId: true, text: true, deliveryStatus: true, sentAt: true, readAt: true, createdAt: true } },
          notes: true,
          tasks: true,
          events: true,
        },
      },
      inboxTasks: true,
      inboxEvents: true,
      aiAgents: true,
      aiKnowledge: true,
      aiRuns: true,
      aiDrafts: true,
      aiHandoffs: true,
      aiEvaluations: true,
      apiKeys: {
        select: { id: true, name: true, prefix: true, scopes: true, status: true, lastUsedAt: true, expiresAt: true, revokedAt: true, createdAt: true },
      },
      apiRequestLogs: {
        select: { id: true, apiKeyId: true, requestId: true, method: true, path: true, statusCode: true, latencyMs: true, errorCode: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      apiIdempotencyRecords: {
        select: { id: true, apiKeyId: true, method: true, path: true, statusCode: true, response: true, expiresAt: true, createdAt: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      },
      webhookEndpoints: {
        select: {
          id: true, url: true, description: true, secretPrefix: true, events: true, status: true, failureCount: true, lastDeliveredAt: true, disabledAt: true, createdAt: true, updatedAt: true,
          deliveries: {
            select: {
              id: true, eventId: true, eventType: true, payload: true, status: true, attempts: true, responseStatus: true, nextAttemptAt: true, deliveredAt: true, lastError: true, createdAt: true, updatedAt: true,
              deliveryAttempts: { select: { id: true, attemptNumber: true, outcome: true, responseStatus: true, latencyMs: true, errorCode: true, createdAt: true }, orderBy: { attemptNumber: "asc" } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
      marketplacePublisher: {
        include: { listings: { include: { versions: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } } },
      },
      marketplaceInstalls: {
        include: { listing: { select: { id: true, slug: true, name: true, packageType: true } }, version: { select: { id: true, version: true, manifestHash: true } } },
      },
      partnerAccount: { include: { attributions: true, referralTouches: { select: { id: true, source: true, landingPage: true, expiresAt: true, claimedWorkspaceId: true, claimedAt: true, createdAt: true }, orderBy: { createdAt: "asc" } } } },
      partnerAttributions: true,
      channelConnections: {
        select: { id: true, channel: true, provider: true, displayName: true, externalAccountId: true, status: true, capabilities: true, secretPrefix: true, config: true, lastVerifiedAt: true, lastEventAt: true, lastError: true, createdAt: true, updatedAt: true },
      },
      channelEvents: true,
      whatsappTemplates: true,
      whatsappConsents: true,
      whatsappCampaigns: { include: { recipients: true } },
      whatsappMigrations: true,
      automationRules: { include: { runs: true } },
      operationalSnapshots: true,
      operationalIncidents: { include: { updates: { orderBy: { createdAt: "asc" } } } },
      auditEvents: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });
  const [
    payments,
    usage,
    adLinks,
    rotators,
    linktreePages,
    contactLists,
    scheduledSends,
    shortLinks,
    catalogs,
    marketplaceReviews,
    marketplaceAbuseReports,
    outboundEmails,
    funnelEvents,
    siteVisits,
    contactMessages,
    supportConversations,
  ] = await Promise.all([
    prisma.payment.findMany({ where: { userId }, select: { id: true, plan: true, amount: true, currency: true, method: true, txId: true, status: true, activatedAt: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.dailyUsage.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    prisma.adLink.findMany({ where: { userId }, include: { clickEvents: true }, orderBy: { createdAt: "asc" } }),
    prisma.rotatorLink.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.linktreePage.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.contactList.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.scheduledSend.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.shortLink.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.catalogPage.findMany({ where: { userId }, include: { orders: true }, orderBy: { createdAt: "asc" } }),
    prisma.marketplaceReview.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.marketplaceAbuseReport.findMany({ where: { workspaceId: { in: owned.map((workspace) => workspace.id) } }, orderBy: { createdAt: "asc" } }),
    prisma.outboundEmail.findMany({
      where: { userId },
      select: { id: true, recipient: true, type: true, subject: true, status: true, attempts: true, sentAt: true, deliveredAt: true, provider: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.funnelEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.siteVisit.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.contactMessage.findMany({ where: { email: { equals: user.email, mode: "insensitive" } }, orderBy: { createdAt: "asc" } }),
    prisma.supportConversation.findMany({ where: { email: { equals: user.email, mode: "insensitive" } }, include: { messages: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }),
  ]);
  return sanitizeAccountExport({
    exportVersion: "2026-08-03",
    generatedAt: new Date().toISOString(),
    securityNotice: "Passwords, password-reset tokens, API-key hashes, webhook secrets, channel signing secrets, access tokens, and session tokens are intentionally excluded.",
    account: user,
    ownedWorkspaces: owned,
    billing: payments,
    dailyUsage: usage,
    tools: { adLinks, rotators, linktreePages, contactLists, scheduledSends, shortLinks, catalogs },
    marketplaceReviews,
    marketplaceAbuseReports,
    outboundEmailHistory: outboundEmails,
    funnelEvents,
    siteVisits,
    contactMessages,
    supportConversations,
  });
}
