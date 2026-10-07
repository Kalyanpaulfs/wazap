import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AI_AGENT_ROLES,
  cleanStringList,
} from "@/lib/ai-agents";
import {
  authenticateApi,
  abandonApiMutation,
  beginApiMutation,
  enqueueWebhookEvent,
  finishApiMutation,
  logApiRequest,
  replayApiMutation,
} from "@/lib/developer-platform";
import { cleanInboxText } from "@/lib/inbox";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json(
    { error: { code, message }, meta: requestId ? { requestId } : undefined },
    { status },
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApi(req, "agents:read");
  if (!auth.context)
    return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const { id } = await params;
  const agent = await prisma.aiAgent.findFirst({
    where: { id, workspaceId: ctx.workspaceId, archivedAt: null },
    include: {
      runs: { orderBy: { createdAt: "desc" }, take: 50 },
      handoffs: { orderBy: { createdAt: "desc" }, take: 50 },
      _count: { select: { drafts: true } },
    },
  });
  if (!agent) {
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Agent not found.", ctx.requestId);
  }
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({
    data: agent,
    meta: { requestId: ctx.requestId },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApi(req, "agents:write");
  if (!auth.context)
    return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const { id } = await params;
  const existing = await prisma.aiAgent.findFirst({
    where: { id, workspaceId: ctx.workspaceId, archivedAt: null },
  });
  if (!existing) {
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Agent not found.", ctx.requestId);
  }
  const body = await req.json().catch(() => ({}));
  if (body.status === "active" || body.responseMode === "autonomous") {
    await logApiRequest(ctx, req, 409, "human_approval_required");
    return error(
      409,
      "human_approval_required",
      "API keys cannot activate agents or autonomous sending. A workspace owner or admin must approve the agent in Wazap.",
      ctx.requestId,
    );
  }
  const name =
    body.name === undefined ? undefined : cleanInboxText(body.name, 80);
  const instructions =
    body.instructions === undefined
      ? undefined
      : cleanInboxText(body.instructions, 6000);
  const roleType =
    body.roleType === undefined
      ? undefined
      : AI_AGENT_ROLES.includes(body.roleType)
        ? body.roleType
        : "";
  if (
    name === "" ||
    (instructions !== undefined && instructions.length < 20) ||
    roleType === ""
  ) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(
      400,
      "validation_error",
      "name, roleType, and instructions must remain valid.",
      ctx.requestId,
    );
  }
  if (name && name !== existing.name) {
    const duplicate = await prisma.aiAgent.findFirst({
      where: { workspaceId: ctx.workspaceId, name, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      await logApiRequest(ctx, req, 409, "name_conflict");
      return error(
        409,
        "name_conflict",
        "Another agent already uses this name.",
        ctx.requestId,
      );
    }
  }
  const mutation = await beginApiMutation(req, ctx, body);
  if (mutation.state === "error") {
    await logApiRequest(ctx, req, mutation.status, mutation.code);
    return error(
      mutation.status,
      mutation.code,
      mutation.message,
      ctx.requestId,
    );
  }
  if (mutation.state === "replay") {
    await logApiRequest(
      ctx,
      req,
      mutation.statusCode,
      "idempotent_replay",
    );
    return NextResponse.json(replayApiMutation(mutation, ctx.requestId), {
      status: mutation.statusCode,
    });
  }
  const updated = await prisma.aiAgent.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(instructions !== undefined ? { instructions } : {}),
      ...(roleType !== undefined ? { roleType } : {}),
      ...(body.status === "draft" || body.status === "paused"
        ? { status: body.status }
        : {}),
      ...(body.responseMode === "draft_only" ||
      body.responseMode === "approval_required"
        ? { responseMode: body.responseMode }
        : {}),
      ...(body.tone !== undefined
        ? { tone: cleanInboxText(body.tone, 40) || "professional" }
        : {}),
      ...(body.language !== undefined
        ? { language: cleanInboxText(body.language, 20) || "auto" }
        : {}),
      ...(body.allowedTopics !== undefined
        ? { allowedTopics: cleanStringList(body.allowedTopics) }
        : {}),
      ...(body.prohibitedTopics !== undefined
        ? { prohibitedTopics: cleanStringList(body.prohibitedTopics) }
        : {}),
      ...(body.escalationKeywords !== undefined
        ? { escalationKeywords: cleanStringList(body.escalationKeywords) }
        : {}),
      ...(body.requireHumanFor !== undefined
        ? { requireHumanFor: cleanStringList(body.requireHumanFor) }
        : {}),
      ...(body.maxMessagesPerThread !== undefined
        ? {
            maxMessagesPerThread: Math.max(
              1,
              Math.min(Number(body.maxMessagesPerThread) || 5, 20),
            ),
          }
        : {}),
    },
  });
  await enqueueWebhookEvent(ctx.workspaceId, "agent.updated", {
    agentId: updated.id,
    roleType: updated.roleType,
    responseMode: updated.responseMode,
    status: updated.status,
    source: "api",
  });
  const response = {
    data: updated,
    meta: { requestId: ctx.requestId, replayed: false },
  };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApi(req, "agents:write");
  if (!auth.context)
    return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const { id } = await params;
  const mutation = await beginApiMutation(req, ctx, {});
  if (mutation.state === "error") {
    await logApiRequest(ctx, req, mutation.status, mutation.code);
    return error(
      mutation.status,
      mutation.code,
      mutation.message,
      ctx.requestId,
    );
  }
  if (mutation.state === "replay") {
    await logApiRequest(
      ctx,
      req,
      mutation.statusCode,
      "idempotent_replay",
    );
    return NextResponse.json(replayApiMutation(mutation, ctx.requestId), {
      status: mutation.statusCode,
    });
  }
  const existing = await prisma.aiAgent.findFirst({
    where: { id, workspaceId: ctx.workspaceId, archivedAt: null },
    select: { id: true },
  });
  if (!existing) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 404, "not_found");
    return error(404, "not_found", "Agent not found.", ctx.requestId);
  }
  const activeInstall = await prisma.marketplaceInstall.findFirst({
    where: {
      workspaceId: ctx.workspaceId,
      installedAgentId: id,
      status: "active",
    },
    select: { id: true },
  });
  if (activeInstall) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 409, "marketplace_install_active");
    return error(
      409,
      "marketplace_install_active",
      "Uninstall the active marketplace package before archiving this agent.",
      ctx.requestId,
    );
  }
  const archivedAt = new Date();
  await prisma.aiAgent.update({
    where: { id },
    data: {
      archivedAt,
      status: "paused",
      responseMode: "draft_only",
    },
  });
  await enqueueWebhookEvent(ctx.workspaceId, "agent.archived", {
    agentId: id,
    archivedAt,
    source: "api",
  });
  const response = {
    data: { id, archivedAt },
    meta: { requestId: ctx.requestId, replayed: false },
  };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}
