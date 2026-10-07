import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  CHANNEL_LIMITS,
  CHANNEL_TYPES,
  createChannelCredential,
  publicChannel,
} from "@/lib/channels";
import {
  abandonApiMutation,
  authenticateApi,
  beginApiMutation,
  enqueueWebhookEvent,
  finishApiMutation,
  logApiRequest,
  replayApiMutation,
} from "@/lib/developer-platform";
import { effectivePlan } from "@/lib/entitlements";
import { cleanInboxText } from "@/lib/inbox";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "channels:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 25, 100));
  const after = url.searchParams.get("after");
  const items = await prisma.channelConnection.findMany({
    where: { workspaceId: ctx.workspaceId, status: { not: "disabled" } },
    orderBy: { id: "asc" },
    take: limit + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
  });
  const hasMore = items.length > limit;
  const data = items.slice(0, limit).map(publicChannel);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data, meta: { hasMore, nextCursor: hasMore ? data.at(-1)?.id : null, requestId: ctx.requestId } });
}

export async function POST(req: Request) {
  const auth = await authenticateApi(req, "channels:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const body = await req.json().catch(() => ({}));
  const channel = CHANNEL_TYPES.includes(body.channel) ? body.channel : "";
  const displayName = cleanInboxText(body.displayName, 80);
  const externalAccountId = cleanInboxText(body.externalAccountId, 120) || null;
  if (!channel || !displayName) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "A supported channel and displayName are required.", ctx.requestId);
  }
  if (body.provider && body.provider !== "custom_bridge") {
    await logApiRequest(ctx, req, 409, "provider_managed_in_wazap");
    return error(409, "provider_managed_in_wazap", "Provider-managed credentials must be connected by an owner or admin in Wazap.", ctx.requestId);
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
  const workspace = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: { owner: { select: { plan: true, trialPlan: true, trialEndsAt: true } } },
  });
  if (!workspace) {
    await abandonApiMutation(mutation.keyHash);
    return error(404, "workspace_not_found", "Workspace not found.", ctx.requestId);
  }
  const plan = effectivePlan(workspace.owner);
  const planLimit = CHANNEL_LIMITS[plan] ?? 1;
  const count = await prisma.channelConnection.count({ where: { workspaceId: ctx.workspaceId, status: { not: "disabled" } } });
  if (count >= planLimit) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 403, "plan_limit");
    return error(403, "plan_limit", `The ${plan} plan supports ${planLimit} channel connection${planLimit === 1 ? "" : "s"}.`, ctx.requestId);
  }
  const credential = createChannelCredential();
  const connection = await prisma.channelConnection.create({
    data: {
      workspaceId: ctx.workspaceId,
      channel,
      displayName,
      provider: "custom_bridge",
      externalAccountId,
      capabilities: ["receive"],
      signingSecretEncrypted: credential.encrypted,
      secretPrefix: credential.prefix,
      webhookPathToken: credential.pathToken,
      config: { retention: "normalized_only", outbound: false },
    },
  });
  const data = publicChannel(connection);
  await enqueueWebhookEvent(ctx.workspaceId, "channel.created", {
    connectionId: connection.id, channel, provider: connection.provider, status: connection.status, source: "api",
  });
  const storedResponse = {
    data,
    meta: { requestId: ctx.requestId, replayed: false, secretAvailable: false },
    notice: "The signing secret was issued only in the original response. Rotate credentials if it was not saved.",
  };
  await finishApiMutation(mutation.keyHash, 201, storedResponse);
  await logApiRequest(ctx, req, 201);
  return NextResponse.json({
    data,
    signingSecret: credential.secret,
    meta: { requestId: ctx.requestId, replayed: false, secretAvailable: true },
    notice: "Copy this signing secret now. Wazap will not store or display it in an API replay.",
  }, { status: 201 });
}
