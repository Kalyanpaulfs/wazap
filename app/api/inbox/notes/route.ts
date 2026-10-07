import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessibleConversation, cleanInboxText, currentInboxContext } from "@/lib/inbox";

export async function POST(req: Request) {
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const conversation = await accessibleConversation(ctx.workspaceId, String(body.conversationId ?? ""));
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const note = cleanInboxText(body.body, 2000);
  if (!note) return NextResponse.json({ error: "Note is required." }, { status: 400 });
  const created = await prisma.$transaction(async (tx) => {
    const item = await tx.inboxNote.create({ data: { conversationId: conversation.id, authorMemberId: ctx.memberId, body: note } });
    await tx.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: conversation.id, actorMemberId: ctx.memberId, type: "note_added" } });
    return item;
  });
  return NextResponse.json(created, { status: 201 });
}
