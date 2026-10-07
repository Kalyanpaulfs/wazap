import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanContactAddress, cleanInboxText } from "@/lib/inbox";
import { verifyChannelSignature } from "@/lib/channels";
import { rateLimit } from "@/lib/rate-limit";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { runAutomations } from "@/lib/automations";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!rateLimit(`channel-inbound:${token}`, 300, 60_000)) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  const connection = await prisma.channelConnection.findUnique({ where: { webhookPathToken: token }, include: { workspace: { select: { ownerId: true } } } });
  if (!connection || connection.status === "disabled") return NextResponse.json({ error: "Connection not found." }, { status: 404 });
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 65_536) return NextResponse.json({ error: "Payload is too large." }, { status: 413 });
  const timestamp = req.headers.get("x-wazap-timestamp") || ""; const signature = req.headers.get("x-wazap-channel-signature") || "";
  if (!verifyChannelSignature(connection.signingSecretEncrypted, timestamp, raw, signature)) return NextResponse.json({ error: "Invalid or expired signature." }, { status: 401 });
  const body = (() => { try { return JSON.parse(raw) as Record<string, unknown>; } catch { return null; } })();
  if (!body) return NextResponse.json({ error: "Valid JSON is required." }, { status: 400 });
  const providerEventId = cleanInboxText(body.eventId, 160); const eventType = cleanInboxText(body.type, 60);
  if (!providerEventId || !eventType) return NextResponse.json({ error: "eventId and type are required." }, { status: 400 });
  const duplicate = await prisma.channelEvent.findUnique({ where: { connectionId_providerEventId: { connectionId: connection.id, providerEventId } } });
  if (duplicate) return NextResponse.json({ accepted: true, duplicate: true, eventId: duplicate.id });
  if (eventType === "verification") {
    const requested = Array.isArray(body.capabilities) ? body.capabilities.map(String) : [];
    const outbound = requested.includes("send") && requested.includes("delivery_receipts");
    const capabilities = outbound ? ["receive", "send", "delivery_receipts"] : ["receive"];
    const event = await prisma.$transaction(async (tx) => { const created = await tx.channelEvent.create({ data: { workspaceId: connection.workspaceId, connectionId: connection.id, providerEventId, eventType, status: "processed", normalizedPayload: { type: "verification", capabilities }, processedAt: new Date() } }); await tx.channelConnection.update({ where: { id: connection.id }, data: { status: "active", capabilities, config: { ...(connection.config && typeof connection.config === "object" ? connection.config as Record<string, unknown> : {}), outbound }, lastVerifiedAt: new Date(), lastEventAt: new Date(), lastError: null } }); return created; });
    await enqueueWebhookEvent(connection.workspaceId, "channel.verified", { connectionId: connection.id, channel: connection.channel, capabilities });
    return NextResponse.json({ accepted: true, verified: true, capabilities, outboundEndpoint: outbound ? `${process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || "https://wazap.lt"}/api/channels/outbound/${token}` : null, eventId: event.id });
  }
  if (connection.status !== "active") return NextResponse.json({ error: "Verify and activate this connection before sending messages." }, { status: 409 });
  if (eventType === "message.status") {
    if (!connection.capabilities.includes("send") || !connection.capabilities.includes("delivery_receipts")) return NextResponse.json({ error: "This connection is not verified for outbound delivery receipts." }, { status: 403 });
    const localMessageId = cleanInboxText(body.localMessageId, 160);
    const providerMessageId = cleanInboxText(body.providerMessageId, 200);
    const deliveryStatus = cleanInboxText(body.status, 30).toLowerCase();
    const allowed = ["accepted", "sent", "delivered", "read", "failed"];
    if (!localMessageId || !allowed.includes(deliveryStatus)) return NextResponse.json({ error: "localMessageId and a supported status are required." }, { status: 400 });
    const message = await prisma.inboxMessage.findFirst({ where: { id: localMessageId, direction: "outbound", conversation: { workspaceId: connection.workspaceId, channelConnectionId: connection.id } }, include: { conversation: { select: { id: true } } } });
    if (!message) return NextResponse.json({ error: "Queued outbound message not found." }, { status: 404 });
    if (providerMessageId) {
      const conflict = await prisma.inboxMessage.findFirst({ where: { providerMessageId, id: { not: message.id } }, select: { id: true } });
      if (conflict) return NextResponse.json({ error: "providerMessageId is already assigned to another message." }, { status: 409 });
    }
    const rank: Record<string, number> = { recorded: 0, queued: 0, accepted: 1, sent: 2, delivered: 3, read: 4 };
    const currentRank = rank[message.deliveryStatus] ?? -1;
    const nextRank = rank[deliveryStatus] ?? -1;
    const ignored = (deliveryStatus === "failed" && currentRank >= 3) || (deliveryStatus !== "failed" && message.deliveryStatus !== "failed" && currentRank >= nextRank);
    const result = await prisma.$transaction(async (tx) => {
      const event = await tx.channelEvent.create({ data: { workspaceId: connection.workspaceId, connectionId: connection.id, conversationId: message.conversation.id, providerEventId, eventType, status: "processed", normalizedPayload: { localMessageId, providerMessageId: providerMessageId || null, status: deliveryStatus, ignored }, processedAt: new Date() } });
      const updated = ignored ? message : await tx.inboxMessage.update({ where: { id: message.id }, data: { deliveryStatus, ...(providerMessageId ? { providerMessageId } : {}), ...(deliveryStatus === "read" ? { readAt: new Date() } : {}) } });
      await tx.inboxEvent.create({ data: { workspaceId: connection.workspaceId, conversationId: message.conversation.id, type: ignored ? "channel_message_status_ignored" : `channel_message_${deliveryStatus}`, metadata: { connectionId: connection.id, messageId: message.id, providerMessageId: providerMessageId || null, eventId: event.id, previousStatus: message.deliveryStatus } } });
      await tx.channelConnection.update({ where: { id: connection.id }, data: { lastEventAt: new Date(), lastError: deliveryStatus === "failed" && !ignored ? cleanInboxText(body.error, 500) || "Provider reported delivery failure." : null } });
      return { event, updated };
    });
    if (!ignored) await enqueueWebhookEvent(connection.workspaceId, `message.${deliveryStatus}`, { connectionId: connection.id, channel: connection.channel, conversationId: message.conversation.id, messageId: message.id, providerMessageId: providerMessageId || null });
    return NextResponse.json({ accepted: true, ignored, eventId: result.event.id, messageId: result.updated.id, status: result.updated.deliveryStatus });
  }
  if (eventType !== "message.received") return NextResponse.json({ error: "Unsupported event type." }, { status: 422 });
  const contact = body.contact && typeof body.contact === "object" ? body.contact as Record<string, unknown> : {}; const incoming = body.message && typeof body.message === "object" ? body.message as Record<string, unknown> : {};
  const contactAddress = cleanContactAddress(contact.address || contact.id, connection.channel); const contactName = cleanInboxText(contact.name, 100) || contactAddress; const text = cleanInboxText(incoming.text, 4000); const providerMessageId = cleanInboxText(incoming.id, 160);
  if (!contactAddress || !text || !providerMessageId) {
    await prisma.channelEvent.create({ data: { workspaceId: connection.workspaceId, connectionId: connection.id, providerEventId, eventType, status: "failed", normalizedPayload: { contactAddress: contactAddress || null, hasText: Boolean(text), hasMessageId: Boolean(providerMessageId) }, errorCode: "INVALID_NORMALIZED_EVENT", errorMessage: "contact.address, message.id, and message.text are required." } });
    await prisma.channelConnection.update({ where: { id: connection.id }, data: { lastEventAt: new Date(), lastError: "The latest signed event did not match the normalized message contract." } });
    return NextResponse.json({ error: "Normalized contact and message fields are required." }, { status: 422 });
  }
  const suppliedTime = incoming.sentAt ? new Date(String(incoming.sentAt)) : new Date(); const sentAt = Number.isNaN(suppliedTime.getTime()) || Math.abs(Date.now() - suppliedTime.getTime()) > 31_536_000_000 ? new Date() : suppliedTime;
  const result = await prisma.$transaction(async (tx) => {
    const event = await tx.channelEvent.create({ data: { workspaceId: connection.workspaceId, connectionId: connection.id, providerEventId, eventType, normalizedPayload: { contact: { address: contactAddress, name: contactName }, message: { id: providerMessageId, text, sentAt: sentAt.toISOString() } } } });
    const leadAddress = ["whatsapp", "sms", "rcs"].includes(connection.channel) ? contactAddress.replace(/\D/g, "") : "";
    const existingLead = leadAddress.length >= 7 ? await tx.lead.findFirst({ where: { workspaceId: connection.workspaceId, phone: leadAddress, archivedAt: null, status: { notIn: ["won", "lost"] } }, orderBy: { updatedAt: "desc" } }) : null;
    const lead = leadAddress.length < 7 ? null : existingLead
      ? await tx.lead.update({ where: { id: existingLead.id }, data: { name: contactName, source: `${connection.channel} channel`, nextFollowUpAt: new Date(), activities: { create: { type: "message_received", body: `Inbound ${connection.channel} message received` } } } })
      : await tx.lead.create({ data: { workspaceId: connection.workspaceId, userId: connection.workspace.ownerId, name: contactName, phone: leadAddress, source: `${connection.channel} channel`, status: "new", nextFollowUpAt: new Date(), activities: { create: { type: "message_received", body: `Lead captured from inbound ${connection.channel}` } } } });
    const existing = await tx.inboxConversation.findUnique({ where: { workspaceId_channel_contactAddress: { workspaceId: connection.workspaceId, channel: connection.channel, contactAddress } } });
    const conversation = existing ? await tx.inboxConversation.update({ where: { id: existing.id }, data: { channelConnectionId: connection.id, leadId: lead?.id ?? existing.leadId, contactName, externalThreadId: cleanInboxText(contact.threadId, 200) || existing.externalThreadId, status: "open", resolvedAt: null, unreadCount: { increment: 1 }, lastMessageAt: sentAt, lastMessagePreview: text.slice(0, 180) } }) : await tx.inboxConversation.create({ data: { workspaceId: connection.workspaceId, channelConnectionId: connection.id, leadId: lead?.id, channel: connection.channel, externalThreadId: cleanInboxText(contact.threadId, 200) || null, contactName, contactAddress, status: "open", unreadCount: 1, lastMessageAt: sentAt, lastMessagePreview: text.slice(0, 180), tags: ["connected-channel"] } });
    const message = await tx.inboxMessage.create({ data: { conversationId: conversation.id, direction: "inbound", senderType: "customer", providerMessageId: `channel:${connection.id}:${providerMessageId}`, text, deliveryStatus: "received", sentAt } });
    await tx.channelEvent.update({ where: { id: event.id }, data: { status: "processed", conversationId: conversation.id, messageId: message.id, processedAt: new Date() } });
    await tx.inboxEvent.create({ data: { workspaceId: connection.workspaceId, conversationId: conversation.id, type: existing ? "channel_message_received" : "channel_conversation_created", metadata: { channel: connection.channel, connectionId: connection.id, provider: connection.provider, eventId: event.id } } });
    if (!existing) await tx.conversationStart.create({ data: { userId: connection.workspace.ownerId, workspaceId: connection.workspaceId, leadId: lead?.id, channel: connection.channel, assetType: "channel", assetId: connection.id, assetName: connection.displayName, source: connection.provider, campaign: "inbound" } });
    await tx.channelConnection.update({ where: { id: connection.id }, data: { lastEventAt: new Date(), lastError: null } }); return { event, conversation, message, created: !existing, leadId: lead?.id ?? null, leadCreated: Boolean(lead && !existingLead) };
  });
  await enqueueWebhookEvent(connection.workspaceId, result.created ? "conversation.created" : "channel.message_received", { connectionId: connection.id, channel: connection.channel, conversationId: result.conversation.id, messageId: result.message.id, eventId: result.event.id });
  if (result.leadId) await enqueueWebhookEvent(connection.workspaceId, result.leadCreated ? "lead.created" : "lead.updated", { leadId: result.leadId, source: `${connection.channel} channel`, conversationId: result.conversation.id });
  await runAutomations({ workspaceId: connection.workspaceId, eventKey: `channel-event:${result.event.id}`, trigger: "message.received", conversationId: result.conversation.id, leadId: result.leadId, text, channel: connection.channel, priority: result.conversation.priority, source: `${connection.channel} channel`, leadStatus: result.leadCreated ? "new" : undefined });
  if (result.created) await runAutomations({ workspaceId: connection.workspaceId, eventKey: `conversation-created:${result.conversation.id}`, trigger: "conversation.created", conversationId: result.conversation.id, leadId: result.leadId, text, channel: connection.channel, priority: result.conversation.priority, source: `${connection.channel} channel` });
  if (result.leadId) await runAutomations({ workspaceId: connection.workspaceId, eventKey: `channel-lead:${result.event.id}`, trigger: result.leadCreated ? "lead.created" : "lead.updated", conversationId: result.conversation.id, leadId: result.leadId, channel: connection.channel, source: `${connection.channel} channel`, leadStatus: result.leadCreated ? "new" : undefined });
  return NextResponse.json({ accepted: true, eventId: result.event.id, conversationId: result.conversation.id, messageId: result.message.id }, { status: 202 });
}
