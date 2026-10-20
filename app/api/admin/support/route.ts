import {responseState} from "@/lib/support-queue";
import {supportMonitorHealth} from "@/lib/support-monitor";
import {CRM_TRASH_TAG, activeConversationContacts} from "@/lib/crm-trash";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sameSiteRequest } from "@/lib/crm";
import { prisma } from "@/lib/prisma";
import { flaggedConversationCount } from "@/lib/support-admin-service";
import { checkAttachment } from "@/lib/support-attachment";
import { quickAnswerById } from "@/lib/support-quick-answers";
import { assignTicket, getTicketMessagesForAdmin, markTicketReadByAdmin, reopenTicketByAdmin, setTicketStatus, setTicketUrgent, staffReply, type AttachmentInput } from "@/lib/support-tickets";
import { compareTicketsForAdmin, isOverdue, type StaffReplyNextStatus, type TicketStatus } from "@/lib/support-ticket-rules";
import { PLAN_DISPLAY_NAME, normalizePlanKey } from "@/lib/plan-limits";
// Most-recent solved/closed tickets shown in the admin list, on top of
// EVERY open/investigating/waiting ticket (never capped - an old open
// ticket must never silently drop off the list).
const RECENT_CLOSED_TICKETS_LIMIT = 200;

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  return Boolean((session?.user as any)?.isAdmin);
}

async function requireAdminId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; isAdmin?: boolean } | undefined;
  return user?.isAdmin ? user.id || null : null;
}

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function getRequests(){
 const trashed=await prisma.crmLead.findMany({where:{tags:{has:CRM_TRASH_TAG}},select:{email:true}});
 const rows=await prisma.contactMessage.findMany({where:{NOT:{OR:trashed.map(lead=>({email:{equals:lead.email,mode:'insensitive' as const}}))}},orderBy:{createdAt:'desc'},take:100});
 const leads=await prisma.crmLead.findMany({where:{email:{in:rows.map(r=>r.email.toLowerCase())}},select:{id:true,email:true}});
 const relations=await prisma.crmActivity.findMany({where:{sourceKey:{in:rows.map(r=>"support-thread:"+r.id)}},select:{sourceKey:true,body:true}});
 const qa=await prisma.crmActivity.findMany({where:{sourceKey:{in:rows.map(r=>"support-qa:"+r.id)}},select:{sourceKey:true,body:true}});
 const parentIds=relations.map(r=>r.body);const parents=await prisma.contactMessage.findMany({where:{id:{in:parentIds}},select:{id:true,subject:true,message:true,adminReply:true}});
 return rows.map(r=>{const parentId=relations.find(x=>x.sourceKey==="support-thread:"+r.id)?.body;const isQa=qa.some(x=>x.sourceKey==="support-qa:"+r.id&&x.body==="true");return {...r,...responseState(r.adminReply||isQa?null:r.createdAt),isQa,parentRequest:parents.find(x=>x.id===parentId)||null,crmLeadId:leads.find(l=>l.email===r.email.toLowerCase())?.id||null};});
}

// Admin tickets list: sorted per lib/support-ticket-rules.ts
// compareTicketsForAdmin (urgent -> overdue -> longest waiting -> priority
// -> newest updated; waiting/solved/closed after every open/investigating
// ticket). Every open|investigating|waiting ticket is included - no cap, so
// an old open ticket never silently drops off the list - plus only the most
// recent RECENT_CLOSED_TICKETS_LIMIT solved/closed tickets. Tickets whose
// CRM lead is in Trash are excluded, same as the "Email & support forms"
// tab. Only a short preview of the last message comes along for every
// ticket on this list (not the full history) so a ~15s poll doesn't have to
// load every message of every ticket - the admin UI fetches the full
// history for the one selected ticket via ?ticketId=.
async function getTickets() {
  const includeForList = {
    conversation: { select: { name: true, email: true, phone: true, visitorId: true, crmLeadId: true } },
    messages: { orderBy: { createdAt: "desc" as const }, take: 1, select: { body: true } },
  };
  const [activeTickets, recentClosedTickets] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { status: { in: ["open", "investigating", "waiting"] }, conversation: activeConversationContacts },
      orderBy: { updatedAt: "desc" },
      include: includeForList,
    }),
    prisma.supportTicket.findMany({
      where: { status: { in: ["solved", "closed"] }, conversation: activeConversationContacts },
      orderBy: { updatedAt: "desc" },
      take: RECENT_CLOSED_TICKETS_LIMIT,
      include: includeForList,
    }),
  ]);
  const tickets = [...activeTickets, ...recentClosedTickets];

  const adminIds = [...new Set(tickets.map(t => t.assignedToId).filter((id): id is string => Boolean(id)))];
  const admins = adminIds.length ? await prisma.user.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, email: true } }) : [];
  const userIds = [...new Set(tickets.map(t => t.userId).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, plan: true } })
    : [];
  const unreadCounts = tickets.length
    ? await prisma.supportChatMessage.groupBy({ by: ["ticketId"], where: { ticketId: { in: tickets.map(t => t.id) }, sender: "visitor", readByAdmin: false }, _count: { _all: true } })
    : [];
  const unreadById = new Map(unreadCounts.map(u => [u.ticketId as string, u._count._all]));

  const now = new Date();
  const sorted = [...tickets].sort((a, b) => compareTicketsForAdmin(
    { id: a.id, status: a.status as TicketStatus, urgent: a.urgent, priority: a.priority, waitingSince: a.waitingSince, updatedAt: a.updatedAt },
    { id: b.id, status: b.status as TicketStatus, urgent: b.urgent, priority: b.priority, waitingSince: b.waitingSince, updatedAt: b.updatedAt },
    now,
  ));

  return sorted.map(t => {
    const admin = admins.find(a => a.id === t.assignedToId) || null;
    const user = users.find(u => u.id === t.userId) || null;
    const quickAnswer = t.quickAnswerId ? quickAnswerById(t.quickAnswerId) : null;
    return {
      id: t.id,
      number: t.number,
      reference: `#${t.number}`,
      topic: t.topic,
      status: t.status,
      urgent: t.urgent,
      priority: t.priority,
      waitingSince: t.waitingSince?.toISOString() || null,
      overdue: isOverdue(t.waitingSince, now),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      solvedAt: t.solvedAt?.toISOString() || null,
      closedAt: t.closedAt?.toISOString() || null,
      assignedToId: t.assignedToId,
      assignedToName: admin?.name || admin?.email || null,
      conversationId: t.conversationId,
      visitorId: t.conversation.visitorId,
      name: t.conversation.name,
      email: t.conversation.email,
      phone: t.conversation.phone,
      crmLeadId: t.conversation.crmLeadId,
      planLabel: user ? PLAN_DISPLAY_NAME[normalizePlanKey(user.plan)] : null,
      quickAnswerTitle: quickAnswer?.title || null,
      unread: unreadById.get(t.id) || 0,
      lastMessagePreview: t.messages[0]?.body ?? null,
    };
  });
}

async function getAdmins() {
  const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } });
  return admins;
}

async function buildPayload() {
  const [health, requests, flaggedCount, tickets, admins] = await Promise.all([
    supportMonitorHealth(),
    getRequests(),
    flaggedConversationCount(),
    getTickets(),
    getAdmins(),
  ]);
  return { health, requests, flaggedCount, tickets, admins };
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(req.url);
  const ticketId = searchParams.get("ticketId");
  if (ticketId) {
    const messages = await getTicketMessagesForAdmin(ticketId);
    if (!messages) return NextResponse.json({ error: "Ticket not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(await buildPayload(), {headers:{"Cache-Control":"no-store"}});
}

// A reply is either a plain JSON {ticketId,message,nextStatus} (text-only,
// the original shape) or, for a reply that attaches a screenshot, multipart
// form data: ticketId, an optional message/caption, nextStatus and the
// file. Same admin check and same sameSiteRequest check either way; only
// the body parsing differs.
export async function POST(req: Request) {
  const adminId = await requireAdminId();
  if (!adminId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});

  let ticketId: unknown;
  let nextStatus: unknown;
  let cleanMessage = "";
  let attachment: AttachmentInput | undefined;

  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
    ticketId = form.get("ticketId");
    nextStatus = form.get("nextStatus");
    cleanMessage = cleanText(form.get("message"));
    const file = form.get("file");
    if (file instanceof Blob) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const check = checkAttachment(bytes.byteLength, bytes);
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
      attachment = { mimeType: check.mimeType, size: bytes.byteLength, data: Buffer.from(bytes) };
    }
  } else {
    const json = await req.json().catch(() => ({}));
    ticketId = json.ticketId;
    nextStatus = json.nextStatus;
    cleanMessage = cleanText(json.message);
  }

  if (!ticketId || (!cleanMessage && !attachment)) return NextResponse.json({ error: "Missing ticket or message." }, { status: 400 });
  const status: StaffReplyNextStatus = ["waiting", "investigating", "solved"].includes(String(nextStatus)) ? (nextStatus as StaffReplyNextStatus) : "waiting";
  const outcome = await staffReply(String(ticketId), adminId, cleanMessage, status, attachment);
  if (outcome.kind === "error") return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json(await buildPayload(), {headers:{"Cache-Control":"no-store"}});
}

// Ticket actions (status change, urgent toggle, assign, reopen, mark read) take {ticketId, ...}.
export async function PATCH(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if(!sameSiteRequest(req))return NextResponse.json({error:"Invalid request origin."},{status:403});
  const body = await req.json().catch(()=>({}));

  const ticketId = body.ticketId ? String(body.ticketId) : "";
  if (!ticketId) return NextResponse.json({ error: "Missing ticket." }, { status: 400 });

  const exists = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Ticket not found." }, { status: 404 });

  if (body.status !== undefined) {
    if (!["open", "investigating", "waiting", "solved", "closed"].includes(body.status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    const outcome = await setTicketStatus(ticketId, body.status as TicketStatus);
    if (outcome.kind === "error") return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }
  if (body.urgent !== undefined) await setTicketUrgent(ticketId, Boolean(body.urgent));
  if (body.assignedToId !== undefined) await assignTicket(ticketId, body.assignedToId || null);
  if (body.reopen === true) await reopenTicketByAdmin(ticketId);
  if (body.markRead === true) await markTicketReadByAdmin(ticketId);
  return NextResponse.json(await buildPayload(), {headers:{"Cache-Control":"no-store"}});
}
