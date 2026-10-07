import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyMetaSignature } from "@/lib/meta-cloud";
import { cleanContactAddress, cleanInboxText } from "@/lib/inbox";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { runAutomations } from "@/lib/automations";
import { refreshWhatsAppCampaign } from "@/lib/whatsapp-campaigns";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const valid = url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === process.env.META_VERIFY_TOKEN;
  return valid ? new Response(url.searchParams.get("hub.challenge") || "", { status: 200 }) : new Response("Forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (Buffer.byteLength(raw) > 1_048_576) return NextResponse.json({ error: "Payload is too large." }, { status: 413 });
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) return NextResponse.json({ error: "Invalid Meta signature." }, { status: 401 });
  const payload = (() => { try { return JSON.parse(raw); } catch { return null; } })();
  if (!payload || payload.object !== "whatsapp_business_account") return NextResponse.json({ error: "Unsupported Meta webhook payload." }, { status: 400 });
  for (const entry of Array.isArray(payload.entry) ? payload.entry : []) for (const change of Array.isArray(entry.changes) ? entry.changes : []) {
    const value = change?.value || {};
    const phoneNumberId = cleanInboxText(value?.metadata?.phone_number_id, 120);
    const connection = phoneNumberId ? await prisma.channelConnection.findFirst({ where: { provider: "meta_cloud", externalAccountId: phoneNumberId, status: { in: ["active", "paused"] } }, include: { workspace: { select: { ownerId: true } } } }) : null;
    if (!connection) continue;
    for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
      const state = ["sent", "delivered", "read", "failed"].includes(status.status) ? status.status : "recorded";
      const providerMessageId = cleanInboxText(status.id, 200);
      const message = providerMessageId ? await prisma.inboxMessage.findUnique({ where: { providerMessageId }, select: { id: true, conversationId: true } }) : null;
      const campaignRecipient = providerMessageId ? await prisma.whatsAppCampaignRecipient.findUnique({ where: { providerMessageId }, select: { id: true, campaignId: true, status: true } }) : null;
      if (message) {
        await prisma.$transaction([
          prisma.inboxMessage.update({ where: { id: message.id }, data: { deliveryStatus: state, readAt: state === "read" ? new Date() : undefined } }),
          prisma.inboxEvent.create({ data: { workspaceId: connection.workspaceId, conversationId: message.conversationId, type: `meta_message_${state}`, metadata: { messageId: message.id, providerMessageId, error: status?.errors?.[0]?.title || null } } }),
          prisma.channelConnection.update({ where: { id: connection.id }, data: { lastEventAt: new Date(), lastError: state === "failed" ? cleanInboxText(status?.errors?.[0]?.title || "Meta delivery failed.", 500) : null } }),
        ]);
        await enqueueWebhookEvent(connection.workspaceId, `message.${state === "sent" ? "accepted" : state}`, { conversationId: message.conversationId, messageId: message.id, providerMessageId });
      }
      if (campaignRecipient) {
        const rank: Record<string, number> = { accepted: 1, sent: 2, delivered: 3, read: 4, failed: 5 };
        if (state === "failed" || (rank[state] || 0) >= (rank[campaignRecipient.status] || 0)) {
          await prisma.whatsAppCampaignRecipient.update({ where: { id: campaignRecipient.id }, data: {
            status: state,
            sentAt: state === "sent" ? new Date() : undefined,
            deliveredAt: state === "delivered" ? new Date() : undefined,
            readAt: state === "read" ? new Date() : undefined,
            lastError: state === "failed" ? cleanInboxText(status?.errors?.[0]?.title || "Meta delivery failed.", 500) : null,
          } });
          await refreshWhatsAppCampaign(campaignRecipient.campaignId);
        }
        await enqueueWebhookEvent(connection.workspaceId, `message.${state === "sent" ? "accepted" : state}`, { campaignId: campaignRecipient.campaignId, campaignRecipientId: campaignRecipient.id, providerMessageId });
      }
      if (!message && !campaignRecipient) continue;
    }
    if (connection.status !== "active") continue;
    for (const message of Array.isArray(value.messages) ? value.messages : []) {
      const providerId = cleanInboxText(message.id, 200);
      if (!providerId || await prisma.inboxMessage.findUnique({ where: { providerMessageId: providerId } })) continue;
      const address = cleanContactAddress(message.from), contact = (Array.isArray(value.contacts) ? value.contacts : []).find((c: any) => c.wa_id === message.from);
      if (address.length < 7) continue;
      const contactName = cleanInboxText(contact?.profile?.name, 120) || address;
      const text = cleanInboxText(message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || message?.interactive?.list_reply?.title || `[${message.type || "message"}]`, 4000);
      const suppliedTime = message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date();
      const sentAt = Number.isNaN(suppliedTime.getTime()) ? new Date() : suppliedTime;
      const result = await prisma.$transaction(async (tx) => {
        const event = await tx.channelEvent.create({ data: { workspaceId: connection.workspaceId, connectionId: connection.id, providerEventId: providerId, eventType: "message.received", normalizedPayload: { contact: { address, name: contactName }, message: { id: providerId, type: cleanInboxText(message.type, 40), text, sentAt: sentAt.toISOString() } } } });
        const existingLead = await tx.lead.findFirst({ where: { workspaceId: connection.workspaceId, phone: address, archivedAt: null, status: { notIn: ["won", "lost"] } }, orderBy: { updatedAt: "desc" } });
        const lead = existingLead
          ? await tx.lead.update({ where: { id: existingLead.id }, data: { name: contactName, source: "WhatsApp Cloud API", nextFollowUpAt: new Date(), activities: { create: { type: "message_received", body: "Inbound official WhatsApp message received" } } } })
          : await tx.lead.create({ data: { workspaceId: connection.workspaceId, userId: connection.workspace.ownerId, name: contactName, phone: address, source: "WhatsApp Cloud API", status: "new", nextFollowUpAt: new Date(), activities: { create: { type: "message_received", body: "Lead captured from official WhatsApp Cloud API" } } } });
        const existing = await tx.inboxConversation.findUnique({ where: { workspaceId_channel_contactAddress: { workspaceId: connection.workspaceId, channel: "whatsapp", contactAddress: address } } });
        const conversation = existing
          ? await tx.inboxConversation.update({ where: { id: existing.id }, data: { channelConnectionId: connection.id, leadId: lead.id, contactName, status: "open", resolvedAt: null, lastMessageAt: sentAt, lastMessagePreview: text.slice(0, 180), unreadCount: { increment: 1 } } })
          : await tx.inboxConversation.create({ data: { workspaceId: connection.workspaceId, channelConnectionId: connection.id, leadId: lead.id, channel: "whatsapp", contactAddress: address, contactName, lastMessageAt: sentAt, lastMessagePreview: text.slice(0, 180), unreadCount: 1, tags: ["meta-cloud-api"] } });
        const inboxMessage = await tx.inboxMessage.create({ data: { conversationId: conversation.id, direction: "inbound", senderType: "customer", providerMessageId: providerId, text, deliveryStatus: "received", sentAt } });
        await tx.channelEvent.update({ where: { id: event.id }, data: { status: "processed", conversationId: conversation.id, messageId: inboxMessage.id, processedAt: new Date() } });
        await tx.inboxEvent.create({ data: { workspaceId: connection.workspaceId, conversationId: conversation.id, type: existing ? "channel_message_received" : "channel_conversation_created", metadata: { channel: "whatsapp", provider: "meta_cloud", connectionId: connection.id, eventId: event.id } } });
        await tx.channelConnection.update({ where: { id: connection.id }, data: { lastEventAt: new Date(), lastError: null } });
        return { conversation, inboxMessage, event, lead, created: !existing, leadCreated: !existingLead };
      });
      await enqueueWebhookEvent(connection.workspaceId, result.created ? "conversation.created" : "channel.message_received", { connectionId: connection.id, channel: "whatsapp", conversationId: result.conversation.id, messageId: result.inboxMessage.id, eventId: result.event.id });
      await enqueueWebhookEvent(connection.workspaceId, result.leadCreated ? "lead.created" : "lead.updated", { leadId: result.lead.id, source: "WhatsApp Cloud API", conversationId: result.conversation.id });
      await runAutomations({ workspaceId: connection.workspaceId, eventKey: `meta-message:${result.event.id}`, trigger: "message.received", conversationId: result.conversation.id, leadId: result.lead.id, text, channel: "whatsapp", source: "WhatsApp Cloud API", leadStatus: result.leadCreated ? "new" : undefined });
    }
  }
  return NextResponse.json({ received: true });
}
