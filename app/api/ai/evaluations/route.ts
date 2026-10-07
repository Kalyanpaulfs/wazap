import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { aiExecutionState, currentAiContext } from "@/lib/ai-agents";
import { runAgentEvaluation } from "@/lib/ai-evaluations";
import { rateLimit } from "@/lib/rate-limit";

function sameOrigin(req: Request) { const origin = req.headers.get("origin"); return !origin || origin === new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin; }

export async function GET() {
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const evaluations = await prisma.aiEvaluation.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "desc" }, take: 50, include: { agent: { select: { name: true, roleType: true } } } });
  return NextResponse.json({ evaluations });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Workspace owner or admin access required." }, { status: 403 });
  if (!rateLimit(`ai-evaluation:${ctx.workspaceId}`, 3, 60 * 60_000)) return NextResponse.json({ error: "Evaluation limit reached. Try again later." }, { status: 429 });
  const execution = await aiExecutionState(ctx.workspaceId);
  if (!execution.enabled) return NextResponse.json({ error: execution.reason }, { status: execution.providerConfigured ? 423 : 503 });
  const body = await req.json().catch(() => ({}));
  const agent = await prisma.aiAgent.findFirst({ where: { id: String(body.agentId || ""), workspaceId: ctx.workspaceId, archivedAt: null } });
  if (!agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  const evaluation = await prisma.aiEvaluation.create({ data: { workspaceId: ctx.workspaceId, agentId: agent.id, roleType: agent.roleType, suiteVersion: "v1", status: "running", casesTotal: 4 } });
  try {
    const result = await runAgentEvaluation(agent);
    const completed = await prisma.$transaction(async (tx) => {
      const saved = await tx.aiEvaluation.update({ where: { id: evaluation.id }, data: { ...result, evidence: result.evidence as Prisma.InputJsonValue, completedAt: new Date() } });
      await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "ai_evaluation_completed", actorUserId: ctx.userId, metadata: { evaluationId: saved.id, agentId: agent.id, roleType: agent.roleType, status: saved.status, casesPassed: saved.casesPassed, casesTotal: saved.casesTotal } } });
      return saved;
    });
    return NextResponse.json({ evaluation: completed }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Evaluation failed.";
    await prisma.aiEvaluation.update({ where: { id: evaluation.id }, data: { status: "error", failureReason: message, completedAt: new Date() } });
    return NextResponse.json({ error: message, evaluationId: evaluation.id }, { status: 502 });
  }
}
