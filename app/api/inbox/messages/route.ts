import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanInboxText, currentInboxContext } from "@/lib/inbox";
import { rateLimit } from "@/lib/rate-limit";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { sendMetaTextMessage } from "@/lib/meta-cloud";

export async function POST(req: Request) {
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`inbox:message:${ctx.userId}`, 120, 60_000)) return NextResponse.json({ error: "Too many message updates. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const conversation = await prisma.inboxConversation.findFirst({
    where: { id: String(body.conversationId ?? ""), workspaceId: ctx.workspaceId },
    include: { channelConnection: true, messages: { where: { direction: "inbound" }, orderBy: { sentAt: "desc" }, take: 1 } },
  });
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const text = cleanInboxText(body.text, 4000);
  if (!text) return NextResponse.json({ error: "Message text is required." }, { status: 400 });
  const direction = body.direction === "inbound" ? "inbound" : "outbound";
  const now = new Date();
  let providerMessageId: string | null = null;
  let outboundStatus = "recorded";
  if (direction === "outbound") {
    const connection = conversation.channelConnection;
    if (!connection || connection.status !== "active" || !connection.capabilities.includes("send")) return NextResponse.json({ error: `Connect an active ${conversation.channel} account with sending enabled before replying.` }, { status: 409 });
    if (conversation.channel !== "whatsapp" || connection.provider !== "meta_cloud" || !connection.accessTokenEncrypted) return NextResponse.json({ error: `${conversation.channel === "whatsapp" ? "This WhatsApp connection" : "This channel"} does not support outbound sending yet.` }, { status: 409 });
    const lastInboundAt = conversation.messages[0]?.sentAt;
    if (!lastInboundAt || Date.now() - lastInboundAt.getTime() > 24 * 60 * 60 * 1000) return NextResponse.json({ error: "The 24-hour WhatsApp customer-service window is closed. Send a Meta-approved template from WhatsApp Operations to reopen the conversation." }, { status: 409 });
    const config = (connection.config || {}) as Record<string, unknown>;
    const phoneNumberId = String(config.phoneNumberId || connection.externalAccountId || "");
    try {
      const result = await sendMetaTextMessage(connection.accessTokenEncrypted, phoneNumberId, conversation.contactAddress, text);
      providerMessageId = String(result?.messages?.[0]?.id || "") || null;
      if (!providerMessageId) throw new Error("Meta accepted no message identifier.");
      outboundStatus = "accepted";
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Meta rejected the message.";
      await prisma.channelConnection.update({ where: { id: connection.id }, data: { lastError: reason.slice(0, 500) } });
      return NextResponse.json({ error: reason }, { status: 502 });
    }
  }
  const message = await prisma.$transaction(async (tx) => {
    const created = await tx.inboxMessage.create({ data: { conversationId: conversation.id, direction, senderType: direction === "inbound" ? "customer" : "member", senderMemberId: direction === "outbound" ? ctx.memberId : null, providerMessageId, text, deliveryStatus: direction === "outbound" ? outboundStatus : "received", sentAt: now } });
    await tx.inboxConversation.update({ where: { id: conversation.id }, data: { status: "open", resolvedAt: null, lastMessageAt: now, lastMessagePreview: text.slice(0, 180), ...(direction === "inbound" ? { unreadCount: { increment: 1 } } : { firstResponseAt: conversation.firstResponseAt ?? now }) } });
    await tx.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: conversation.id, actorMemberId: ctx.memberId, type: direction === "outbound" ? "outbound_sent" : "inbound_logged", metadata: { deliveryStatus: created.deliveryStatus, providerMessageId } } });
    return created;
  });
  await enqueueWebhookEvent(ctx.workspaceId, direction === "outbound" ? "message.accepted" : "message.recorded", { conversationId: conversation.id, messageId: message.id, direction, deliveryStatus: message.deliveryStatus, providerMessageId });
  return NextResponse.json({ message, sent: direction === "outbound", notice: direction === "outbound" ? "Message accepted by Meta." : undefined }, { status: 201 });
}
