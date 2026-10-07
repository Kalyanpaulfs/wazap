import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { accessibleConversation, cleanContactAddress, cleanInboxText, currentInboxContext, validWorkspaceMember } from "@/lib/inbox";
import { rateLimit } from "@/lib/rate-limit";
import type { Prisma } from "@prisma/client";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { runAutomations } from "@/lib/automations";

export const dynamic = "force-dynamic";
const STATUSES = ["open", "pending", "resolved"];
const PRIORITIES = ["low", "normal", "high", "urgent"];

export async function GET(req: Request) {
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Sign in to open the shared inbox." }, { status: 401 });
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const channel = url.searchParams.get("channel");
  const selectedId = url.searchParams.get("conversationId");
  const where = { workspaceId: ctx.workspaceId, ...(STATUSES.includes(status || "") ? { status: status! } : {}), ...(["whatsapp", "instagram", "messenger", "email", "sms", "rcs", "telegram"].includes(channel || "") ? { channel: channel! } : {}) };
  const [conversations, members, selected, open, unassigned, unread, dueTasks, agents] = await Promise.all([
    prisma.inboxConversation.findMany({
      where, orderBy: { lastMessageAt: "desc" }, take: 100,
      include: { assignedMember: { include: { user: { select: { id: true, name: true, email: true } } } }, channelConnection: { select: { id: true, displayName: true, status: true, provider: true } }, _count: { select: { messages: true, notes: true, tasks: true } } },
    }),
    prisma.workspaceMember.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true, email: true } } } }),
    selectedId ? prisma.inboxConversation.findFirst({
      where: { id: selectedId, workspaceId: ctx.workspaceId },
      include: {
        assignedMember: { include: { user: { select: { id: true, name: true, email: true } } } },
        channelConnection: { select: { id: true, displayName: true, status: true, provider: true, capabilities: true } },
        lead: { select: { id: true, name: true, email: true, source: true, campaign: true, status: true, owner: true, estimatedValue: true, currency: true, nextFollowUpAt: true, notes: true, lastContactedAt: true } },
        messages: { orderBy: { sentAt: "asc" }, take: 200, include: { senderMember: { include: { user: { select: { name: true, email: true } } } } } },
        notes: { orderBy: { createdAt: "desc" }, take: 50, include: { authorMember: { include: { user: { select: { name: true, email: true } } } } } },
        tasks: { orderBy: [{ status: "asc" }, { dueAt: "asc" }], include: { assignedMember: { include: { user: { select: { name: true, email: true } } } } } },
        aiDrafts: { where: { status: "pending" }, orderBy: { createdAt: "desc" }, include: { agent: { select: { name: true, roleType: true } } } },
        aiHandoffs: { where: { status: "open" }, orderBy: { createdAt: "desc" }, include: { agent: { select: { name: true } }, assignedMember: { include: { user: { select: { name: true, email: true } } } } } },
        events: { orderBy: { createdAt: "desc" }, take: 30 },
      },
    }) : null,
    prisma.inboxConversation.count({ where: { workspaceId: ctx.workspaceId, status: "open" } }),
    prisma.inboxConversation.count({ where: { workspaceId: ctx.workspaceId, status: { not: "resolved" }, assignedMemberId: null } }),
    prisma.inboxConversation.aggregate({ where: { workspaceId: ctx.workspaceId }, _sum: { unreadCount: true } }),
    prisma.inboxTask.count({ where: { workspaceId: ctx.workspaceId, status: "open", dueAt: { lte: new Date() } } }),
    prisma.aiAgent.findMany({ where: { workspaceId: ctx.workspaceId, status: "active" }, select: { id: true, name: true, roleType: true, responseMode: true }, orderBy: { name: "asc" } }),
  ]);
  if (selected?.unreadCount) await prisma.inboxConversation.update({ where: { id: selected.id }, data: { unreadCount: 0 } });
  return NextResponse.json({ conversations, selected: selected ? { ...selected, unreadCount: 0 } : null, members, agents, workspaceId: ctx.workspaceId, memberId: ctx.memberId, activeChannel: channel || "", metrics: { open, unassigned, unread: unread._sum.unreadCount ?? 0, dueTasks } });
}

export async function POST(req: Request) {
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`inbox:create:${ctx.workspaceId}`, 60, 60_000)) return NextResponse.json({ error: "Too many inbox changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const channel = ["whatsapp", "instagram", "messenger", "email", "sms", "rcs", "telegram"].includes(body.channel) ? body.channel : "whatsapp";
  const contactName = cleanInboxText(body.contactName, 100);
  const contactAddress = cleanContactAddress(body.contactAddress, channel);
  const text = cleanInboxText(body.text, 4000);
  if (!contactName || !contactAddress || !text) return NextResponse.json({ error: "Contact name, address, and first message are required." }, { status: 400 });
  const assigned = await validWorkspaceMember(ctx.workspaceId, body.assignedMemberId);
  if (body.assignedMemberId && !assigned) return NextResponse.json({ error: "Assignee is not in this workspace." }, { status: 400 });
  const lead = body.leadId ? await prisma.lead.findFirst({ where: { id: String(body.leadId), workspaceId: ctx.workspaceId } }) : null;
  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.inboxConversation.findUnique({ where: { workspaceId_channel_contactAddress: { workspaceId: ctx.workspaceId, channel, contactAddress } } });
    const item = existing ? await tx.inboxConversation.update({ where: { id: existing.id }, data: { contactName, leadId: lead?.id ?? existing.leadId, status: "open", resolvedAt: null, assignedMemberId: assigned?.id ?? existing.assignedMemberId, unreadCount: { increment: 1 }, lastMessageAt: now, lastMessagePreview: text.slice(0, 180) } }) : await tx.inboxConversation.create({ data: { workspaceId: ctx.workspaceId, leadId: lead?.id, channel, contactName, contactAddress, assignedMemberId: assigned?.id, unreadCount: 1, lastMessageAt: now, lastMessagePreview: text.slice(0, 180), tags: [] } });
    await tx.inboxMessage.create({ data: { conversationId: item.id, direction: "inbound", senderType: "customer", text, deliveryStatus: "received", sentAt: now } });
    await tx.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: item.id, actorMemberId: ctx.memberId, type: existing ? "inbound_logged" : "conversation_created", metadata: { channel } } });
    return { conversation: item, created: !existing };
  });
  const conversation = result.conversation;
  await enqueueWebhookEvent(ctx.workspaceId, "conversation.created", { conversationId: conversation.id, channel, contactName, contactAddress });
  const automationEvent = { workspaceId: ctx.workspaceId, eventKey: `manual-inbound:${conversation.id}:${now.getTime()}`, trigger: "message.received", conversationId: conversation.id, leadId: lead?.id, text, channel, priority: conversation.priority };
  await runAutomations(automationEvent);
  if (result.created) await runAutomations({ ...automationEvent, eventKey: `conversation-created:${conversation.id}`, trigger: "conversation.created" });
  return NextResponse.json(conversation, { status: 201 });
}

export async function PATCH(req: Request) {
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const conversation = await accessibleConversation(ctx.workspaceId, String(body.id ?? ""));
  if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  const assigned = body.assignedMemberId ? await validWorkspaceMember(ctx.workspaceId, body.assignedMemberId) : null;
  if (body.assignedMemberId && !assigned) return NextResponse.json({ error: "Assignee is not in this workspace." }, { status: 400 });
  const status = STATUSES.includes(body.status) ? body.status : undefined;
  const priority = PRIORITIES.includes(body.priority) ? body.priority : undefined;
  const tags = Array.isArray(body.tags) ? [...new Set<string>(body.tags.map((tag: unknown) => cleanInboxText(tag, 30)).filter(Boolean))].slice(0, 10) : undefined;
  const changes: Prisma.InboxConversationUncheckedUpdateInput = { ...(status ? { status, resolvedAt: status === "resolved" ? new Date() : null } : {}), ...(priority ? { priority } : {}), ...(body.assignedMemberId !== undefined ? { assignedMemberId: assigned?.id ?? null } : {}), ...(tags ? { tags } : {}), ...(body.markUnread === true ? { unreadCount: 1 } : {}) };
  const updated = await prisma.$transaction(async (tx) => {
    const item = await tx.inboxConversation.update({ where: { id: conversation.id }, data: changes });
    await tx.inboxEvent.create({ data: { workspaceId: ctx.workspaceId, conversationId: conversation.id, actorMemberId: ctx.memberId, type: "conversation_updated", metadata: { status, priority, assignedMemberId: body.assignedMemberId ?? undefined, tags } } });
    return item;
  });
  await enqueueWebhookEvent(ctx.workspaceId, "conversation.updated", { conversationId: conversation.id, status: updated.status, priority: updated.priority, assignedMemberId: updated.assignedMemberId });
  await runAutomations({ workspaceId: ctx.workspaceId, eventKey: `conversation-updated:${conversation.id}:${Date.now()}`, trigger: "conversation.updated", conversationId: conversation.id, leadId: conversation.leadId, channel: conversation.channel, priority: updated.priority });
  return NextResponse.json({ success: true, conversation: updated });
}
