import { CRM_TRASH_TAG, activeConversationContacts } from "./crm-trash";
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { prisma } from './prisma';
import { responseState, SUPPORT_REPLY_TARGET_MINUTES } from './support-queue';
import { queueSupportAlert } from './support-notify';
import { buildSupportDigest, supportDigestSlot, type WaitingItem } from './support-digest';
import { pollZohoInboxes } from './zoho-inbox';
import { createContinueToken, reopenTicketText } from './support-session';
import { serviceEmail } from './customer-email';
import { autoSolveDue, closeDue, isOverdue, replyEmailDue, ticketTopicLabel, URGENT_ESCALATION_AFTER_MS, type TicketStatus } from './support-ticket-rules';

const stateFile = () => process.env.WAZAP_SUPPORT_MONITOR_STATE || '/opt/wazap-private/support-monitor.json';
export async function supportMonitorHealth() { try { return JSON.parse(await readFile(/* turbopackIgnore: true */ stateFile(), 'utf8')); } catch { return null; } }

function adminTicketLink(ticketId: string) {
  return `${process.env.NEXTAUTH_URL || 'https://wazap.lt'}/admin/crm/support?ticket=${encodeURIComponent(ticketId)}`;
}

// --- Ticket jobs (SUPPORT-2), each idempotent - see lib/support-ticket-rules.ts for the pure decisions. ---

async function autoSolveTickets(now: Date) {
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  const candidates = await prisma.supportTicket.findMany({ where: { status: "waiting" }, include: { conversation: { select: { email: true, visitorId: true } } } });
  for (const t of candidates) {
    if (!autoSolveDue({ status: t.status as TicketStatus, lastAdminReplyAt: t.lastAdminReplyAt }, now)) continue;
    await prisma.$transaction(async tx => {
      const updated = await tx.supportTicket.updateMany({ where: { id: t.id, status: "waiting" }, data: { status: "solved", solvedAt: now } });
      if (!updated.count) return;
      if (t.conversation.email) {
        const subject = `Ticket #${t.number} solved`;
        await tx.outboundEmail.create({
          data: {
            userId: t.userId,
            recipient: t.conversation.email.toLowerCase(),
            type: "support_ticket_solved",
            subject,
            html: serviceEmail({ subject, heading: subject, body: `We haven't heard back, so we've marked ticket #${t.number} as solved.\n\n${reopenTicketText({ visitorId: t.conversation.visitorId, ticketNumber: t.number, userId: t.userId, base })}`, channel: "support" }),
          },
        });
      }
    });
  }
}

async function closeSolvedTickets(now: Date) {
  const candidates = await prisma.supportTicket.findMany({ where: { status: "solved" }, select: { id: true, solvedAt: true, status: true } });
  const dueIds = candidates.filter(t => closeDue({ status: t.status as TicketStatus, solvedAt: t.solvedAt }, now)).map(t => t.id);
  if (dueIds.length) await prisma.supportTicket.updateMany({ where: { id: { in: dueIds }, status: "solved" }, data: { status: "closed", closedAt: now } });
}

async function sendTicketReplyEmails(now: Date) {
  // Never for solved/closed tickets - only open|investigating|waiting. The
  // lastCustomerEmailAt OR-clause here is just a cheap pre-filter (skip
  // obviously-too-soon rows before the per-ticket replyEmailDue check,
  // which is where the real "already emailed about this reply" and 3h
  // throttle logic lives - see lib/support-ticket-rules.ts).
  const throttleSince = new Date(now.getTime() - 3 * 3_600_000);
  const candidates = await prisma.supportTicket.findMany({
    where: { status: { in: ["open", "investigating", "waiting"] }, lastAdminReplyAt: { not: null }, OR: [{ lastCustomerEmailAt: null }, { lastCustomerEmailAt: { lte: throttleSince } }] },
    include: { conversation: { select: { email: true, visitorId: true } } },
  });
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  for (const t of candidates) {
    const lastSeen = await prisma.supportChatMessage.findFirst({ where: { ticketId: t.id, sender: "admin", readByVisitor: true }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
    if (!replyEmailDue({ lastAdminReplyAt: t.lastAdminReplyAt, lastSeenAt: lastSeen?.createdAt || null, lastCustomerEmailAt: t.lastCustomerEmailAt, now })) continue;
    if (t.conversation.email) {
      const token = createContinueToken(t.conversation.visitorId);
      const continueUrl = `${base}/support/continue?t=${encodeURIComponent(token)}`;
      const myTickets = t.userId ? `\n\nSee all your tickets: ${base}/support/tickets` : "";
      const subject = `Ticket #${t.number}: new reply`;
      await prisma.outboundEmail.create({
        data: {
          userId: t.userId,
          recipient: t.conversation.email.toLowerCase(),
          type: "support_ticket_reply",
          subject,
          html: serviceEmail({ subject, heading: subject, body: `Our team replied to ticket #${t.number}.\n\nContinue the conversation: ${continueUrl}${myTickets}`, channel: "support" }),
        },
      });
    }
    await prisma.supportTicket.updateMany({ where: { id: t.id, lastAdminReplyAt: t.lastAdminReplyAt }, data: { lastCustomerEmailAt: now } });
  }
}

async function escalateUrgentTickets(now: Date) {
  const candidates = await prisma.supportTicket.findMany({
    where: { urgent: true, status: "open", firstReplyAt: null, urgentEscalatedAt: null, createdAt: { lte: new Date(now.getTime() - URGENT_ESCALATION_AFTER_MS) } },
    include: { conversation: { select: { name: true, email: true } } },
  });
  for (const t of candidates) {
    await prisma.$transaction(async tx => {
      const claimed = await tx.supportTicket.updateMany({ where: { id: t.id, urgentEscalatedAt: null }, data: { urgentEscalatedAt: now } });
      if (!claimed.count) return;
      await queueSupportAlert(
        { eventKey: `urgent-escalation:${t.id}`, name: t.conversation.name, email: t.conversation.email, subject: `URGENT ticket #${t.number} has no reply after 2 hours`, message: `Ticket #${t.number} (${ticketTopicLabel(t.topic)}) has had no staff reply for 2 hours.`, link: adminTicketLink(t.id) },
        tx,
      );
    });
  }
}

// Each ticket job is independent - one throwing (a bad row, a transient DB
// hiccup) must not stop the others from running, and must never stop the
// digest/health write at the end of this function.
async function safely(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (error) {
    console.error(`[support-monitor] ${name} failed`, error);
  }
}

export async function monitorSupport({ poll = process.env.SUPPORT_INBOX_POLLING !== "disabled", now = new Date() } = {}) {
  const inboxes = poll ? (await pollZohoInboxes()).results : [];
  const since = new Date(process.env.SUPPORT_MONITOR_SINCE || now.toISOString());

  await safely("autoSolveTickets", () => autoSolveTickets(now));
  await safely("closeSolvedTickets", () => closeSolvedTickets(now));
  await safely("sendTicketReplyEmails", () => sendTicketReplyEmails(now));
  await safely("escalateUrgentTickets", () => escalateUrgentTickets(now));

  const trashed = await prisma.crmLead.findMany({ where: { tags: { has: CRM_TRASH_TAG } }, select: { email: true } });
  const requests = await prisma.contactMessage.findMany({ where: { adminReply: null, NOT: { OR: trashed.map(lead => ({ email: { equals: lead.email, mode: 'insensitive' as const } })) } } });
  const qa = await prisma.crmActivity.findMany({ where: { sourceKey: { startsWith: "support-qa:" }, body: "true" }, select: { sourceKey: true } });
  const qaIds = new Set(qa.map(x => x.sourceKey!.slice("support-qa:".length)));

  let overdue = 0;
  const waiting: WaitingItem[] = [];

  // Daily digest "waiting" list is built from TICKETS now, not conversations
  // (SUPPORT-2): every open/investigating ticket that is either overdue
  // (waitingSince older than 12h) or still unassigned - excluding tickets
  // whose CRM lead was moved to Trash, same as the "requests" list above.
  const openTickets = await prisma.supportTicket.findMany({
    where: { status: { in: ["open", "investigating"] }, conversation: activeConversationContacts },
    include: { conversation: { select: { name: true, email: true } } },
  });
  for (const t of openTickets) {
    const ticketOverdue = isOverdue(t.waitingSince, now);
    if (ticketOverdue) overdue++;
    if (ticketOverdue || !t.assignedToId) {
      waiting.push({ kind: 'ticket', name: t.conversation.name, email: t.conversation.email, topic: `#${t.number} ${ticketTopicLabel(t.topic)}`, waitingSince: (t.waitingSince || t.createdAt).toISOString() });
    }
  }

  for (const ticket of requests) {
    if (qaIds.has(ticket.id)) continue;
    if (ticket.createdAt >= since) await queueSupportAlert({ eventKey: 'request:' + ticket.id, name: ticket.name, email: ticket.email, subject: 'New Wazap support request: ' + ticket.subject, message: ticket.message });
    const state = responseState(ticket.createdAt, now); if (!state.overdue) continue; overdue++;
    waiting.push({ kind: 'request', name: ticket.name, email: ticket.email, topic: ticket.subject, waitingSince: state.waitingSince! });
    await prisma.crmTask.updateMany({ where: { completedAt: null, title: { endsWith: 'review request ' + ticket.id } }, data: { dueAt: new Date(state.dueAt!) } });
  }

  const [deliveryFailures, queuedService] = await Promise.all([
    prisma.outboundEmail.count({ where: { status: { in: ['failed', 'unknown', 'deferred'] }, createdAt: { gte: since }, NOT: { OR: [{ type: { startsWith: 'marketing_' } }, { type: { startsWith: 'crm_' } }] } } }),
    prisma.outboundEmail.count({ where: { status: { in: ['queued', 'processing'] }, NOT: { OR: [{ type: { startsWith: 'marketing_' } }, { type: { startsWith: 'crm_' } }] } } }),
  ]);
  const mailboxErrors = inboxes.filter(m => !m.connected || m.error);
  // Waiting items and inbox/delivery problems go out as ONE summary email a
  // day (first run after 09:00 Dubai), never hourly per item.
  const slot = supportDigestSlot(now);
  if (slot.due) {
    const failedToday = await prisma.outboundEmail.count({ where: { status: { in: ['failed', 'unknown', 'deferred'] }, createdAt: { gte: new Date(now.getTime() - 86400000) }, NOT: { OR: [{ type: { startsWith: 'marketing_' } }, { type: { startsWith: 'crm_' } }] } } });
    const digest = buildSupportDigest({ waiting, mailboxProblems: mailboxErrors.map(m => m.mailbox), deliveryFailures: failedToday, now });
    if (digest) await queueSupportAlert({ eventKey: `support-digest:${slot.day}`, subject: digest.subject, message: digest.message });
  }
  const health = { checkedAt: now.toISOString(), targetMinutes: SUPPORT_REPLY_TARGET_MINUTES, overdue, mailboxes: inboxes.map(m => ({ mailbox: m.mailbox, connected: m.connected, ok: m.connected && !m.error })), deliveryFailures, queuedService };
  await mkdir(stateFile().slice(0, stateFile().lastIndexOf('/')), { recursive: true, mode: 0o700 });
  const temp = stateFile() + '.' + randomUUID(); await writeFile(temp, JSON.stringify(health), { mode: 0o600 }); await rename(temp, stateFile()); return health;
}
