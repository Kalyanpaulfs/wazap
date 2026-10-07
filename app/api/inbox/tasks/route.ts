import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessibleConversation, cleanInboxText, currentInboxContext, validWorkspaceMember } from "@/lib/inbox";

function cleanDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: Request) {
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const conversation = body.conversationId ? await accessibleConversation(ctx.workspaceId, String(body.conversationId)) : null;
  if (body.conversationId && !conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const title = cleanInboxText(body.title, 180);
  if (!title) return NextResponse.json({ error: "Task title is required." }, { status: 400 });
  const assigned = body.assignedMemberId ? await validWorkspaceMember(ctx.workspaceId, body.assignedMemberId) : null;
  if (body.assignedMemberId && !assigned) return NextResponse.json({ error: "Assignee is not in this workspace." }, { status: 400 });
  const task = await prisma.inboxTask.create({ data: { workspaceId: ctx.workspaceId, conversationId: conversation?.id, title, priority: ["low", "normal", "high", "urgent"].includes(body.priority) ? body.priority : "normal", dueAt: cleanDate(body.dueAt), assignedMemberId: assigned?.id ?? ctx.memberId, createdByMemberId: ctx.memberId } });
  if (conversation) await prisma.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: conversation.id, actorMemberId: ctx.memberId, type: "task_created", metadata: { taskId: task.id } } });
  return NextResponse.json(task, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const task = await prisma.inboxTask.findFirst({ where: { id: String(body.id ?? ""), workspaceId: ctx.workspaceId, archivedAt: null } });
  if (!task) return NextResponse.json({ error: "Task not found." }, { status: 404 });
  const status = body.status === "completed" ? "completed" : body.status === "open" ? "open" : undefined;
  const assigned = body.assignedMemberId ? await validWorkspaceMember(ctx.workspaceId, body.assignedMemberId) : null;
  if (body.assignedMemberId && !assigned) return NextResponse.json({ error: "Assignee is not in this workspace." }, { status: 400 });
  const updated = await prisma.inboxTask.update({ where: { id: task.id }, data: { ...(status ? { status, completedAt: status === "completed" ? new Date() : null } : {}), ...(body.assignedMemberId !== undefined ? { assignedMemberId: assigned?.id ?? null } : {}), ...(body.dueAt !== undefined ? { dueAt: cleanDate(body.dueAt) } : {}) } });
  return NextResponse.json({ success: true, task: updated });
}
