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
import { AUTOMATION_LIMITS, AUTOMATION_TRIGGERS, cleanActions, cleanConditions } from "@/lib/automations";
import { effectivePlan } from "@/lib/entitlements";
import { cleanInboxText } from "@/lib/inbox";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "automations:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, url = new URL(req.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 25, 100));
  const after = url.searchParams.get("after");
  const items = await prisma.automationRule.findMany({
    where: { workspaceId: ctx.workspaceId, archivedAt: null },
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit, data = items.slice(0, limit);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data, meta: { hasMore, nextCursor: hasMore ? data.at(-1)?.id : null, requestId: ctx.requestId } });
}

export async function POST(req: Request) {
  const auth = await authenticateApi(req, "automations:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, body = await req.json().catch(() => ({}));
  const name = cleanInboxText(body.name, 100);
  const trigger = AUTOMATION_TRIGGERS.includes(body.trigger) ? body.trigger : "";
  const actions = cleanActions(body.actions);
  if (!name || !trigger || !actions.length) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "name, a supported trigger, and at least one safe action are required.", ctx.requestId);
  }
  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { owner: { select: { plan: true, trialPlan: true, trialEndsAt: true } } },
  });
  if (!workspace) return error(404, "workspace_not_found", "Workspace not found.", ctx.requestId);
  const plan = effectivePlan(workspace.owner);
  const count = await prisma.automationRule.count({ where: { workspaceId: ctx.workspaceId, archivedAt: null } });
  const planLimit = AUTOMATION_LIMITS[plan] || 1;
  if (count >= planLimit) {
    await logApiRequest(ctx, req, 403, "plan_limit");
    return error(403, "plan_limit", `The ${plan} plan supports ${planLimit} automation rules.`, ctx.requestId);
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
  const rule = await prisma.automationRule.create({
    data: {
      workspaceId: ctx.workspaceId,
      createdByMemberId: null,
      name,
      trigger,
      conditions: cleanConditions(body.conditions),
      actions,
      status: "draft",
      runMode: "dry_run",
    },
  });
  await enqueueWebhookEvent(ctx.workspaceId, "automation.created", { automationId: rule.id, trigger: rule.trigger, status: rule.status, source: "api" });
  const response = {
    data: rule,
    meta: { requestId: ctx.requestId, replayed: false },
    notice: "Automation created as a disabled dry run. A workspace owner or admin must activate it.",
  };
  await finishApiMutation(mutation.keyHash, 201, response);
  await logApiRequest(ctx, req, 201);
  return NextResponse.json(response, { status: 201 });
}
