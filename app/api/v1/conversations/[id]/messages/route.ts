import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { apiRequestHash, authenticateApi, enqueueWebhookEvent, hashSecret, logApiRequest } from "@/lib/developer-platform";
import { cleanInboxText } from "@/lib/inbox";
import { sendMetaTextMessage } from "@/lib/meta-cloud";

function err(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

function resultMeta(deliveryStatus: string, requestId: string, replayed = false) {
  return {
    requestId,
    replayed,
    transmitted: ["accepted", "sent", "delivered", "read"].includes(deliveryStatus),
    queuedForBridge: deliveryStatus === "queued",
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApi(req, "messages:write");
  if (!auth.context) return err(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context, { id } = await params;
  const idempotencyKey = cleanInboxText(req.headers.get("idempotency-key"), 200);
  if (idempotencyKey.length < 8) {
    await logApiRequest(ctx, req, 400, "idempotency_key_required");
    return err(400, "idempotency_key_required", "Provide a stable Idempotency-Key header of at least 8 characters.", ctx.requestId);
  }
  const idempotencyKeyHash = hashSecret(`${ctx.workspaceId}:${new URL(req.url).pathname}:${idempotencyKey}`);
  const body = await req.json().catch(() => ({}));
  const requestHash = apiRequestHash(body);
  const replay = await prisma.inboxMessage.findUnique({ where: { idempotencyKeyHash } });
  if (replay) {
    if (!replay.idempotencyRequestHash || replay.idempotencyRequestHash !== requestHash) {
      await logApiRequest(ctx, req, 409, "idempotency_conflict");
      return err(409, "idempotency_conflict", "This Idempotency-Key was already used with a different or unverifiable request body.", ctx.requestId);
    }
    const status = replay.deliveryStatus === "failed" ? 409 : 200;
    await logApiRequest(ctx, req, status, "idempotent_replay");
    if (status === 409) return err(409, "previous_attempt_failed", "The original provider attempt failed and was not repeated. Use a new Idempotency-Key only after reviewing the failure.", ctx.requestId);
    return NextResponse.json({ data: replay, meta: resultMeta(replay.deliveryStatus, ctx.requestId, true) });
  }
  const conversation = await prisma.inboxConversation.findFirst({ where: { id, workspaceId: ctx.workspaceId } });
  if (!conversation) {
    await logApiRequest(ctx, req, 404, "not_found");
    return err(404, "not_found", "Conversation not found.", ctx.requestId);
  }
  const text = cleanInboxText(body.text, 4000), direction = body.direction === "inbound" ? "inbound" : "outbound";
  if (!text) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return err(400, "validation_error", "text is required.", ctx.requestId);
  }
  const connection = direction === "outbound" && conversation.channelConnectionId
    ? await prisma.channelConnection.findFirst({ where: { id: conversation.channelConnectionId, workspaceId: ctx.workspaceId, status: "active", capabilities: { has: "send" } } })
    : null;
  const metaConnection = connection?.provider === "meta_cloud" && connection.accessTokenEncrypted ? connection : null;
  const queuedForBridge = Boolean(connection && !metaConnection && connection.capabilities.includes("delivery_receipts"));
  const now = new Date();
  let message;
  try {
    message = await prisma.$transaction(async (tx) => {
      const created = await tx.inboxMessage.create({ data: {
        conversationId: id,
        direction,
        senderType: direction === "inbound" ? "customer" : "system",
        idempotencyKeyHash,
        idempotencyRequestHash: requestHash,
        text,
        deliveryStatus: direction === "inbound" ? "received" : metaConnection || queuedForBridge ? "queued" : "recorded",
        sentAt: now,
      } });
      await tx.inboxConversation.update({ where: { id }, data: {
        lastMessageAt: now,
        lastMessagePreview: text.slice(0, 180),
        status: "open",
        resolvedAt: null,
        ...(direction === "inbound" ? { unreadCount: { increment: 1 } } : { firstResponseAt: conversation.firstResponseAt ?? now }),
      } });
      await tx.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: id, type: direction === "outbound" ? "api_outbound_recorded" : "api_inbound_recorded", metadata: { deliveryStatus: created.deliveryStatus, apiKeyId: ctx.apiKeyId } } });
      return created;
    });
  } catch {
    const concurrent = await prisma.inboxMessage.findUnique({ where: { idempotencyKeyHash } });
    if (concurrent) {
      if (concurrent.idempotencyRequestHash !== requestHash) {
        await logApiRequest(ctx, req, 409, "idempotency_conflict");
        return err(409, "idempotency_conflict", "This Idempotency-Key was concurrently used with a different request body.", ctx.requestId);
      }
      await logApiRequest(ctx, req, 200, "idempotent_replay");
      return NextResponse.json({ data: concurrent, meta: resultMeta(concurrent.deliveryStatus, ctx.requestId, true) });
    }
    await logApiRequest(ctx, req, 500, "persistence_failed");
    return err(500, "persistence_failed", "The message could not be recorded.", ctx.requestId);
  }
  if (direction === "outbound" && metaConnection) {
    const cfg = metaConnection.config && typeof metaConnection.config === "object" ? metaConnection.config as Record<string, unknown> : {};
    try {
      const provider = await sendMetaTextMessage(metaConnection.accessTokenEncrypted!, String(cfg.phoneNumberId || metaConnection.externalAccountId || ""), conversation.contactAddress, text);
      const providerMessageId = String(provider?.messages?.[0]?.id || "").slice(0, 200);
      if (!providerMessageId) throw new Error("Meta accepted the request without returning a message ID.");
      message = await prisma.inboxMessage.update({ where: { id: message.id }, data: { providerMessageId, deliveryStatus: "accepted" } });
      await prisma.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: id, type: "api_meta_message_accepted", metadata: { messageId: message.id, providerMessageId, apiKeyId: ctx.apiKeyId } } });
      await prisma.channelConnection.update({ where: { id: metaConnection.id }, data: { lastError: null } });
      await enqueueWebhookEvent(ctx.workspaceId, "message.accepted", { conversationId: id, messageId: message.id, providerMessageId, source: "api" });
      await logApiRequest(ctx, req, 201);
      return NextResponse.json({ data: message, meta: resultMeta(message.deliveryStatus, ctx.requestId), notice: "Meta accepted the message. Delivery state will update from signed provider receipts." }, { status: 201 });
    } catch (error) {
      const detail = error instanceof Error ? error.message.slice(0, 500) : "Meta delivery failed.";
      message = await prisma.inboxMessage.update({ where: { id: message.id }, data: { deliveryStatus: "failed" } });
      await prisma.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: id, type: "api_meta_message_failed", metadata: { messageId: message.id, error: detail, apiKeyId: ctx.apiKeyId } } });
      await prisma.channelConnection.update({ where: { id: metaConnection.id }, data: { lastError: detail } });
      await enqueueWebhookEvent(ctx.workspaceId, "message.failed", { conversationId: id, messageId: message.id, error: detail, source: "api" });
      await logApiRequest(ctx, req, 502, "provider_rejected");
      return NextResponse.json({ error: { code: "provider_rejected", message: "Meta did not accept the message.", detail }, data: message, meta: resultMeta(message.deliveryStatus, ctx.requestId) }, { status: 502 });
    }
  }
  await enqueueWebhookEvent(ctx.workspaceId, "message.recorded", { conversationId: id, messageId: message.id, direction, deliveryStatus: message.deliveryStatus, source: "api" });
  await logApiRequest(ctx, req, 201);
  const notice = direction === "outbound"
    ? queuedForBridge ? "Message queued for the verified provider bridge. It is not marked sent until a signed receipt arrives." : "Message recorded because this conversation has no verified outbound transport."
    : undefined;
  return NextResponse.json({ data: message, meta: resultMeta(message.deliveryStatus, ctx.requestId), notice }, { status: 201 });
}
