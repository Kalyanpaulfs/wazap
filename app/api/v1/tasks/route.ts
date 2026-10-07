import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApi, beginApiMutation, enqueueWebhookEvent, finishApiMutation, logApiRequest, replayApiMutation } from "@/lib/developer-platform";
import { cleanInboxText } from "@/lib/inbox";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}
function cleanDate(value: unknown) {
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "tasks:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, url = new URL(req.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 25, 100));
  const after = url.searchParams.get("after"), status = url.searchParams.get("status");
  const items = await prisma.inboxTask.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null, ...(["open", "completed"].includes(status || "") ? { status: status! } : {}) },
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    include: { assignedMember: { select: { id: true, role: true, user: { select: { id: true, name: true } } } } },
  });
  const hasMore = items.length > limit, data = items.slice(0, limit);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data, meta: { hasMore, nextCursor: hasMore ? data.at(-1)?.id : null, requestId: ctx.requestId } });
}

export async function POST(req: Request) {
  const auth = await authenticateApi(req, "tasks:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, body = await req.json().catch(() => ({}));
  const title = cleanInboxText(body.title, 180), priority = ["low", "normal", "high", "urgent"].includes(body.priority) ? body.priority : "normal";
  const dueAt = body.dueAt === undefined ? null : cleanDate(body.dueAt);
  if (!title || dueAt === undefined) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", !title ? "title is required." : "dueAt must be a valid date or null.", ctx.requestId);
  }
  const [conversation, assigned] = await Promise.all([
    body.conversationId ? prisma.inboxConversation.findFirst({ where: { id: String(body.conversationId), workspaceId: ctx.workspaceId }, select: { id: true } }) : null,
    body.assignedMemberId ? prisma.workspaceMember.findFirst({ where: { id: String(body.assignedMemberId), workspaceId: ctx.workspaceId }, select: { id: true } }) : null,
  ]);
  if (body.conversationId && !conversation) {
    await logApiRequest(ctx, req, 400, "invalid_conversation");
    return error(400, "invalid_conversation", "conversationId is not in this workspace.", ctx.requestId);
  }
  if (body.assignedMemberId && !assigned) {
    await logApiRequest(ctx, req, 400, "invalid_assignee");
    return error(400, "invalid_assignee", "assignedMemberId is not in this workspace.", ctx.requestId);
  }
  const mutation = await beginApiMutation(req, ctx, body);
  if (mutation.state === "error") {
    await logApiRequest(ctx, req, mutation.status, mutation.code);
    return error(mutation.status, mutation.code, mutation.message, ctx.requestId);
  }
  if (mutation.state === "replay") {
    await logApiRequest(ctx, req, mutation.statusCode, "idempotent_replay");
    return NextResponse.json(replayApiMutation(mutation, ctx.requestId), { status: mutation.statusCode });
  }
  const task = await prisma.inboxTask.create({
    data: { workspaceId: ctx.workspaceId, conversationId: conversation?.id, title, priority, dueAt, assignedMemberId: assigned?.id, createdByMemberId: null },
  });
  await enqueueWebhookEvent(ctx.workspaceId, "task.created", { taskId: task.id, conversationId: task.conversationId, source: "api" });
  const response = { data: task, meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 201, response);
  await logApiRequest(ctx, req, 201);
  return NextResponse.json(response, { status: 201 });
}
