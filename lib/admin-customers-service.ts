import { prisma } from "@/lib/prisma";
import { getPerformanceSnapshot } from "@/lib/performance";
import { salespersonName } from "@/lib/salesperson-names";
import { effectivePlan, isProductTrialActive, trialDaysLeft } from "@/lib/entitlements";
import { getPlanDaysLeft, planDisplayName } from "@/lib/billing";
import {
  getCustomerAccountStatus,
  computeUsageVsLimits,
  areCustomerLinksPaused,
  customerPlanLabel,
  CustomerAccountStatus,
} from "./admin-customer";
import type { Prisma } from "@prisma/client";

export type CustomerListItem = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  plan: string;
  displayPlan: string;
  trialActive: boolean;
  trialEndsAt: string | null;
  planExpiresAt: string | null;
  createdAt: string;
  lastLogin: string | null;
  accountStatus: CustomerAccountStatus;
  scheduledDeletionFor: string | null;
};

export type CustomerListResult = {
  customers: CustomerListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function listAdminCustomers(params: {
  q?: string;
  plan?: string;
  trial?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<CustomerListResult> {
  const pageSize = Math.max(1, Math.min(100, params.pageSize || 25));
  const page = Math.max(1, params.page || 1);
  const q = (params.q || "").trim().slice(0, 100);
  const planFilter = (params.plan || "").toLowerCase();
  const trialFilter = (params.trial || "").toLowerCase();
  const statusFilter = (params.status || "").toLowerCase();

  const digitsOnly = q.replace(/\D/g, "");
  const matchingLeadEmails = q
    ? (
        await prisma.crmLead.findMany({
          where: {
            OR: [
              { phone: { contains: q, mode: "insensitive" } },
              ...(digitsOnly.length >= 3 ? [{ phone: { contains: digitsOnly } }] : []),
            ],
          },
          select: { email: true },
          take: 200,
        })
      ).map((l) => l.email.toLowerCase())
    : [];

  const andConditions: Prisma.UserWhereInput[] = [];

  if (q) {
    andConditions.push({
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { shortLinks: { some: { phone: { contains: q, mode: "insensitive" } } } },
        { adLinks: { some: { number: { contains: q, mode: "insensitive" } } } },
        ...(digitsOnly.length >= 3 ? [{ rotatorLinks: { some: { numbers: { has: digitsOnly } } } }] : []),
        ...(matchingLeadEmails.length > 0 ? [{ email: { in: matchingLeadEmails } }] : []),
      ],
    });
  }

  if (planFilter && ["basic", "pro", "ultimate", "free"].includes(planFilter)) {
    if (planFilter === "ultimate") {
      andConditions.push({ plan: { in: ["ultimate", "business"] } });
    } else {
      andConditions.push({ plan: planFilter });
    }
  }

  if (trialFilter === "active") {
    andConditions.push({ plan: "free", trialEndsAt: { gt: new Date() } });
  } else if (trialFilter === "ended") {
    andConditions.push({
      plan: "free",
      OR: [
        { trialEndsAt: { lte: new Date() } },
        { trialEndsAt: null },
      ],
    });
  }

  if (statusFilter === "closing") {
    andConditions.push({ accountDeletionScheduledFor: { gt: new Date() } });
  } else if (statusFilter === "deleted") {
    andConditions.push({
      OR: [
        { email: { startsWith: "deleted+" } },
        { email: { endsWith: "@wazap.invalid" } },
      ],
    });
  } else if (statusFilter === "active") {
    andConditions.push({
      accountDeletionScheduledFor: null,
      email: { not: { endsWith: "@wazap.invalid" } },
    });
  }

  const where: Prisma.UserWhereInput = {
    isAdmin: false,
    ...(andConditions.length > 0 ? { AND: andConditions } : {}),
  };


  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        planExpiresAt: true,
        trialStartedAt: true,
        trialEndsAt: true,
        trialPlan: true,
        accountDeletionScheduledFor: true,
        accountDeletionRequestedAt: true,
        createdAt: true,
      },
    }),
    prisma.user.count({ where }),
  ]);

  const emails = users.map((u) => u.email.toLowerCase());
  const crmLeads = emails.length
    ? await prisma.crmLead.findMany({
        where: { email: { in: emails } },
        select: { email: true, phone: true },
      })
    : [];
  const phoneByEmail = new Map(crmLeads.map((l) => [l.email.toLowerCase(), l.phone]));

  const customers: CustomerListItem[] = users.map((u) => {
    const trial = isProductTrialActive(u);
    const displayPlan = customerPlanLabel(u);
    const lifecycle = getCustomerAccountStatus(u);

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: phoneByEmail.get(u.email.toLowerCase()) || null,
      plan: u.plan,
      displayPlan,
      trialActive: trial,
      trialEndsAt: u.trialEndsAt ? u.trialEndsAt.toISOString() : null,
      planExpiresAt: u.planExpiresAt ? u.planExpiresAt.toISOString() : null,
      createdAt: u.createdAt.toISOString(),
      lastLogin: null, // Not persisted in DB
      accountStatus: lifecycle.status,
      scheduledDeletionFor: lifecycle.scheduledFor ? lifecycle.scheduledFor.toISOString() : null,
    };
  });

  return {
    customers,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export type CustomerDetailResult = {
  profile: {
    id: string;
    name: string | null;
    email: string;
    phone: string | null;
    createdAt: string;
    loginMethod: "Google" | "Email code";
    workspace: {
      id: string;
      name: string;
      slug: string;
      memberCount: number;
      members: {
        id: string;
        name: string | null;
        email: string;
        role: string;
      }[];
    } | null;
  };
  plan: {
    plan: string;
    displayPlan: string;
    trialActive: boolean;
    trialStartedAt: string | null;
    trialEndsAt: string | null;
    trialDaysLeft: number | null;
    planExpiresAt: string | null;
    paidDaysLeft: number | null;
    autoPay: boolean | null;
    linksPaused: boolean;
  };
  planHistory: {
    id: string;
    actor: string;
    action: string;
    beforePlan: string | null;
    afterPlan: string | null;
    reason: string | null;
    createdAt: string;
  }[];
  rotators: {
    id: string;
    name: string;
    code: string;
    publicUrl: string;
    status: "Live" | "Paused" | "Paused by customer";
    totalClicks: number;
    salespeople: { number: string; name: string }[];
    createdAt: string;
  }[];
  links: {
    shortLinks: {
      id: string;
      name: string;
      code: string;
      publicUrl: string;
      phone: string;
      clicks: number;
      status: "Live" | "Paused" | "Paused by customer";
      createdAt: string;
    }[];
    adLinks: {
      id: string;
      name: string;
      number: string;
      clicks: number;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      status: "Live" | "Paused" | "Paused by customer";
      createdAt: string;
    }[];
  };
  widget: {
    available: boolean;
    hasUsed: boolean;
    copiesCount: number;
    statusLabel: string;
  };
  leads: {
    today: number;
    last7d: number;
    last30d: number;
    total: number;
  };
  usageVsLimits: ReturnType<typeof computeUsageVsLimits>;
  supportChats: {
    id: string;
    subject: string;
    status: string;
    lastMessageAt: string;
    messagesCount: number;
    lastMessageSnippet: string | null;
  }[];
  accountStatus: {
    status: CustomerAccountStatus;
    scheduledFor: string | null;
    requestedAt: string | null;
    label: string;
  };
};

export async function getAdminCustomerDetails(userId: string): Promise<CustomerDetailResult | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      googleSubject: true,
      plan: true,
      planExpiresAt: true,
      trialStartedAt: true,
      trialEndsAt: true,
      trialPlan: true,
      accountDeletionScheduledFor: true,
      accountDeletionRequestedAt: true,
      createdAt: true,
      rotatorLinks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          code: true,
          numbers: true,
          numberNames: true,
          totalClicks: true,
          planPausedAt: true,
          pausedAt: true,
          createdAt: true,
        },
      },
      shortLinks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          code: true,
          phone: true,
          clicks: true,
          planPausedAt: true,
          pausedAt: true,
          createdAt: true,
        },
      },
      adLinks: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          number: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          clicks: true,
          planPausedAt: true,
          pausedAt: true,
          createdAt: true,
        },
      },
      ownedWorkspaces: {
        take: 1,
        include: {
          members: {
            include: {
              workspace: false,
            },
          },
        },
      },
      dailyUsage: {
        select: { widgetCopies: true },
      },
    },
  });

  if (!user) return null;

  // Workspace member users
  const workspace = user.ownedWorkspaces[0] || null;
  const memberUserIds = workspace ? workspace.members.map((m) => m.userId) : [];
  const memberUsers = memberUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: memberUserIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const memberUserMap = new Map(memberUsers.map((m) => [m.id, m]));

  // Auto-pay state
  const pointer = await prisma.securityUserBilling.findUnique({ where: { userId } });
  let autoPay: boolean | null = null;
  if (pointer) {
    const live = await prisma.payment.findFirst({
      where: {
        userId,
        method: pointer.provider,
        txId: pointer.subscriptionId,
        status: "subscription_active",
      },
      select: { id: true },
    });
    if (live) autoPay = pointer.autoRenew;
  }

  // CRM lead for phone
  const crmLead = await prisma.crmLead.findUnique({
    where: { email: user.email.toLowerCase() },
    select: { id: true, phone: true },
  });

  // Performance data (chats today, 7d, 30d) and total leads
  const [perf, totalLeads, auditLogs, supportChats] = await Promise.all([
    getPerformanceSnapshot(userId),
    prisma.conversationStart.count({ where: { userId } }),
    prisma.billingAuditLog.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    prisma.supportConversation.findMany({
      where: {
        OR: [
          { email: { equals: user.email, mode: "insensitive" } },
          ...(crmLead ? [{ crmLeadId: crmLead.id }] : []),
        ],
      },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { lastMessageAt: "desc" },
      take: 10,
    }),
  ]);

  // Actor lookup for audit logs
  const actorIds = [...new Set(auditLogs.map((l) => l.actorUserId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: actorIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const actorMap = new Map(actors.map((a) => [a.id, a.name || a.email]));

  // Plan info
  const trial = isProductTrialActive(user);
  const displayPlan = customerPlanLabel(user);
  const daysLeft = trial ? trialDaysLeft(user) : null;
  const paidDays = user.plan !== "free" && user.planExpiresAt ? getPlanDaysLeft(user.planExpiresAt) : null;
  const linksPaused = areCustomerLinksPaused(user);

  // Widget usage
  const totalWidgetCopies = user.dailyUsage.reduce((sum, d) => sum + (d.widgetCopies || 0), 0);
  const widgetAvailableInPlan = ["basic", "pro", "ultimate", "business"].includes(effectivePlan(user));

  // Max salespeople across rotators
  const maxSalespeople = user.rotatorLinks.reduce((max, r) => Math.max(max, r.numbers.length), 0);

  // Account status
  const lifecycle = getCustomerAccountStatus(user);
  let statusLabel = "Active";
  if (lifecycle.status === "closing") {
    statusLabel = lifecycle.scheduledFor
      ? `Closing on ${lifecycle.scheduledFor.toLocaleDateString("en-GB")}`
      : "Closing";
  } else if (lifecycle.status === "deleted") {
    statusLabel = "Account Deleted";
  }

  const origin = new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;

  return {
    profile: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: crmLead?.phone || user.shortLinks[0]?.phone || user.adLinks[0]?.number || null,
      createdAt: user.createdAt.toISOString(),
      loginMethod: user.googleSubject ? "Google" : "Email code",
      workspace: workspace
        ? {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            memberCount: workspace.members.length,
            members: workspace.members.map((m) => {
              const u = memberUserMap.get(m.userId);
              return {
                id: m.id,
                name: u?.name || null,
                email: u?.email || "Unknown user",
                role: m.role,
              };
            }),
          }
        : null,
    },
    plan: {
      plan: user.plan,
      displayPlan,
      trialActive: trial,
      trialStartedAt: user.trialStartedAt ? user.trialStartedAt.toISOString() : null,
      trialEndsAt: user.trialEndsAt ? user.trialEndsAt.toISOString() : null,
      trialDaysLeft: daysLeft,
      planExpiresAt: user.planExpiresAt ? user.planExpiresAt.toISOString() : null,
      paidDaysLeft: paidDays,
      autoPay,
      linksPaused,
    },
    planHistory: auditLogs.map((l) => {
      const detail = typeof l.detail === "object" && l.detail !== null ? (l.detail as Record<string, unknown>) : {};
      const beforeObj = typeof detail.before === "object" && detail.before !== null ? (detail.before as Record<string, unknown>) : null;
      const afterObj = typeof detail.after === "object" && detail.after !== null ? (detail.after as Record<string, unknown>) : null;
      const beforePlan = typeof beforeObj?.plan === "string" ? planDisplayName(beforeObj.plan) : null;
      const afterPlan = typeof afterObj?.plan === "string" ? planDisplayName(afterObj.plan) : null;
      const reason = typeof detail.reason === "string" ? detail.reason : null;
      const actorName = l.actorUserId ? (actorMap.get(l.actorUserId) || "Admin") : "System";
      return {
        id: l.id,
        actor: actorName,
        action: l.action,
        beforePlan,
        afterPlan,
        reason,
        createdAt: l.createdAt.toISOString(),
      };
    }),
    rotators: user.rotatorLinks.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      publicUrl: `${origin}/r/${r.code}`,
      status: r.planPausedAt ? "Paused" : r.pausedAt ? "Paused by customer" : "Live",
      totalClicks: r.totalClicks,
      salespeople: r.numbers.map((num) => ({
        number: num,
        name: salespersonName(r.numberNames, num) || "Unnamed",
      })),
      createdAt: r.createdAt.toISOString(),
    })),
    links: {
      shortLinks: user.shortLinks.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        publicUrl: `${origin}/w/${s.code}`,
        phone: s.phone,
        clicks: s.clicks,
        status: s.planPausedAt ? "Paused" : s.pausedAt ? "Paused by customer" : "Live",
        createdAt: s.createdAt.toISOString(),
      })),
      adLinks: user.adLinks.map((a) => ({
        id: a.id,
        name: a.name,
        number: a.number,
        clicks: a.clicks,
        utmSource: a.utmSource,
        utmMedium: a.utmMedium,
        utmCampaign: a.utmCampaign,
        status: a.planPausedAt ? "Paused" : a.pausedAt ? "Paused by customer" : "Live",
        createdAt: a.createdAt.toISOString(),
      })),
    },
    widget: {
      available: widgetAvailableInPlan,
      hasUsed: totalWidgetCopies > 0,
      copiesCount: totalWidgetCopies,
      statusLabel: widgetAvailableInPlan
        ? totalWidgetCopies > 0
          ? `Active (${totalWidgetCopies} copies generated)`
          : "Available (not yet generated)"
        : "Not available on free plan",
    },
    leads: {
      today: perf.totals.chatsToday,
      last7d: perf.totals.chats7d,
      last30d: perf.totals.chats30d,
      total: totalLeads,
    },
    usageVsLimits: computeUsageVsLimits(effectivePlan(user), {
      rotators: user.rotatorLinks.length,
      maxSalespeople,
      shortLinks: user.shortLinks.length,
      adLinks: user.adLinks.length,
    }),
    supportChats: supportChats.map((c) => ({
      id: c.id,
      subject: c.subject,
      status: c.status,
      lastMessageAt: c.lastMessageAt.toISOString(),
      messagesCount: c._count.messages,
      lastMessageSnippet: c.messages[0]?.body || null,
    })),
    accountStatus: {
      status: lifecycle.status,
      scheduledFor: lifecycle.scheduledFor ? lifecycle.scheduledFor.toISOString() : null,
      requestedAt: lifecycle.requestedAt ? lifecycle.requestedAt.toISOString() : null,
      label: statusLabel,
    },
  };
}
