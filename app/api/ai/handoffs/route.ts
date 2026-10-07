import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentAiContext } from "@/lib/ai-agents";
import { accessibleConversation, cleanInboxText, validWorkspaceMember } from "@/lib/inbox";
import { enqueueWebhookEvent } from "@/lib/developer-platform";

export async function POST(req: Request) {
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})); const conversation = await accessibleConversation(ctx.workspaceId, String(body.conversationId ?? ""));
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const reason = cleanInboxText(body.reason, 1000); if (!reason) return NextResponse.json({ error: "Handoff reason is required." }, { status: 400 });
  const agent = body.agentId ? await prisma.aiAgent.findFirst({ where: { id: String(body.agentId), workspaceId: ctx.workspaceId } }) : null;
  if (body.agentId && !agent) return NextResponse.json({ error: "Agent not found." }, { status: 404 });
  const assigned = body.assignedMemberId ? await validWorkspaceMember(ctx.workspaceId, body.assignedMemberId) : null;
  if (body.assignedMemberId && !assigned) return NextResponse.json({ error: "Assignee is not in this workspace." }, { status: 400 });
  const handoff = await prisma.$transaction(async (tx) => {
    const item = await tx.aiHandoff.create({ data: { workspaceId: ctx.workspaceId, conversationId: conversation.id, agentId: agent?.id, reason, severity: ["normal", "high", "urgent"].includes(body.severity) ? body.severity : "normal", assignedMemberId: assigned?.id ?? conversation.assignedMemberId } });
    await tx.inboxConversation.update({ where: { id: conversation.id }, data: { status: "pending", priority: body.severity === "urgent" ? "urgent" : conversation.priority, assignedMemberId: assigned?.id ?? conversation.assignedMemberId } });
    await tx.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: conversation.id, actorMemberId: ctx.memberId, type: "human_handoff_requested", metadata: { handoffId: item.id, severity: item.severity } } });
    return item;
  });
  await enqueueWebhookEvent(ctx.workspaceId, "handoff.created", { handoffId: handoff.id, conversationId: conversation.id, severity: handoff.severity, assignedMemberId: handoff.assignedMemberId });
  return NextResponse.json(handoff, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})); const handoff = await prisma.aiHandoff.findFirst({ where: { id: String(body.id ?? ""), workspaceId: ctx.workspaceId } });
  if (!handoff) return NextResponse.json({ error: "Handoff not found." }, { status: 404 });
  const resolved = body.status === "resolved";
  const assigned = body.assignedMemberId ? await validWorkspaceMember(ctx.workspaceId, body.assignedMemberId) : null;
  if (body.assignedMemberId && !assigned) return NextResponse.json({ error: "Assignee is not in this workspace." }, { status: 400 });
  const updated = await prisma.aiHandoff.update({ where: { id: handoff.id }, data: { ...(body.assignedMemberId !== undefined ? { assignedMemberId: assigned?.id ?? null } : {}), ...(resolved ? { status: "resolved", resolvedAt: new Date(), resolvedByMemberId: ctx.memberId } : {}) } });
  await prisma.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: handoff.conversationId, actorMemberId: ctx.memberId, type: resolved ? "human_handoff_resolved" : "human_handoff_updated", metadata: { handoffId: handoff.id } } });
  return NextResponse.json({ success: true, handoff: updated });
}
