import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { sanitizeAccountExport } from "@/lib/account-export-sanitize";
import { omitEmptyExportKeys } from "@/lib/account-export-shape";

export const ACCOUNT_DELETION_GRACE_DAYS = 7;

// Bump whenever the export's shape changes, so a saved copy can be matched
// back to the structure it was produced under.
export const ACCOUNT_EXPORT_FORMAT_VERSION = "2026-10-16";

export async function accountClosureBlockers(userId: string) {
  const billing = await prisma.payment.findFirst({
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
  });
  if (!billing) return { billing: null };

  // Turning PayPal auto-pay off cancels the subscription outright (its
  // Payment row moves to subscription_inactive, so it stops matching the
  // query above on its own). Dodo auto-pay off instead just stops the next
  // charge - lib/dodo.ts's setDodoAutoRenew - while the current Payment row
  // stays "subscription_active" until the paid period really ends. Without
  // this check, a Dodo customer who already turned auto-pay off (so the
  // subscription will NOT renew) was wrongly blocked from closing their
  // account, and the account-lifecycle cron (lib/account-lifecycle.ts's
  // permanentlyDeleteAccount, via the same function) would undo their
  // already-scheduled deletion every time it ran.
  const pointer = await prisma.securityUserBilling.findUnique({ where: { userId }, select: { autoRenew: true } });
  if (pointer && pointer.autoRenew === false) return { billing: null };

  return {
    billing: { method: billing.method, plan: billing.plan },
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
  if (blockers.billing) {
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
      where: { userId: user.id },
    });
    // Guest contact details do not establish account ownership. Preserve guest
    // enquiries until a separately verified history/deletion request.
    await tx.workspaceInvitation.deleteMany({ where: { acceptedById: user.id } });
    await tx.funnelEvent.deleteMany({ where: { userId: user.id } });
    await tx.siteVisit.deleteMany({ where: { userId: user.id } });
    await tx.user.delete({ where: { id: user.id } });
  });
  return { deleted: true, reason: "completed" as const };
}

// Builds the "Download your data" JSON export (GDPR access/portability
// request) for /account. The shape is organized around the current product
// (rotators, short links, ad links, chats started, payments, reports/site
// activity, account) at the top level. Every record this account ever
// created — including rows left over from features that have since been
// removed from the product — is still included; retired-feature data is
// just grouped under the single `olderFeatures` key, and only the sub-keys
// that actually hold data for this account are listed there.
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
      emailVerifiedAt: true,
      marketingOptOutAt: true,
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
      // conversationStarts are exported directly below (by userId) as the
      // current-product `chatsStarted` key — every row there is a superset
      // of the ones that would be reachable through a lead, so they are
      // intentionally left out of this nested include to avoid duplication.
      leads: { include: { activities: true, catalogOrders: true } },
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
    shortLinks,
    chatsStarted,
    linktreePages,
    contactLists,
    scheduledSends,
    catalogs,
    marketplaceReviews,
    marketplaceAbuseReports,
    outboundEmails,
    funnelEvents,
    siteVisits,
  ] = await Promise.all([
    prisma.payment.findMany({ where: { userId }, select: { id: true, plan: true, amount: true, currency: true, method: true, txId: true, status: true, activatedAt: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.dailyUsage.findMany({ where: { userId }, orderBy: { date: "asc" } }),
    prisma.adLink.findMany({ where: { userId }, include: { clickEvents: true }, orderBy: { createdAt: "asc" } }),
    prisma.rotatorLink.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.shortLink.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.conversationStart.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.linktreePage.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.contactList.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.scheduledSend.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
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
  ]);

  const olderFeatures = omitEmptyExportKeys({
    workspaceMemberships: user.workspaceMemberships,
    ownedWorkspaces: owned.map((workspace) => ({
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      members: workspace.members,
      invitations: workspace.invitations,
    })),
    crmLeads: owned.flatMap((workspace) => workspace.leads),
    inbox: {
      conversations: owned.flatMap((workspace) => workspace.inboxConversations),
      tasks: owned.flatMap((workspace) => workspace.inboxTasks),
      events: owned.flatMap((workspace) => workspace.inboxEvents),
    },
    aiAgents: {
      agents: owned.flatMap((workspace) => workspace.aiAgents),
      knowledge: owned.flatMap((workspace) => workspace.aiKnowledge),
      runs: owned.flatMap((workspace) => workspace.aiRuns),
      drafts: owned.flatMap((workspace) => workspace.aiDrafts),
      handoffs: owned.flatMap((workspace) => workspace.aiHandoffs),
      evaluations: owned.flatMap((workspace) => workspace.aiEvaluations),
    },
    automations: {
      rules: owned.flatMap((workspace) => workspace.automationRules),
    },
    marketplace: {
      publisher: owned.map((workspace) => workspace.marketplacePublisher).filter(Boolean),
      installs: owned.flatMap((workspace) => workspace.marketplaceInstalls),
      reviews: marketplaceReviews,
      abuseReports: marketplaceAbuseReports,
    },
    catalogs,
    linkPages: linktreePages,
    bulkMessaging: { contactLists, scheduledSends },
    channels: {
      connections: owned.flatMap((workspace) => workspace.channelConnections),
      events: owned.flatMap((workspace) => workspace.channelEvents),
    },
    whatsappCampaigns: {
      templates: owned.flatMap((workspace) => workspace.whatsappTemplates),
      consents: owned.flatMap((workspace) => workspace.whatsappConsents),
      campaigns: owned.flatMap((workspace) => workspace.whatsappCampaigns),
      migrations: owned.flatMap((workspace) => workspace.whatsappMigrations),
    },
    developerPlatform: {
      apiKeys: owned.flatMap((workspace) => workspace.apiKeys),
      apiRequestLogs: owned.flatMap((workspace) => workspace.apiRequestLogs),
      apiIdempotencyRecords: owned.flatMap((workspace) => workspace.apiIdempotencyRecords),
      webhookEndpoints: owned.flatMap((workspace) => workspace.webhookEndpoints),
    },
    operationsMonitoring: {
      snapshots: owned.flatMap((workspace) => workspace.operationalSnapshots),
      incidents: owned.flatMap((workspace) => workspace.operationalIncidents),
    },
    workspaceAuditEvents: owned.flatMap((workspace) => workspace.auditEvents),
    partnerProgram: {
      accounts: owned.map((workspace) => workspace.partnerAccount).filter(Boolean),
      attributions: owned.flatMap((workspace) => workspace.partnerAttributions),
    },
  });

  return sanitizeAccountExport({
    exportInfo: {
      generatedAt: new Date().toISOString(),
      formatVersion: ACCOUNT_EXPORT_FORMAT_VERSION,
      note: "Guest enquiries and chats are excluded because self-reported email does not establish ownership. Contact support for verified history recovery. Data from features Wazap has since retired is grouped under olderFeatures below.",
    },
    account: {
      profile: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, updatedAt: user.updatedAt },
      plan: { plan: user.plan, planExpiresAt: user.planExpiresAt },
      trial: { trialStartedAt: user.trialStartedAt, trialEndsAt: user.trialEndsAt, trialPlan: user.trialPlan },
      consent: { subscribedToOffersAndNews: !user.marketingOptOutAt, marketingOptOutAt: user.marketingOptOutAt },
      security: {
        emailVerifiedAt: user.emailVerifiedAt,
        closureRequestedAt: user.accountDeletionRequestedAt,
        closureScheduledFor: user.accountDeletionScheduledFor,
        notice: "Passwords, password-reset tokens, API-key hashes, webhook secrets, channel signing secrets, access tokens, and session tokens are intentionally excluded.",
      },
    },
    rotators,
    shortLinks,
    adLinks,
    chatsStarted,
    usage,
    payments,
    emailsSentToYou: outboundEmails,
    siteActivity: { funnelEvents, siteVisits },
    ...(Object.keys(olderFeatures).length ? { olderFeatures } : {}),
  });
}
