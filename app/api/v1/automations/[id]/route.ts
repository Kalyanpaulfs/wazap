import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  authenticateApi,
  beginApiMutation,
  enqueueWebhookEvent,
  finishApiMutation,
  logApiRequest,
  replayApiMutation,
} from "@/lib/developer-platform";
import { AUTOMATION_TRIGGERS, cleanActions, cleanConditions } from "@/lib/automations";
import { cleanInboxText } from "@/lib/inbox";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "automations:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, { id } = await params;
  const rule = await prisma.automationRule.findFirst({
    where: { id, workspaceId: ctx.workspaceId, archivedAt: null },
    include: { runs: { orderBy: { startedAt: "desc" }, take: 50 } },
  });
  if (!rule) {
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Automation not found.", ctx.requestId);
  }
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data: rule, meta: { requestId: ctx.requestId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "automations:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, { id } = await params;
  const existing = await prisma.automationRule.findFirst({ where: { id, workspaceId: ctx.workspaceId, archivedAt: null } });
  if (!existing) {
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Automation not found.", ctx.requestId);
  }
  const body = await req.json().catch(() => ({}));
  if (body.status === "active" || body.runMode === "live") {
    await logApiRequest(ctx, req, 409, "human_approval_required");
    return error(409, "human_approval_required", "API keys cannot activate live automation. A workspace owner or admin must approve it in Wazap.", ctx.requestId);
  }
  const name = body.name === undefined ? undefined : cleanInboxText(body.name, 100);
  const trigger = body.trigger === undefined ? undefined : AUTOMATION_TRIGGERS.includes(body.trigger) ? body.trigger : "";
  const actions = body.actions === undefined ? undefined : cleanActions(body.actions);
  if (name === "" || trigger === "" || actions?.length === 0) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "name, trigger, and actions must remain valid.", ctx.requestId);
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
  const updated = await prisma.automationRule.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(trigger !== undefined ? { trigger } : {}),
      ...(actions !== undefined ? { actions } : {}),
      ...(body.conditions !== undefined ? { conditions: cleanConditions(body.conditions) } : {}),
      ...(body.status === "paused" || body.status === "draft" ? { status: body.status } : {}),
      runMode: "dry_run",
    },
  });
  await enqueueWebhookEvent(ctx.workspaceId, "automation.updated", { automationId: updated.id, trigger: updated.trigger, status: updated.status, source: "api" });
  const response = { data: updated, meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "automations:write");
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
  const result = await prisma.automationRule.updateMany({
    where: { id, workspaceId: ctx.workspaceId, archivedAt: null },
    data: { archivedAt, status: "paused", runMode: "dry_run" },
  });
  if (!result.count) {
    await prisma.apiIdempotencyRecord.deleteMany({ where: { keyHash: mutation.keyHash, statusCode: null } });
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Automation not found.", ctx.requestId);
  }
  await enqueueWebhookEvent(ctx.workspaceId, "automation.archived", { automationId: id, archivedAt, source: "api" });
  const response = { data: { id, archivedAt }, meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}
