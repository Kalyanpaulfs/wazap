import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AI_AGENT_ROLES, aiExecutionState, cleanStringList, currentAiContext } from "@/lib/ai-agents";
import { cleanInboxText } from "@/lib/inbox";
import { rateLimit } from "@/lib/rate-limit";
import { enqueueWebhookEvent } from "@/lib/developer-platform";

const MODES = ["draft_only", "approval_required", "autonomous"];
function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

export async function GET() {
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [agents, knowledgeCount, runs, handoffs, evaluations, execution] = await Promise.all([
    prisma.aiAgent.findMany({ where: { workspaceId: ctx.workspaceId, archivedAt: null }, orderBy: { createdAt: "asc" }, include: { _count: { select: { runs: true, drafts: true, handoffs: true } } } }),
    prisma.aiKnowledge.count({ where: { workspaceId: ctx.workspaceId, status: "active" } }),
    prisma.aiRun.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: 20, include: { agent: { select: { name: true, roleType: true } } } }),
    prisma.aiHandoff.findMany({ where: { workspaceId: ctx.workspaceId, status: "open" }, orderBy: { createdAt: "desc" }, take: 20, include: { agent: { select: { name: true } }, conversation: { select: { id: true, contactName: true, contactAddress: true } }, assignedMember: { include: { user: { select: { name: true, email: true } } } } } }),
    prisma.aiEvaluation.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, agentId: true, roleType: true, status: true, casesTotal: true, casesPassed: true, accuracyScore: true, refusalScore: true, escalationScore: true, hallucinationScore: true, averageLatencyMs: true, estimatedCostUsd: true, completedAt: true, createdAt: true } }),
    aiExecutionState(ctx.workspaceId),
  ]);
  return NextResponse.json({ agents, knowledgeCount, runs, handoffs, evaluations, plan: ctx.plan, limits: { agents: ctx.agentLimit, knowledge: ctx.knowledgeLimit }, provider: { configured: execution.providerConfigured, name: "OpenAI", executionEnabled: execution.enabled, workspacePaused: execution.workspacePaused, globalPaused: execution.globalPaused, pausedAt: execution.pausedAt, reason: execution.reason } });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`ai-agent:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many agent changes. Please wait." }, { status: 429 });
  const count = await prisma.aiAgent.count({ where: { workspaceId: ctx.workspaceId, archivedAt: null } });
  if (count >= ctx.agentLimit) return NextResponse.json({ error: `Your ${ctx.plan} plan supports ${ctx.agentLimit} AI agent profile${ctx.agentLimit === 1 ? "" : "s"}.`, upgrade: true }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const name = cleanInboxText(body.name, 80);
  const instructions = cleanInboxText(body.instructions, 6000);
  const roleType = AI_AGENT_ROLES.includes(body.roleType) ? body.roleType : "sales_rep";
  if (!name || instructions.length < 20) return NextResponse.json({ error: "Agent name and clear instructions of at least 20 characters are required." }, { status: 400 });
  const agent = await prisma.$transaction(async (tx) => {
    const created = await tx.aiAgent.create({ data: { workspaceId: ctx.workspaceId, name, roleType, instructions, responseMode: body.responseMode === "approval_required" ? "approval_required" : "draft_only", tone: cleanInboxText(body.tone, 40) || "professional", language: cleanInboxText(body.language, 20) || "auto", allowedTopics: cleanStringList(body.allowedTopics), prohibitedTopics: cleanStringList(body.prohibitedTopics), escalationKeywords: cleanStringList(body.escalationKeywords), requireHumanFor: cleanStringList(body.requireHumanFor), maxMessagesPerThread: Math.max(1, Math.min(Number(body.maxMessagesPerThread) || 5, 20)) } });
    await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "agent_created", actorUserId: ctx.userId, metadata: { agentId: created.id, name: created.name, roleType: created.roleType, responseMode: created.responseMode } } });
    return created;
  });
  await enqueueWebhookEvent(ctx.workspaceId, "agent.created", { agentId: agent.id, roleType: agent.roleType, responseMode: agent.responseMode, status: agent.status, source: "wazap" });
  return NextResponse.json(agent, { status: 201 });
}

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`ai-agent:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many agent changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const existing = await prisma.aiAgent.findFirst({ where: { id: String(body.id ?? ""), workspaceId: ctx.workspaceId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  const requestedMode = MODES.includes(body.responseMode) ? body.responseMode : undefined;
  if (requestedMode === "autonomous") return NextResponse.json({ error: "Autonomous sending stays locked until a verified channel provider, delivery receipts, and workspace approval policy are active." }, { status: 409 });
  const status = ["draft", "active", "paused"].includes(body.status) ? body.status : undefined;
  if (status === "active") {
    if (!["owner", "admin"].includes(ctx.role))
      return NextResponse.json({ error: "A workspace owner or admin must activate AI agents." }, { status: 403 });
    const marketplaceInstall = await prisma.marketplaceInstall.findFirst({
      where: { workspaceId: ctx.workspaceId, installedAgentId: existing.id, status: "active" },
      select: { lastTestedAt: true },
    });
    if (marketplaceInstall && !marketplaceInstall.lastTestedAt)
      return NextResponse.json({ error: "Complete the marketplace safety test before activation." }, { status: 409 });
    const execution = await aiExecutionState(ctx.workspaceId);
    if (execution.workspacePaused || execution.globalPaused)
      return NextResponse.json({ error: execution.reason }, { status: 423 });
    const passedEvaluation = await prisma.aiEvaluation.findFirst({ where: { agentId: existing.id, workspaceId: ctx.workspaceId, status: "passed" }, orderBy: { completedAt: "desc" } });
    if (execution.providerConfigured && !passedEvaluation)
      return NextResponse.json({ error: "Run and pass this agent’s safety evaluation before activation." }, { status: 409 });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.aiAgent.update({ where: { id: existing.id }, data: { ...(body.name !== undefined ? { name: cleanInboxText(body.name, 80) } : {}), ...(body.instructions !== undefined ? { instructions: cleanInboxText(body.instructions, 6000) } : {}), ...(status ? { status } : {}), ...(requestedMode ? { responseMode: requestedMode } : {}), ...(body.tone !== undefined ? { tone: cleanInboxText(body.tone, 40) || "professional" } : {}), ...(body.language !== undefined ? { language: cleanInboxText(body.language, 20) || "auto" } : {}), ...(body.allowedTopics !== undefined ? { allowedTopics: cleanStringList(body.allowedTopics) } : {}), ...(body.prohibitedTopics !== undefined ? { prohibitedTopics: cleanStringList(body.prohibitedTopics) } : {}), ...(body.escalationKeywords !== undefined ? { escalationKeywords: cleanStringList(body.escalationKeywords) } : {}), ...(body.requireHumanFor !== undefined ? { requireHumanFor: cleanStringList(body.requireHumanFor) } : {}) } });
    await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "agent_updated", actorUserId: ctx.userId, metadata: { agentId: changed.id, name: changed.name, roleType: changed.roleType, status: changed.status, responseMode: changed.responseMode } } });
    return changed;
  });
  await enqueueWebhookEvent(ctx.workspaceId, "agent.updated", { agentId: updated.id, roleType: updated.roleType, responseMode: updated.responseMode, status: updated.status, source: "wazap" });
  return NextResponse.json({ success: true, agent: updated });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Workspace owner or admin access required." }, { status: 403 });
  if (!rateLimit(`ai-agent:${ctx.workspaceId}`, 20, 60_000)) return NextResponse.json({ error: "Too many agent changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const existing = await prisma.aiAgent.findFirst({ where: { id: String(body.id ?? ""), workspaceId: ctx.workspaceId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  const activeInstall = await prisma.marketplaceInstall.findFirst({ where: { workspaceId: ctx.workspaceId, installedAgentId: existing.id, status: "active" }, select: { id: true } });
  if (activeInstall) return NextResponse.json({ error: "Uninstall the active marketplace package before archiving this agent." }, { status: 409 });
  const archivedAt = new Date();
  await prisma.$transaction([
    prisma.aiAgent.update({ where: { id: existing.id }, data: { archivedAt, status: "paused", responseMode: "draft_only" } }),
    prisma.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "agent_archived", actorUserId: ctx.userId, metadata: { agentId: existing.id, name: existing.name, roleType: existing.roleType } } }),
  ]);
  await enqueueWebhookEvent(ctx.workspaceId, "agent.archived", { agentId: existing.id, archivedAt, source: "wazap" });
  return NextResponse.json({ success: true, archivedAt, retainedHistory: true });
}
