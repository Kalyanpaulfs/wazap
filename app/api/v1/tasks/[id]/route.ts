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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "tasks:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, { id } = await params;
  const task = await prisma.inboxTask.findFirst({
    where: { id, workspaceId: ctx.workspaceId, archivedAt: null },
    include: { assignedMember: { select: { id: true, role: true, user: { select: { id: true, name: true } } } } },
  });
  if (!task) {
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Task not found.", ctx.requestId);
  }
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data: task, meta: { requestId: ctx.requestId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "tasks:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, { id } = await params;
  const task = await prisma.inboxTask.findFirst({ where: { id, workspaceId: ctx.workspaceId, archivedAt: null } });
  if (!task) {
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Task not found.", ctx.requestId);
  }
  const body = await req.json().catch(() => ({}));
  const status = ["open", "completed"].includes(body.status) ? body.status as "open" | "completed" : undefined;
  const priority = ["low", "normal", "high", "urgent"].includes(body.priority) ? body.priority : undefined;
  const dueAt = body.dueAt === undefined ? undefined : cleanDate(body.dueAt);
  if (body.title !== undefined && !cleanInboxText(body.title, 180)) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "title cannot be empty.", ctx.requestId);
  }
  if (body.dueAt !== undefined && dueAt === undefined) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "dueAt must be a valid date or null.", ctx.requestId);
  }
  const assigned = body.assignedMemberId
    ? await prisma.workspaceMember.findFirst({ where: { id: String(body.assignedMemberId), workspaceId: ctx.workspaceId }, select: { id: true } })
    : null;
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
  const updated = await prisma.inboxTask.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: cleanInboxText(body.title, 180) } : {}),
      ...(status ? { status, completedAt: status === "completed" ? new Date() : null } : {}),
      ...(priority ? { priority } : {}),
      ...(body.dueAt !== undefined ? { dueAt } : {}),
      ...(body.assignedMemberId !== undefined ? { assignedMemberId: assigned?.id ?? null } : {}),
    },
  });
  await enqueueWebhookEvent(ctx.workspaceId, "task.updated", { taskId: updated.id, status: updated.status, source: "api" });
  const response = { data: updated, meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "tasks:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, { id } = await params, archivedAt = new Date();
  const mutation = await beginApiMutation(req, ctx, {});
  if (mutation.state === "error") {
    await logApiRequest(ctx, req, mutation.status, mutation.code);
    return error(mutation.status, mutation.code, mutation.message, ctx.requestId);
  }
  if (mutation.state === "replay") {
    await logApiRequest(ctx, req, mutation.statusCode, "idempotent_replay");
    return NextResponse.json(replayApiMutation(mutation, ctx.requestId), { status: mutation.statusCode });
  }
  const result = await prisma.inboxTask.updateMany({ where: { id, workspaceId: ctx.workspaceId, archivedAt: null }, data: { archivedAt } });
  if (!result.count) {
    await prisma.apiIdempotencyRecord.deleteMany({ where: { keyHash: mutation.keyHash, statusCode: null } });
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Task not found.", ctx.requestId);
  }
  await enqueueWebhookEvent(ctx.workspaceId, "task.archived", { taskId: id, archivedAt, source: "api" });
  const response = { data: { id, archivedAt }, meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}
