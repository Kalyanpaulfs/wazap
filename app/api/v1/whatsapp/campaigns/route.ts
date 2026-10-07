import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanContactAddress, cleanInboxText } from "@/lib/inbox";
import {
  abandonApiMutation, authenticateApi, beginApiMutation, enqueueWebhookEvent,
  finishApiMutation, logApiRequest, replayApiMutation,
} from "@/lib/developer-platform";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}
const campaignSelect = {
  id: true, connectionId: true, templateId: true, name: true, status: true,
  scheduledFor: true, audienceCount: true, eligibleCount: true, sentCount: true,
  deliveredCount: true, readCount: true, failedCount: true, optOutCount: true,
  lastError: true, startedAt: true, completedAt: true, createdAt: true, updatedAt: true,
} as const;

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "whatsapp:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context; const url = new URL(req.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 25, 100));
  const after = url.searchParams.get("after"); const status = url.searchParams.get("status");
  const items = await prisma.whatsAppCampaign.findMany({
    where: { workspaceId: ctx.workspaceId, ...(status ? { status: status.slice(0, 30) } : {}) },
    orderBy: { id: "asc" }, take: limit + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    select: campaignSelect,
  });
  const hasMore = items.length > limit; const data = items.slice(0, limit);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data, meta: { hasMore, nextCursor: hasMore ? data.at(-1)?.id : null, requestId: ctx.requestId } });
}

export async function POST(req: Request) {
  const auth = await authenticateApi(req, "whatsapp:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context; const body = await req.json().catch(() => ({}));
  if (!ctx.createdByMemberId) {
    await logApiRequest(ctx, req, 409, "key_attribution_required");
    return error(409, "key_attribution_required", "Rotate this legacy API key from the developer console before creating campaigns.", ctx.requestId);
  }
  const name = cleanInboxText(body.name, 120);
  const addresses = Array.from(new Set<string>((Array.isArray(body.audience) ? body.audience : []).map((value: unknown) => cleanContactAddress(value)).filter((value: string) => value.length >= 7))).slice(0, 10_000);
  if (!name || !addresses.length) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "name and an audience of valid international numbers are required.", ctx.requestId);
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
  const connection = await prisma.channelConnection.findFirst({ where: { id: String(body.connectionId || ""), workspaceId: ctx.workspaceId, provider: "meta_cloud", status: "active" } });
  const template = await prisma.whatsAppTemplate.findFirst({ where: { id: String(body.templateId || ""), workspaceId: ctx.workspaceId, connectionId: connection?.id || "", status: "approved" } });
  if (!connection || !template) {
    await abandonApiMutation(mutation.keyHash);
    await logApiRequest(ctx, req, 409, "marketing_assets_unavailable");
    return error(409, "marketing_assets_unavailable", "An active Meta connection and an approved template belonging to that connection are required.", ctx.requestId);
  }
  const eligible = await prisma.whatsAppConsent.count({ where: { workspaceId: ctx.workspaceId, contactAddress: { in: addresses }, status: "opted_in", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
  const campaign = await prisma.whatsAppCampaign.create({
    data: { workspaceId: ctx.workspaceId, connectionId: connection.id, templateId: template.id, createdByMemberId: ctx.createdByMemberId, name, audience: addresses, audienceCount: addresses.length, eligibleCount: eligible, status: "draft" },
    select: campaignSelect,
  });
  await enqueueWebhookEvent(ctx.workspaceId, "whatsapp.campaign_created", { campaignId: campaign.id, connectionId: connection.id, templateId: template.id, audienceCount: addresses.length, eligibleCount: eligible, source: "api" });
  const response = {
    data: campaign,
    meta: { requestId: ctx.requestId, replayed: false },
    excluded: addresses.length - eligible,
    notice: "Draft created. Recipient addresses are never returned by this API. An owner or admin must review and schedule it in Wazap.",
  };
  await finishApiMutation(mutation.keyHash, 201, response);
  await logApiRequest(ctx, req, 201);
  return NextResponse.json(response, { status: 201 });
}
