// DB-backed support ticket service (SUPPORT-2, "no AI"). Pure decision
// logic lives in lib/support-ticket-rules.ts; this module wires those
// decisions into Prisma writes, outbound emails and team alerts. Used by
// app/api/support/tickets/**, app/api/support/attachment and
// app/api/admin/support.
import { prisma } from "./prisma";
import type { Prisma } from "@prisma/client";
import { capturedChat } from "./crm";
import { adminReplyContent } from "./support-admin-service";
import { serviceEmail } from "./customer-email";
import { reopenTicketText } from "./support-session";
import { linkPlan } from "./router-entitlements";
import { SUPPORT_REPLY_TARGET_HOURS } from "./support-queue";
import { queueSupportAlert, notifySupportChatTelegram } from "./support-notify";
import {
  applyCustomerMessage,
  applyStaffReply,
  canReopen,
  generateTicketNumber,
  isUrgent,
  ticketCreateAllowed,
  ticketTopicLabel,
  type MinimalTicket,
  type StaffReplyNextStatus,
  type TicketStatus,
  type TicketTopic,
} from "./support-ticket-rules";

const ACTIVE_STATUSES = ["open", "investigating", "waiting"] as const;

export type AttachmentInput = { mimeType: string; size: number; data: Buffer };

export type TicketOwner = { visitorId?: string | null; userId?: string | null };

function asMinimal(ticket: { status: string; waitingSince: Date | null; firstReplyAt: Date | null; lastAdminReplyAt: Date | null; solvedAt: Date | null; closedAt: Date | null }): MinimalTicket {
  return ticket as unknown as MinimalTicket;
}

function ticketOwned(ticket: { userId: string | null; conversation: { visitorId: string } }, owner: TicketOwner): boolean {
  if (owner.userId && ticket.userId === owner.userId) return true;
  if (owner.visitorId && ticket.conversation.visitorId === owner.visitorId) return true;
  return false;
}

function adminLink(ticketId: string) {
  return `${process.env.NEXTAUTH_URL || "https://wazap.lt"}/admin/crm/support?ticket=${encodeURIComponent(ticketId)}`;
}

async function uniqueTicketNumber(tx: Prisma.TransactionClient): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const candidate = generateTicketNumber();
    const exists = await tx.supportTicket.findUnique({ where: { number: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  throw new Error("Could not generate a unique ticket number.");
}

export type CreateTicketInput = {
  visitorId: string;
  topic: string;
  subtopic?: string | null;
  message: string;
  quickAnswerId?: string | null;
  userId?: string | null;
  differentProblem?: boolean;
  attachment?: AttachmentInput;
  /** Set when this ticket replaces a closed one the customer started "Start new ticket" from. Purely informational (lineage), never changes limits or the open-ticket-per-topic check. */
  parentTicketId?: string | null;
};

export type CreateTicketOutcome =
  | { kind: "created"; ticket: { id: string; number: string; topic: TicketTopic; status: TicketStatus; urgent: boolean; createdAt: string } }
  | { kind: "existing"; existing: { id: string; number: string } }
  | { kind: "error"; status: number; error: string };

/**
 * Creates a ticket (or returns the customer's existing open ticket for the
 * same topic, unless differentProblem is set). Validates the visitor's
 * captured profile, the daily/open-ticket limits (urgent topics bypass
 * both), creates the first customer message plus a "Ticket received"
 * system message, and queues exactly one customer email and one staff
 * alert.
 */
export async function createTicket(input: CreateTicketInput): Promise<CreateTicketOutcome> {
  const visitorId = input.visitorId.trim().slice(0, 120);
  const message = input.message.trim().slice(0, 4000);
  if (!message && !input.attachment) return { kind: "error", status: 400, error: "A message is required." };
  if (!["payment", "link", "account", "other"].includes(input.topic)) return { kind: "error", status: 400, error: "Choose a valid topic." };

  const profile = await capturedChat(visitorId);
  if (!profile) return { kind: "error", status: 422, error: "Please enter your name, email and phone number before starting chat." };

  if (!input.differentProblem) {
    const existingOpen = await prisma.supportTicket.findFirst({
      where: { conversationId: profile.id, topic: input.topic, status: { in: [...ACTIVE_STATUSES] } },
      orderBy: { createdAt: "desc" },
      select: { id: true, number: true },
    });
    if (existingOpen) return { kind: "existing", existing: existingOpen };
  }

  const ownerWhere: Prisma.SupportTicketWhereInput = input.userId
    ? { userId: input.userId }
    : profile.email
      ? { conversation: { email: profile.email } }
      : { conversation: { visitorId } };
  const since = new Date(Date.now() - 86_400_000);
  const [createdToday, openCount] = await Promise.all([
    prisma.supportTicket.count({ where: { ...ownerWhere, createdAt: { gte: since } } }),
    prisma.supportTicket.count({ where: { ...ownerWhere, status: { in: [...ACTIVE_STATUSES] } } }),
  ]);
  const allowed = ticketCreateAllowed({ createdToday, openCount, topic: input.topic });
  if (!allowed.ok) return { kind: "error", status: 429, error: allowed.reason };

  const user = input.userId
    ? await prisma.user.findUnique({ where: { id: input.userId }, select: { plan: true, planExpiresAt: true, trialStartedAt: true, trialEndsAt: true, trialPlan: true } })
    : null;
  const priority = user ? linkPlan(user) === "ultimate" : false;
  const urgent = isUrgent(input.topic, input.subtopic);
  const topicLabel = ticketTopicLabel(input.topic);

  const ticket = await prisma.$transaction(async tx => {
    const number = await uniqueTicketNumber(tx);
    const created = await tx.supportTicket.create({
      data: {
        number,
        conversationId: profile.id,
        userId: input.userId || null,
        topic: input.topic,
        urgent,
        priority,
        quickAnswerId: input.quickAnswerId || null,
        parentTicketId: input.parentTicketId || null,
        waitingSince: new Date(),
      },
    });

    const customerMessage = await tx.supportChatMessage.create({
      data: { conversationId: profile.id, ticketId: created.id, sender: "visitor", body: message || "📎 Screenshot", readByVisitor: true },
    });
    if (input.attachment) {
      await tx.supportAttachment.create({ data: { conversationId: profile.id, messageId: customerMessage.id, ...input.attachment } });
    }
    await tx.supportChatMessage.create({
      data: {
        conversationId: profile.id,
        ticketId: created.id,
        sender: "bot",
        body: `Ticket #${number} received. We'll reply within ${SUPPORT_REPLY_TARGET_HOURS} hours. You'll get an email when we reply.`,
        readByAdmin: false,
        readByVisitor: true,
      },
    });

    if (input.userId) await tx.supportConversation.update({ where: { id: profile.id }, data: { userId: input.userId } });

    if (profile.email) {
      // At most one "Ticket received" email per recipient per hour - the
      // ticket is still created either way, this only guards against
      // flooding the customer's own inbox (e.g. a burst of tickets from one
      // address, urgent topics included, since those bypass the ticket
      // limits above).
      const recipient = profile.email.toLowerCase();
      const recentEmails = await tx.outboundEmail.count({
        where: { recipient, type: "support_ticket_created", createdAt: { gte: new Date(Date.now() - 3_600_000) } },
      });
      if (recentEmails === 0) {
        const subject = `Ticket #${number} received`;
        await tx.outboundEmail.create({
          data: {
            userId: input.userId || null,
            recipient,
            type: "support_ticket_created",
            subject,
            html: serviceEmail({
              subject,
              heading: subject,
              body: `We've got your ${topicLabel.toLowerCase()} ticket #${number}.\n\nWe'll reply within ${SUPPORT_REPLY_TARGET_HOURS} hours, here and by email.`,
              channel: "support",
            }),
          },
        });
      }
    }

    await queueSupportAlert(
      {
        eventKey: "ticket:" + created.id,
        name: profile.name,
        email: profile.email,
        subject: `${urgent ? "URGENT: " : ""}New ticket #${number} — ${topicLabel}`,
        message,
        link: adminLink(created.id),
      },
      tx,
    );

    return created;
  });

  await notifySupportChatTelegram({ name: profile.name, email: profile.email, message, ticketId: ticket.id, ticketNumber: ticket.number });

  return {
    kind: "created",
    ticket: { id: ticket.id, number: ticket.number, topic: ticket.topic as TicketTopic, status: ticket.status as TicketStatus, urgent: ticket.urgent, createdAt: ticket.createdAt.toISOString() },
  };
}

export type AddCustomerMessageOutcome =
  | { kind: "ok"; ticketId: string; messageId: string; status: TicketStatus }
  | { kind: "error"; status: number; error: string };

/** A customer message on an existing ticket. Ownership-checked (visitor cookie OR logged-in userId). */
export async function addCustomerMessage(ticketId: string, owner: TicketOwner, text: string, attachment?: AttachmentInput): Promise<AddCustomerMessageOutcome> {
  const message = text.trim().slice(0, 4000);
  if (!message && !attachment) return { kind: "error", status: 400, error: "A message is required." };

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { conversation: true } });
  if (!ticket || !ticketOwned(ticket, owner)) return { kind: "error", status: 404, error: "Ticket not found." };

  const now = new Date();
  const transition = applyCustomerMessage(asMinimal(ticket), now);
  if (!transition.ok) return { kind: "error", status: 409, error: transition.reason };

  const shouldAlert = ticket.status === "waiting" || ticket.status === "solved";

  const result = await prisma.$transaction(async tx => {
    const created = await tx.supportChatMessage.create({
      data: { conversationId: ticket.conversationId, ticketId: ticket.id, sender: "visitor", body: message || "📎 Screenshot", readByVisitor: true },
    });
    if (attachment) await tx.supportAttachment.create({ data: { conversationId: ticket.conversationId, messageId: created.id, ...attachment } });

    await tx.supportTicket.update({ where: { id: ticket.id }, data: { status: transition.status, waitingSince: transition.waitingSince } });

    if (shouldAlert) {
      await queueSupportAlert(
        {
          eventKey: `ticket-reopen:${ticket.id}:${created.id}`,
          name: ticket.conversation.name,
          email: ticket.conversation.email,
          subject: ticket.status === "solved" ? `Ticket #${ticket.number} reopened by customer` : `Customer replied on ticket #${ticket.number}`,
          message,
          link: adminLink(ticket.id),
        },
        tx,
      );
    }

    return created;
  });

  return { kind: "ok", ticketId: ticket.id, messageId: result.id, status: transition.status };
}

export type StaffReplyOutcome = { kind: "ok"; ticketId: string } | { kind: "error"; status: number; error: string };

/** Admin reply. Auto-assigns to the replier if unassigned. Only sends a customer email immediately when nextStatus is "solved" - otherwise the monitor sends a "new reply" email if unseen after 15 minutes. */
export async function staffReply(ticketId: string, adminUserId: string, text: string, nextStatus: StaffReplyNextStatus = "waiting", attachment?: AttachmentInput): Promise<StaffReplyOutcome> {
  const { body, emailText } = adminReplyContent(text, Boolean(attachment));
  if (!body) return { kind: "error", status: 400, error: "Missing message or attachment." };

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { conversation: true } });
  if (!ticket) return { kind: "error", status: 404, error: "Ticket not found." };

  const now = new Date();
  const transition = applyStaffReply(asMinimal(ticket), nextStatus, now);

  await prisma.$transaction(async tx => {
    const created = await tx.supportChatMessage.create({ data: { conversationId: ticket.conversationId, ticketId: ticket.id, sender: "admin", body, readByAdmin: true } });
    if (attachment) await tx.supportAttachment.create({ data: { conversationId: ticket.conversationId, messageId: created.id, ...attachment } });

    await tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: transition.status,
        waitingSince: transition.waitingSince,
        firstReplyAt: transition.firstReplyAt,
        lastAdminReplyAt: transition.lastAdminReplyAt,
        solvedAt: transition.solvedAt,
        assignedToId: ticket.assignedToId || adminUserId,
        // The solved email goes out immediately below, so mark it as
        // already sent - otherwise the monitor's "new reply" job would see
        // this same reply as unseen 15 minutes later and send a second,
        // redundant email on top of the solved one.
        ...(nextStatus === "solved" ? { lastCustomerEmailAt: now } : {}),
      },
    });

    if (ticket.conversation.crmLeadId) {
      await tx.crmActivity.create({ data: { leadId: ticket.conversation.crmLeadId, kind: "support_reply", body: `Ticket #${ticket.number} reply: ${body}` } });
    }

    if (nextStatus === "solved" && ticket.conversation.email) {
      const subject = `Ticket #${ticket.number} solved`;
      await tx.outboundEmail.create({
        data: {
          userId: ticket.userId,
          recipient: ticket.conversation.email.toLowerCase(),
          type: "support_ticket_solved",
          subject,
          html: serviceEmail({
            subject,
            heading: subject,
            body: `${emailText}\n\n${reopenTicketText({ visitorId: ticket.conversation.visitorId, ticketNumber: ticket.number, userId: ticket.userId, base: process.env.NEXTAUTH_URL || "https://wazap.lt" })}`,
            channel: "support",
          }),
        },
      });
    }
  });

  return { kind: "ok", ticketId: ticket.id };
}

export type SetTicketStatusOutcome = { kind: "ok" } | { kind: "error"; status: number; error: string };

/**
 * Admin status change via the PATCH action (as opposed to staffReply, which
 * changes status as a side effect of replying). Mirrors staffReply's
 * "solved" handling so the two paths stay consistent: solved clears
 * waitingSince, queues the solved email once (skipped if it was already
 * solved, so flipping the status back and forth doesn't re-send it) and
 * marks lastCustomerEmailAt so the monitor doesn't also send a "new reply"
 * email for the same event. Moving to "waiting" by hand (not via a reply)
 * sets lastAdminReplyAt if it was never set, so autoSolveDue has a clock to
 * measure from. Returns a 404-shaped error for an unknown ticketId instead
 * of letting Prisma throw.
 */
export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<SetTicketStatusOutcome> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { conversation: true } });
  if (!ticket) return { kind: "error", status: 404, error: "Ticket not found." };

  const now = new Date();
  const data: Prisma.SupportTicketUpdateInput = { status };
  if (status === "solved") {
    data.solvedAt = now;
    data.waitingSince = null;
    data.lastCustomerEmailAt = now;
  }
  if (status === "closed") data.closedAt = now;
  if (status === "waiting" && !ticket.lastAdminReplyAt) data.lastAdminReplyAt = now;

  await prisma.$transaction(async tx => {
    await tx.supportTicket.update({ where: { id: ticketId }, data });

    if (status === "solved" && ticket.status !== "solved" && ticket.conversation.email) {
      const subject = `Ticket #${ticket.number} solved`;
      await tx.outboundEmail.create({
        data: {
          userId: ticket.userId,
          recipient: ticket.conversation.email.toLowerCase(),
          type: "support_ticket_solved",
          subject,
          html: serviceEmail({
            subject,
            heading: subject,
            body: `We've marked ticket #${ticket.number} as solved.\n\n${reopenTicketText({ visitorId: ticket.conversation.visitorId, ticketNumber: ticket.number, userId: ticket.userId, base: process.env.NEXTAUTH_URL || "https://wazap.lt" })}`,
            channel: "support",
          }),
        },
      });
    }
  });

  return { kind: "ok" };
}

/** Marks every visitor message on this ticket as read by staff - mirrors the conversation-level readByAdmin marking the old chat inbox already does on open (see the legacy PATCH branch in app/api/admin/support/route.ts). staffReply() does not do this itself, since replying doesn't necessarily mean every earlier message was read. updateMany (not update) so an unknown ticketId is a no-op instead of a thrown error. */
export async function markTicketReadByAdmin(ticketId: string): Promise<boolean> {
  const exists = await prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true } });
  if (!exists) return false;
  await prisma.supportChatMessage.updateMany({ where: { ticketId, sender: "visitor", readByAdmin: false }, data: { readByAdmin: true } });
  return true;
}

/** updateMany (not update): an unknown ticketId is a no-op (count 0) instead of a thrown P2025, so callers can turn that into a friendly 404 rather than a 500. */
export async function setTicketUrgent(ticketId: string, urgent: boolean): Promise<boolean> {
  const result = await prisma.supportTicket.updateMany({ where: { id: ticketId }, data: { urgent } });
  return result.count > 0;
}

export async function assignTicket(ticketId: string, adminUserId: string | null): Promise<boolean> {
  const result = await prisma.supportTicket.updateMany({ where: { id: ticketId }, data: { assignedToId: adminUserId } });
  return result.count > 0;
}

/** Admin reopen: always allowed, no 7-day window (that's reopenByCustomer's rule). */
export async function reopenTicketByAdmin(ticketId: string): Promise<boolean> {
  const result = await prisma.supportTicket.updateMany({ where: { id: ticketId }, data: { status: "open", solvedAt: null, closedAt: null, waitingSince: new Date() } });
  return result.count > 0;
}

export type ReopenOutcome = { kind: "ok" } | { kind: "error"; status: number; error: string };

/** Customer reopen of a solved ticket, only within the 7-day window. */
export async function reopenByCustomer(ticketId: string, owner: TicketOwner): Promise<ReopenOutcome> {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: { conversation: true } });
  if (!ticket || !ticketOwned(ticket, owner)) return { kind: "error", status: 404, error: "Ticket not found." };
  if (!canReopen(asMinimal(ticket))) return { kind: "error", status: 409, error: "This ticket can no longer be reopened. Please start a new ticket." };

  const now = new Date();
  await prisma.$transaction(async tx => {
    await tx.supportTicket.update({ where: { id: ticketId }, data: { status: "open", waitingSince: now } });
    await queueSupportAlert(
      {
        // Includes `now` so every reopen gets its own eventKey - a fixed
        // string here would mean only the FIRST ever reopen of a given
        // ticket alerted the team (queueSupportAlert dedupes by eventKey).
        eventKey: `ticket-reopen:${ticketId}:customer:${now.toISOString()}`,
        name: ticket.conversation.name,
        email: ticket.conversation.email,
        subject: `Ticket #${ticket.number} reopened by customer`,
        message: "Customer reopened this solved ticket.",
        link: adminLink(ticketId),
      },
      tx,
    );
  });

  return { kind: "ok" };
}

export type PublicTicketSummary = {
  id: string;
  number: string;
  topic: string;
  status: string;
  urgent: boolean;
  createdAt: string;
  updatedAt: string;
  solvedAt: string | null;
  canReopen: boolean;
  unread: number;
};

/** Every ticket this visitor (and, if logged in, this user) owns - never anyone else's. */
export async function listTicketsForOwner(owner: TicketOwner): Promise<PublicTicketSummary[]> {
  if (!owner.visitorId && !owner.userId) return [];
  const where: Prisma.SupportTicketWhereInput = owner.userId
    ? { OR: [{ conversation: { visitorId: owner.visitorId || "__none__" } }, { userId: owner.userId }] }
    : { conversation: { visitorId: owner.visitorId || "__none__" } };

  const tickets = await prisma.supportTicket.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { messages: { where: { sender: "admin" }, select: { readByVisitor: true } } },
  });

  const now = new Date();
  return tickets.map(t => ({
    id: t.id,
    number: t.number,
    topic: t.topic,
    status: t.status,
    urgent: t.urgent,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    solvedAt: t.solvedAt?.toISOString() || null,
    canReopen: canReopen(asMinimal(t), now),
    unread: t.messages.filter(m => !m.readByVisitor).length,
  }));
}

export type PublicTicketDetail = PublicTicketSummary & {
  messages: { id: string; sender: string; body: string; createdAt: string; attachments: { id: string; mimeType: string }[] }[];
};

/** Full ticket + messages, ownership-checked. Marks admin messages as read by the visitor. */
export async function getTicketDetail(ticketId: string, owner: TicketOwner): Promise<PublicTicketDetail | null> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { conversation: true, messages: { orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, mimeType: true } } } } },
  });
  if (!ticket || !ticketOwned(ticket, owner)) return null;

  await prisma.supportChatMessage.updateMany({ where: { ticketId, sender: "admin", readByVisitor: false }, data: { readByVisitor: true } });

  return {
    id: ticket.id,
    number: ticket.number,
    topic: ticket.topic,
    status: ticket.status,
    urgent: ticket.urgent,
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    solvedAt: ticket.solvedAt?.toISOString() || null,
    canReopen: canReopen(asMinimal(ticket)),
    // Fetching the detail just marked every admin message as read above, so
    // there is nothing left unread by definition.
    unread: 0,
    messages: ticket.messages.map(m => ({ id: m.id, sender: m.sender, body: m.body, createdAt: m.createdAt.toISOString(), attachments: m.attachments })),
  };
}

/** Count of admin messages not yet read by the visitor, across every ticket they own - cheap query for the widget bubble's red dot. */
export async function unreadCountForOwner(owner: TicketOwner): Promise<number> {
  if (!owner.visitorId && !owner.userId) return 0;
  const ticketWhere: Prisma.SupportTicketWhereInput = owner.userId
    ? { OR: [{ conversation: { visitorId: owner.visitorId || "__none__" } }, { userId: owner.userId }] }
    : { conversation: { visitorId: owner.visitorId || "__none__" } };
  return prisma.supportChatMessage.count({ where: { sender: "admin", readByVisitor: false, ticket: ticketWhere } });
}

export type AdminTicketMessage = { id: string; sender: string; body: string; readByAdmin: boolean; readByVisitor: boolean; createdAt: string; attachments: { id: string; mimeType: string }[] };

/**
 * Full message history for one ticket, for the admin detail panel - no
 * ownership check (the caller, app/api/admin/support/route.ts, is already
 * admin-gated). Kept separate from the admin ticket LIST so that list
 * doesn't have to carry every ticket's full history on every ~15s poll;
 * see app/api/admin/support/route.ts's getTickets(), which only sends a
 * short preview per ticket.
 */
export async function getTicketMessagesForAdmin(ticketId: string): Promise<AdminTicketMessage[] | null> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { messages: { orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, mimeType: true } } } } },
  });
  if (!ticket) return null;
  return ticket.messages.map(m => ({ id: m.id, sender: m.sender, body: m.body, readByAdmin: m.readByAdmin, readByVisitor: m.readByVisitor, createdAt: m.createdAt.toISOString(), attachments: m.attachments }));
}
