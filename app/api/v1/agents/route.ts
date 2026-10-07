import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AI_AGENT_LIMITS,
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
import { effectivePlan } from "@/lib/entitlements";
import { cleanInboxText } from "@/lib/inbox";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json(
    { error: { code, message }, meta: requestId ? { requestId } : undefined },
    { status },
  );
}

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "agents:read");
  if (!auth.context)
    return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const url = new URL(req.url);
  const limit = Math.max(
    1,
    Math.min(Number(url.searchParams.get("limit")) || 25, 100),
  );
  const after = url.searchParams.get("after");
  const items = await prisma.aiAgent.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    include: {
      _count: { select: { runs: true, drafts: true, handoffs: true } },
    },
  });
  const hasMore = items.length > limit;
  const data = items.slice(0, limit);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({
    data,
    meta: {
      hasMore,
      nextCursor: hasMore ? data.at(-1)?.id : null,
      requestId: ctx.requestId,
    },
  });
}

export async function POST(req: Request) {
  const auth = await authenticateApi(req, "agents:write");
  if (!auth.context)
    return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const body = await req.json().catch(() => ({}));
  const name = cleanInboxText(body.name, 80);
  const instructions = cleanInboxText(body.instructions, 6000);
  const roleType = AI_AGENT_ROLES.includes(body.roleType)
    ? body.roleType
    : "sales_rep";
  if (!name || instructions.length < 20) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(
      400,
      "validation_error",
      "name and clear instructions of at least 20 characters are required.",
      ctx.requestId,
    );
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
  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: {
      owner: {
        select: { plan: true, trialPlan: true, trialEndsAt: true },
      },
    },
  });
  if (!workspace) {
    await abandonApiMutation(mutation.keyHash);
    return error(
      404,
      "workspace_not_found",
      "Workspace not found.",
      ctx.requestId,
    );
  }
  const plan = effectivePlan(workspace.owner);
  const planLimit = AI_AGENT_LIMITS[plan] ?? 1;
  const count = await prisma.aiAgent.count({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
  });
  if (count >= planLimit) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 403, "plan_limit");
    return error(
      403,
      "plan_limit",
      `The ${plan} plan supports ${planLimit} AI agent profiles.`,
      ctx.requestId,
    );
  }
  const duplicate = await prisma.aiAgent.findFirst({
    where: { workspaceId: ctx.workspaceId, name },
    select: { id: true, archivedAt: true },
  });
  if (duplicate) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 409, "name_conflict");
    return error(
      409,
      "name_conflict",
      duplicate.archivedAt
        ? "This agent name belongs to an archived profile."
        : "An active agent already uses this name.",
      ctx.requestId,
    );
  }
  let agent;
  try {
    agent = await prisma.aiAgent.create({
      data: {
        workspaceId: ctx.workspaceId,
        name,
        roleType,
        instructions,
        status: "draft",
        responseMode:
          body.responseMode === "approval_required"
            ? "approval_required"
            : "draft_only",
        tone: cleanInboxText(body.tone, 40) || "professional",
        language: cleanInboxText(body.language, 20) || "auto",
        allowedTopics: cleanStringList(body.allowedTopics),
        prohibitedTopics: cleanStringList(body.prohibitedTopics),
        escalationKeywords: cleanStringList(body.escalationKeywords),
        requireHumanFor: cleanStringList(body.requireHumanFor),
        maxMessagesPerThread: Math.max(
          1,
          Math.min(Number(body.maxMessagesPerThread) || 5, 20),
        ),
      },
    });
  } catch (cause) {
    await abandonApiMutation(mutation.keyHash);
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      await logApiRequest(ctx, req, 409, "name_conflict");
      return error(
        409,
        "name_conflict",
        "Another agent already uses this name.",
        ctx.requestId,
      );
    }
    throw cause;
  }
  await enqueueWebhookEvent(ctx.workspaceId, "agent.created", {
    agentId: agent.id,
    roleType: agent.roleType,
    responseMode: agent.responseMode,
    status: agent.status,
    source: "api",
  });
  const response = {
    data: agent,
    meta: { requestId: ctx.requestId, replayed: false },
    notice:
      "Agent created as a disabled profile. A workspace owner or admin must activate it in Wazap.",
  };
  await finishApiMutation(mutation.keyHash, 201, response);
  await logApiRequest(ctx, req, 201);
  return NextResponse.json(response, { status: 201 });
}
