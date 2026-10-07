import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentAiContext } from "@/lib/ai-agents";
import { accessibleConversation, cleanInboxText } from "@/lib/inbox";

export async function POST(req: Request) {
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const [agent, conversation] = await Promise.all([prisma.aiAgent.findFirst({ where: { id: String(body.agentId ?? ""), workspaceId: ctx.workspaceId } }), accessibleConversation(ctx.workspaceId, String(body.conversationId ?? ""))]);
  if (!agent || !conversation) return NextResponse.json({ error: "Agent or conversation not found." }, { status: 404 });
  const content = cleanInboxText(body.content, 4000); if (!content) return NextResponse.json({ error: "Draft content is required." }, { status: 400 });
  const draft = await prisma.$transaction(async (tx) => {
    const run = await tx.aiRun.create({ data: { workspaceId: ctx.workspaceId, agentId: agent.id, conversationId: conversation.id, trigger: "external_draft", status: "completed", model: "external", startedAt: new Date(), completedAt: new Date() } });
    const item = await tx.aiDraft.create({ data: { workspaceId: ctx.workspaceId, agentId: agent.id, runId: run.id, conversationId: conversation.id, content } });
    await tx.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: conversation.id, actorMemberId: ctx.memberId, type: "ai_draft_submitted", metadata: { draftId: item.id, origin: "external" } } });
    return item;
  });
  return NextResponse.json({ draft, generatedByWazap: false, notice: "External draft recorded for human review." }, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await currentAiContext(); if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})); const draft = await prisma.aiDraft.findFirst({ where: { id: String(body.id ?? ""), workspaceId: ctx.workspaceId }, include: { conversation: true } });
  if (!draft) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  if (draft.status !== "pending") return NextResponse.json({ error: "This draft has already been reviewed." }, { status: 409 });
  const action = body.action === "approve" ? "approved" : body.action === "reject" ? "rejected" : null;
  if (!action) return NextResponse.json({ error: "Choose approve or reject." }, { status: 400 });
  await prisma.$transaction(async (tx) => {
    await tx.aiDraft.update({ where: { id: draft.id }, data: { status: action, reviewedByMemberId: ctx.memberId, reviewedAt: new Date(), rejectionReason: action === "rejected" ? cleanInboxText(body.reason, 500) || "Rejected by reviewer" : null } });
    if (action === "approved") {
      await tx.inboxMessage.create({ data: { conversationId: draft.conversationId, direction: "outbound", senderType: "ai", senderMemberId: ctx.memberId, text: draft.content, deliveryStatus: "approved_draft" } });
      await tx.inboxConversation.update({ where: { id: draft.conversationId }, data: { lastMessagePreview: draft.content.slice(0, 180), lastMessageAt: new Date() } });
    }
    await tx.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: draft.conversationId, actorMemberId: ctx.memberId, type: `ai_draft_${action}`, metadata: { draftId: draft.id, transmitted: false } } });
  });
  return NextResponse.json({ success: true, status: action, sent: false, notice: action === "approved" ? "Draft approved and added to the timeline. It was not transmitted to the channel." : "Draft rejected." });
}
