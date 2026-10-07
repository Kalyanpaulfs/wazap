import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanContactAddress, cleanInboxText } from "@/lib/inbox";
import {
  authenticateApi, beginApiMutation, enqueueWebhookEvent, finishApiMutation,
  logApiRequest, replayApiMutation,
} from "@/lib/developer-platform";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}
const safeConsent = (item: { id: string; contactAddress: string; status: string; source: string; capturedAt: Date; optedOutAt: Date | null; expiresAt: Date | null; createdAt: Date; updatedAt: Date }) => item;

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "whatsapp:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context; const url = new URL(req.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 25, 100));
  const after = url.searchParams.get("after");
  const status = url.searchParams.get("status");
  const items = await prisma.whatsAppConsent.findMany({
    where: { workspaceId: ctx.workspaceId, ...(status === "opted_in" || status === "opted_out" ? { status } : {}) },
    orderBy: { id: "asc" }, take: limit + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    select: { id: true, contactAddress: true, status: true, source: true, capturedAt: true, optedOutAt: true, expiresAt: true, createdAt: true, updatedAt: true },
  });
  const hasMore = items.length > limit; const data = items.slice(0, limit).map(safeConsent);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data, meta: { hasMore, nextCursor: hasMore ? data.at(-1)?.id : null, requestId: ctx.requestId } });
}

export async function POST(req: Request) {
  const auth = await authenticateApi(req, "whatsapp:write");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context; const body = await req.json().catch(() => ({}));
  const contactAddress = cleanContactAddress(body.contactAddress);
  const status = body.status === "opted_out" ? "opted_out" : body.status === "opted_in" ? "opted_in" : "";
  const source = cleanInboxText(body.source, 80);
  const proof = cleanInboxText(body.proof, 500);
  const expiresAt = body.expiresAt ? new Date(String(body.expiresAt)) : null;
  if (contactAddress.length < 7 || !status || !source || (status === "opted_in" && !proof)) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "A valid international number, status, source, and proof for opt-in are required.", ctx.requestId);
  }
  if (expiresAt && (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 2 * 365 * 86_400_000)) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "expiresAt must be in the future and no more than two years away.", ctx.requestId);
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
  const consent = await prisma.whatsAppConsent.upsert({
    where: { workspaceId_contactAddress: { workspaceId: ctx.workspaceId, contactAddress } },
    create: { workspaceId: ctx.workspaceId, contactAddress, status, source, proof: proof || null, expiresAt: status === "opted_in" ? expiresAt : null, optedOutAt: status === "opted_out" ? new Date() : null },
    update: { status, source, proof: proof || null, expiresAt: status === "opted_in" ? expiresAt : null, capturedAt: status === "opted_in" ? new Date() : undefined, optedOutAt: status === "opted_out" ? new Date() : null },
    select: { id: true, contactAddress: true, status: true, source: true, capturedAt: true, optedOutAt: true, expiresAt: true, createdAt: true, updatedAt: true },
  });
  await enqueueWebhookEvent(ctx.workspaceId, "whatsapp.consent_updated", { consentId: consent.id, contactAddress, status, source, sourceType: "api" });
  const response = { data: safeConsent(consent), meta: { requestId: ctx.requestId, replayed: false } };
  await finishApiMutation(mutation.keyHash, 200, response);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json(response);
}
