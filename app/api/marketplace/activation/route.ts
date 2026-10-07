import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  marketplaceContext,
  marketplaceMutationAllowed,
} from "@/lib/marketplace";
import { cleanInboxText } from "@/lib/inbox";
import { rateLimit } from "@/lib/rate-limit";
import { recordFunnelEvent } from "@/lib/funnel";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { aiExecutionState } from "@/lib/ai-agents";

type SetupConfig = {
  objective?: string;
  audience?: string;
  channelId?: string;
  knowledgeIds?: string[];
  sampleCustomerMessage?: string;
  sampleDraft?: string;
};

function setupConfig(value: Prisma.JsonValue | null): SetupConfig {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return value as SetupConfig;
}

function preview(roleType: string, objective: string, audience: string) {
  const audienceText = audience || "the customer";
  if (roleType === "support_agent") {
    return `Thanks for explaining that. I understand ${audienceText} needs help with ${objective || "this request"}. I’ll confirm the relevant details and prepare the next step for a human teammate to review.`;
  }
  if (roleType === "real_estate_agent") {
    return `Thanks for your interest. To help with ${objective || "your property search"}, could you share your preferred location, budget, timeline, and whether this is for investment or personal use? A property advisor will review the details before following up.`;
  }
  return `Thanks for reaching out. To help with ${objective || "your enquiry"}, could you share your main goal, timeline, and any requirements? I’ll organize the details for a human teammate to review.`;
}

async function activeInstall(workspaceId: string, installId: string) {
  return prisma.marketplaceInstall.findFirst({
    where: { id: installId, workspaceId, status: "active" },
    include: {
      listing: { select: { id: true, name: true, slug: true, packageType: true } },
      version: { select: { version: true } },
    },
  });
}

export async function GET() {
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [installs, channels, knowledgeCount, completedRuns, drafts, handoffs, leads] =
    await Promise.all([
      prisma.marketplaceInstall.findMany({
        where: { workspaceId: ctx.workspaceId, status: "active" },
        orderBy: { installedAt: "desc" },
        include: {
          listing: { select: { id: true, name: true, slug: true, packageType: true, requestedScopes: true } },
          version: { select: { version: true } },
        },
      }),
      prisma.channelConnection.findMany({
        where: { workspaceId: ctx.workspaceId, status: { in: ["active", "paused", "pending_verification"] } },
        select: { id: true, displayName: true, channel: true, status: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.aiKnowledge.count({ where: { workspaceId: ctx.workspaceId, status: "active" } }),
      prisma.aiRun.count({ where: { workspaceId: ctx.workspaceId, status: "completed" } }),
      prisma.aiDraft.count({ where: { workspaceId: ctx.workspaceId } }),
      prisma.aiHandoff.count({ where: { workspaceId: ctx.workspaceId } }),
      prisma.lead.count({ where: { workspaceId: ctx.workspaceId } }),
    ]);
  const agentIds = installs.map((install) => install.installedAgentId).filter((id): id is string => Boolean(id));
  const [runsByAgent, draftsByAgent, handoffsByAgent] = agentIds.length
    ? await Promise.all([
        prisma.aiRun.groupBy({ by: ["agentId"], where: { workspaceId: ctx.workspaceId, agentId: { in: agentIds }, status: "completed" }, _count: { _all: true } }),
        prisma.aiDraft.groupBy({ by: ["agentId"], where: { workspaceId: ctx.workspaceId, agentId: { in: agentIds } }, _count: { _all: true } }),
        prisma.aiHandoff.groupBy({ by: ["agentId"], where: { workspaceId: ctx.workspaceId, agentId: { in: agentIds } }, _count: { _all: true } }),
      ])
    : [[], [], []];
  const outcomesByInstall = Object.fromEntries(installs.map((install) => {
    const agentId = install.installedAgentId;
    return [install.id, {
      completedRuns: runsByAgent.find((item) => item.agentId === agentId)?._count._all || 0,
      draftsPrepared: draftsByAgent.find((item) => item.agentId === agentId)?._count._all || 0,
      humanHandoffs: handoffsByAgent.find((item) => item.agentId === agentId)?._count._all || 0,
      leadsTracked: leads,
    }];
  }));
  return NextResponse.json({
    installs,
    channels,
    knowledgeCount,
    outcomes: { completedRuns, draftsPrepared: drafts, humanHandoffs: handoffs, leadsTracked: leads },
    outcomesByInstall,
  });
}

export async function POST(req: Request) {
  if (!marketplaceMutationAllowed(req))
    return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const ctx = await marketplaceContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role))
    return NextResponse.json({ error: "Owner or admin approval is required." }, { status: 403 });
  if (!rateLimit(`marketplace-activation:${ctx.workspaceId}`, 30, 60_000))
    return NextResponse.json({ error: "Too many setup changes. Try again shortly." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || "");
  const install = await activeInstall(ctx.workspaceId, String(body.installId || ""));
  if (!install || !install.installedAgentId)
    return NextResponse.json({ error: "Active marketplace agent install not found." }, { status: 404 });
  const agent = await prisma.aiAgent.findFirst({
    where: { id: install.installedAgentId, workspaceId: ctx.workspaceId, archivedAt: null },
  });
  if (!agent) return NextResponse.json({ error: "Installed agent not found." }, { status: 409 });

  if (action === "configure") {
    const objective = cleanInboxText(body.objective, 500);
    const audience = cleanInboxText(body.audience, 300);
    if (objective.length < 10 || audience.length < 3)
      return NextResponse.json({ error: "Describe a clear objective and customer audience." }, { status: 400 });
    const channelId = cleanInboxText(body.channelId, 100);
    if (channelId && channelId !== "manual_review") {
      const channel = await prisma.channelConnection.findFirst({
        where: { id: channelId, workspaceId: ctx.workspaceId, status: { not: "disabled" } },
        select: { id: true },
      });
      if (!channel) return NextResponse.json({ error: "Selected channel is unavailable." }, { status: 400 });
    }
    const config = { ...setupConfig(install.config), objective, audience, channelId: channelId || "manual_review" };
    await prisma.$transaction([
      prisma.marketplaceInstall.update({
        where: { id: install.id },
        data: { config: config as Prisma.InputJsonValue, setupStatus: "configured" },
      }),
      prisma.aiAgent.update({
        where: { id: agent.id },
        data: {
          instructions: `${agent.instructions}\n\nWORKSPACE OBJECTIVE:\n${objective}\n\nCUSTOMER AUDIENCE:\n${audience}`.slice(0, 6000),
          status: "draft",
          responseMode: "draft_only",
        },
      }),
    ]);
    await recordFunnelEvent("agent_setup_started", {
      userId: ctx.userId,
      source: "marketplace",
      metadata: { installId: install.id, listingId: install.listingId },
    });
    return NextResponse.json({ success: true, setupStatus: "configured" });
  }

  if (action === "test") {
    const config = setupConfig(install.config);
    if (!config.objective || !config.audience)
      return NextResponse.json({ error: "Complete the objective step before testing." }, { status: 409 });
    const sampleCustomerMessage =
      cleanInboxText(body.sampleCustomerMessage, 1000) ||
      "Hi, I would like more information and help with the next step.";
    const sampleDraft = preview(agent.roleType, config.objective, config.audience);
    const testedAt = new Date();
    await prisma.marketplaceInstall.update({
      where: { id: install.id },
      data: {
        setupStatus: "tested",
        lastTestedAt: testedAt,
        config: { ...config, sampleCustomerMessage, sampleDraft } as Prisma.InputJsonValue,
      },
    });
    await recordFunnelEvent("agent_test_completed", {
      userId: ctx.userId,
      source: "marketplace",
      metadata: { installId: install.id, listingId: install.listingId },
    });
    return NextResponse.json({
      success: true,
      setupStatus: "tested",
      sampleCustomerMessage,
      sampleDraft,
      sent: false,
      notice: "Preview created locally for review. No customer message was sent.",
    });
  }

  if (action === "activate") {
    if (!install.lastTestedAt)
      return NextResponse.json({ error: "Run and review a safe test before activation." }, { status: 409 });
    const execution = await aiExecutionState(ctx.workspaceId);
    if (execution.workspacePaused || execution.globalPaused)
      return NextResponse.json({ error: execution.reason }, { status: 423 });
    if (execution.providerConfigured) {
      const passedEvaluation = await prisma.aiEvaluation.findFirst({
        where: { workspaceId: ctx.workspaceId, agentId: agent.id, status: "passed" },
        orderBy: { completedAt: "desc" },
      });
      if (!passedEvaluation)
        return NextResponse.json({ error: "Run and pass this agent’s model safety evaluation before activation." }, { status: 409 });
    }
    const activatedAt = new Date();
    await prisma.$transaction([
      prisma.marketplaceInstall.update({
        where: { id: install.id },
        data: { setupStatus: "active", activatedAt },
      }),
      prisma.aiAgent.update({
        where: { id: agent.id },
        data: { status: "active", responseMode: "approval_required" },
      }),
    ]);
    await Promise.all([
      recordFunnelEvent("agent_activated", {
        userId: ctx.userId,
        source: "marketplace",
        metadata: { installId: install.id, listingId: install.listingId },
      }),
      enqueueWebhookEvent(ctx.workspaceId, "marketplace.agent_activated", {
        installId: install.id,
        listingId: install.listingId,
        agentId: agent.id,
        responseMode: "approval_required",
      }),
    ]);
    return NextResponse.json({
      success: true,
      setupStatus: "active",
      responseMode: "approval_required",
      notice: "Agent activated for human-reviewed drafts. Automatic sending remains disabled.",
    });
  }

  return NextResponse.json({ error: "Unsupported activation action." }, { status: 400 });
}
