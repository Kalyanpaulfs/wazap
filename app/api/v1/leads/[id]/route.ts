import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApi, beginApiMutation, enqueueWebhookEvent, finishApiMutation, logApiRequest, replayApiMutation } from "@/lib/developer-platform";
import { cleanContactAddress, cleanInboxText } from "@/lib/inbox";
import { runAutomations } from "@/lib/automations";

const STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}
function cleanDate(value: unknown) {
  if (value === null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : date;
}
function cleanValue(value: unknown) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1_000_000_000) : undefined;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "leads:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, { id } = await params;
  const lead = await prisma.lead.findFirst({
    where: { id, workspaceId: ctx.workspaceId, archivedAt: null },
    include: { activities: { orderBy: { createdAt: "desc" }, take: 100 } },
  });
  if (!lead) {
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Lead not found.", ctx.requestId);
  }
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data: lead, meta: { requestId: ctx.requestId } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "leads:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, { id } = await params;
  const existing = await prisma.lead.findFirst({ where: { id, workspaceId: ctx.workspaceId, archivedAt: null } });
  if (!existing) {
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Lead not found.", ctx.requestId);
  }
  const body = await req.json().catch(() => ({}));
  const status = STATUSES.includes(body.status) ? body.status as typeof STATUSES[number] : undefined;
  const phone = body.phone === undefined ? undefined : cleanContactAddress(body.phone);
  const nextFollowUpAt = body.nextFollowUpAt === undefined ? undefined : cleanDate(body.nextFollowUpAt);
  const estimatedValue = body.estimatedValue === undefined ? undefined : cleanValue(body.estimatedValue);
  if (body.name !== undefined && !cleanInboxText(body.name, 100)) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "name cannot be empty.", ctx.requestId);
  }
  if (phone !== undefined && phone.length < 7) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "phone must be a valid international number.", ctx.requestId);
  }
  if (body.nextFollowUpAt !== undefined && nextFollowUpAt === undefined) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "nextFollowUpAt must be a valid date or null.", ctx.requestId);
  }
  if (body.estimatedValue !== undefined && estimatedValue === undefined) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "estimatedValue must be a non-negative number or null.", ctx.requestId);
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
  const updated = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: cleanInboxText(body.name, 100) } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(body.email !== undefined ? { email: cleanInboxText(body.email, 160) || null } : {}),
        ...(body.source !== undefined ? { source: cleanInboxText(body.source, 80) || "API" } : {}),
        ...(body.campaign !== undefined ? { campaign: cleanInboxText(body.campaign, 100) || null } : {}),
        ...(status ? { status, closedAt: ["won", "lost"].includes(status) ? new Date() : null } : {}),
        ...(body.owner !== undefined ? { owner: cleanInboxText(body.owner, 100) || null } : {}),
        ...(estimatedValue !== undefined ? { estimatedValue } : {}),
        ...(body.currency !== undefined ? { currency: cleanInboxText(body.currency, 3).toUpperCase() || "USD" } : {}),
        ...(nextFollowUpAt !== undefined ? { nextFollowUpAt } : {}),
        ...(body.notes !== undefined ? { notes: cleanInboxText(body.notes, 2000) } : {}),
        ...(body.lostReason !== undefined ? { lostReason: cleanInboxText(body.lostReason, 500) || null } : {}),
      },
    });
    await tx.leadActivity.create({
      data: {
        leadId: id,
        type: status && status !== existing.status ? "status_changed" : "api_updated",
        body: status && status !== existing.status ? `Stage changed from ${existing.status} to ${status} through API` : "Lead updated through Wazap API",
        metadata: { apiKeyId: ctx.apiKeyId },
      },
    });
    return lead;
  });
  await enqueueWebhookEvent(ctx.workspaceId, "lead.updated", { leadId: updated.id, status: updated.status, owner: updated.owner, source: "api" });
  await runAutomations({ workspaceId: ctx.workspaceId, eventKey: `api-lead-updated:${ctx.requestId}`, trigger: "lead.updated", leadId: updated.id, source: updated.source, leadStatus: updated.status });
  const response = { data: updated, meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "leads:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, { id } = await params;
  const archivedAt = new Date();
  const mutation = await beginApiMutation(req, ctx, {});
  if (mutation.state === "error") {
    await logApiRequest(ctx, req, mutation.status, mutation.code);
    return error(mutation.status, mutation.code, mutation.message, ctx.requestId);
  }
  if (mutation.state === "replay") {
    await logApiRequest(ctx, req, mutation.statusCode, "idempotent_replay");
    return NextResponse.json(replayApiMutation(mutation, ctx.requestId), { status: mutation.statusCode });
  }
  const result = await prisma.lead.updateMany({ where: { id, workspaceId: ctx.workspaceId, archivedAt: null }, data: { archivedAt } });
  if (!result.count) {
    await prisma.apiIdempotencyRecord.deleteMany({ where: { keyHash: mutation.keyHash, statusCode: null } });
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Lead not found.", ctx.requestId);
  }
  await enqueueWebhookEvent(ctx.workspaceId, "lead.updated", { leadId: id, archivedAt, source: "api" });
  const response = { data: { id, archivedAt }, meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}
