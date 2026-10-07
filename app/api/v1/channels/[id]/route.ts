import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicChannel } from "@/lib/channels";
import {
  abandonApiMutation, authenticateApi, beginApiMutation, enqueueWebhookEvent,
  finishApiMutation, logApiRequest, replayApiMutation,
} from "@/lib/developer-platform";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "channels:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context; const { id } = await params;
  const connection = await prisma.channelConnection.findFirst({
    where: { id, workspaceId: ctx.workspaceId, status: { not: "disabled" } },
    include: { _count: { select: { conversations: true, events: true } } },
  });
  if (!connection) {
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Channel connection not found.", ctx.requestId);
  }
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data: { ...publicChannel(connection), counts: connection._count }, meta: { requestId: ctx.requestId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "channels:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context; const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const requested = String(body.status || "");
  if (!["paused", "active"].includes(requested)) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "status must be paused or active.", ctx.requestId);
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
  const existing = await prisma.channelConnection.findFirst({ where: { id, workspaceId: ctx.workspaceId, status: { not: "disabled" } } });
  if (!existing) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Channel connection not found.", ctx.requestId);
  }
  const status = requested === "paused" && existing.status === "active" ? "paused" : requested === "active" && existing.status === "paused" ? "active" : null;
  if (!status) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 409, "invalid_state");
    return error(409, "invalid_state", "Only verified active connections can be paused, and only paused connections can be resumed.", ctx.requestId);
  }
  const connection = await prisma.channelConnection.update({ where: { id }, data: { status } });
  const eventType = status === "paused" ? "channel.paused" : "channel.resumed";
  await enqueueWebhookEvent(ctx.workspaceId, eventType, { connectionId: id, channel: connection.channel, provider: connection.provider, status, source: "api" });
  const response = { data: publicChannel(connection), meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "channels:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context; const { id } = await params;
  const mutation = await beginApiMutation(req, ctx, {});
  if (mutation.state === "error") {
    await logApiRequest(ctx, req, mutation.status, mutation.code);
    return error(mutation.status, mutation.code, mutation.message, ctx.requestId);
  }
  if (mutation.state === "replay") {
    await logApiRequest(ctx, req, mutation.statusCode, "idempotent_replay");
    return NextResponse.json(replayApiMutation(mutation, ctx.requestId), { status: mutation.statusCode });
  }
  const existing = await prisma.channelConnection.findFirst({ where: { id, workspaceId: ctx.workspaceId, status: { not: "disabled" } } });
  if (!existing) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Channel connection not found.", ctx.requestId);
  }
  await prisma.channelConnection.update({ where: { id }, data: { status: "disabled", lastError: "Disabled through the Wazap API." } });
  await enqueueWebhookEvent(ctx.workspaceId, "channel.disabled", { connectionId: id, channel: existing.channel, provider: existing.provider, source: "api" });
  const response = { data: { id, status: "disabled", retainedHistory: true }, meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}
