import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { aiExecutionState, currentAiContext } from "@/lib/ai-agents";
import { cleanInboxText } from "@/lib/inbox";
import { rateLimit } from "@/lib/rate-limit";

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

export async function GET() {
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await aiExecutionState(ctx.workspaceId));
}

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ctx = await currentAiContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role)) return NextResponse.json({ error: "Workspace owner or admin access required." }, { status: 403 });
  if (!rateLimit(`ai-control:${ctx.workspaceId}`, 10, 60_000)) return NextResponse.json({ error: "Too many AI control changes." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  if (typeof body.paused !== "boolean") return NextResponse.json({ error: "paused must be true or false." }, { status: 400 });
  const reason = cleanInboxText(body.reason, 300);
  if (body.paused && reason.length < 8) return NextResponse.json({ error: "Record a clear pause reason of at least 8 characters." }, { status: 400 });
  const now = new Date();
  await prisma.$transaction([
    prisma.workspace.update({ where: { id: ctx.workspaceId }, data: { aiExecutionPaused: body.paused, aiExecutionPausedAt: body.paused ? now : null, aiExecutionPauseReason: body.paused ? reason : null } }),
    prisma.aiAgent.updateMany({ where: { workspaceId: ctx.workspaceId, archivedAt: null, status: "active" }, data: { status: "paused" } }),
    prisma.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: body.paused ? "ai_execution_paused" : "ai_execution_resumed", actorUserId: ctx.userId, metadata: { reason: body.paused ? reason : "Execution restored; agents remain paused pending explicit reactivation.", at: now.toISOString() } } }),
  ]);
  return NextResponse.json({ ...(await aiExecutionState(ctx.workspaceId)), agentsRequireReactivation: true });
}
