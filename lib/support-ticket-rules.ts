// Pure rules for the support ticket system (SUPPORT-2, "no AI"). No DB/IO
// here on purpose - see lib/support-tickets.ts for the Prisma-backed service
// that applies these, and lib/__tests__/support-ticket-rules.test.ts for
// coverage.
import { randomInt } from "node:crypto";

// Avoids 0/O/1/I so a spoken-aloud or handwritten ticket number is never
// ambiguous.
const TICKET_NUMBER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TICKET_NUMBER_LENGTH = 6;

export type TicketTopic = "payment" | "link" | "account" | "other";
export const TICKET_TOPICS: TicketTopic[] = ["payment", "link", "account", "other"];
export const TICKET_TOPIC_LABELS: Record<TicketTopic, string> = {
  payment: "Payment",
  link: "Link not working",
  account: "Account/login",
  other: "Other",
};
export function ticketTopicLabel(topic: string): string {
  return TICKET_TOPIC_LABELS[topic as TicketTopic] || topic;
}

export type TicketStatus = "open" | "investigating" | "waiting" | "solved" | "closed";

export const REOPEN_WINDOW_MS = 7 * 86_400_000;
export const AUTO_SOLVE_AFTER_MS = 7 * 86_400_000;
export const CLOSE_AFTER_SOLVED_MS = 7 * 86_400_000;
export const URGENT_ESCALATION_AFTER_MS = 2 * 3_600_000;
export const OVERDUE_AFTER_MS = 12 * 3_600_000;

export const MAX_NEW_TICKETS_PER_DAY = 3;
export const MAX_OPEN_TICKETS = 3;
export const MAX_MESSAGES_PER_MINUTE = 5;
// Urgent topics (payment, link) bypass the daily/open-ticket limits below,
// but nothing bypasses this - a hard ceiling so a script (or a very
// determined visitor) can't email-bomb the team or the customer's own inbox
// via repeated "Ticket received" emails. Counted per owner the same way as
// the other limits (userId, else conversation email, else visitorId).
export const MAX_NEW_TICKETS_PER_DAY_HARD_CAP = 10;

/** A random generator shaped like crypto.randomInt(max): returns an integer in [0, max). */
export type RandomIntFn = (max: number) => number;

function defaultRandomInt(max: number): number {
  return randomInt(max);
}

/** 6 chars from an alphabet that avoids 0/O/1/I, e.g. "A1B2C3" -> never actually contains 1/0/I/O. */
export function generateTicketNumber(random: RandomIntFn = defaultRandomInt): string {
  let out = "";
  for (let i = 0; i < TICKET_NUMBER_LENGTH; i++) out += TICKET_NUMBER_ALPHABET[random(TICKET_NUMBER_ALPHABET.length)];
  return out;
}

export type MinimalTicket = {
  status: TicketStatus;
  waitingSince: Date | string | null;
  firstReplyAt: Date | string | null;
  lastAdminReplyAt: Date | string | null;
  solvedAt: Date | string | null;
  closedAt: Date | string | null;
};

export type CustomerMessageTransition =
  | { ok: true; status: TicketStatus; waitingSince: Date }
  | { ok: false; reason: string };

/**
 * A customer message's effect on ticket status. waiting/solved -> open
 * (solved only within the reopen window, otherwise rejected as closed-style
 * - the caller should direct the customer to "start new ticket" when a
 * solved ticket is past reopen, same message as closed); open/investigating
 * stay as they are; closed is always rejected. waitingSince is set to `now`
 * only when it was not already set (first unanswered message starts the
 * clock; a later message in the same unanswered streak doesn't reset it).
 */
export function applyCustomerMessage(ticket: MinimalTicket, now: Date = new Date()): CustomerMessageTransition {
  if (ticket.status === "closed") return { ok: false, reason: "This ticket is closed. Start a new ticket." };
  if (ticket.status === "solved") {
    if (!canReopen(ticket, now)) return { ok: false, reason: "This ticket is closed. Start a new ticket." };
    return { ok: true, status: "open", waitingSince: ticket.waitingSince ? new Date(ticket.waitingSince) : now };
  }
  // waiting | open | investigating
  const status: TicketStatus = ticket.status === "waiting" ? "open" : ticket.status;
  return { ok: true, status, waitingSince: ticket.waitingSince ? new Date(ticket.waitingSince) : now };
}

export type StaffReplyNextStatus = "waiting" | "investigating" | "solved";

export type StaffReplyTransition = {
  status: StaffReplyNextStatus;
  waitingSince: null;
  firstReplyAt: Date;
  lastAdminReplyAt: Date;
  solvedAt: Date | null;
};

/** A staff reply's effect: always clears waitingSince, sets firstReplyAt (if not already set) and lastAdminReplyAt, and sets solvedAt when the chosen next status is "solved". */
export function applyStaffReply(ticket: MinimalTicket, nextStatus: StaffReplyNextStatus = "waiting", now: Date = new Date()): StaffReplyTransition {
  return {
    status: nextStatus,
    waitingSince: null,
    firstReplyAt: ticket.firstReplyAt ? new Date(ticket.firstReplyAt) : now,
    lastAdminReplyAt: now,
    solvedAt: nextStatus === "solved" ? now : null,
  };
}

/** Solved, and still within the 7-day reopen window. */
export function canReopen(ticket: Pick<MinimalTicket, "status" | "solvedAt">, now: Date = new Date()): boolean {
  if (ticket.status !== "solved" || !ticket.solvedAt) return false;
  return now.getTime() - new Date(ticket.solvedAt).getTime() <= REOPEN_WINDOW_MS;
}

/** waiting, with no admin reply in the last 7 days (never from investigating). */
export function autoSolveDue(ticket: Pick<MinimalTicket, "status" | "lastAdminReplyAt">, now: Date = new Date()): boolean {
  if (ticket.status !== "waiting" || !ticket.lastAdminReplyAt) return false;
  return now.getTime() - new Date(ticket.lastAdminReplyAt).getTime() >= AUTO_SOLVE_AFTER_MS;
}

/** solved, and solved at least 7 days ago. */
export function closeDue(ticket: Pick<MinimalTicket, "status" | "solvedAt">, now: Date = new Date()): boolean {
  if (ticket.status !== "solved" || !ticket.solvedAt) return false;
  return now.getTime() - new Date(ticket.solvedAt).getTime() >= CLOSE_AFTER_SOLVED_MS;
}

export function isOverdue(waitingSince: Date | string | null, now: Date = new Date()): boolean {
  if (!waitingSince) return false;
  return now.getTime() - new Date(waitingSince).getTime() >= OVERDUE_AFTER_MS;
}

export type UrgentTopic = "payment" | "link";
const URGENT_TOPICS = new Set<string>(["payment", "link"]);

/**
 * "payment" and "link" (link not working) are always urgent regardless of
 * subtopic. "account"/"other" are not urgent from the topic alone - they
 * only become urgent when the personal-facts check
 * (lib/support-quick-answers.ts suggestUrgentTicket) found a real problem,
 * which the caller passes in as `foundRealProblem`. `subtopic` is accepted
 * for callers that have one at hand but is not currently used to decide
 * urgency - every payment/link ticket is urgent either way.
 */
export function isUrgent(topic: string, subtopic?: string | null, foundRealProblem = false): boolean {
  if (URGENT_TOPICS.has(topic)) return true;
  return foundRealProblem;
}

export type SortableTicket = {
  id: string;
  status: TicketStatus;
  urgent: boolean;
  priority: boolean;
  waitingSince: Date | string | null;
  updatedAt: Date | string;
};

const ACTIVE_STATUSES = new Set<TicketStatus>(["open", "investigating"]);

/**
 * Admin inbox order: urgent first -> overdue (waitingSince older than 12h)
 * -> longest waitingSince -> priority (Agency) -> newest updated. Every
 * open/investigating ticket sorts before every waiting/solved/closed one.
 */
export function compareTicketsForAdmin(a: SortableTicket, b: SortableTicket, now: Date = new Date()): number {
  const aActive = ACTIVE_STATUSES.has(a.status);
  const bActive = ACTIVE_STATUSES.has(b.status);
  if (aActive !== bActive) return aActive ? -1 : 1;

  if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;

  const aOverdue = isOverdue(a.waitingSince, now);
  const bOverdue = isOverdue(b.waitingSince, now);
  if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;

  const aWaiting = a.waitingSince ? new Date(a.waitingSince).getTime() : null;
  const bWaiting = b.waitingSince ? new Date(b.waitingSince).getTime() : null;
  if (aWaiting !== bWaiting) {
    if (aWaiting === null) return 1;
    if (bWaiting === null) return -1;
    return aWaiting - bWaiting; // older (longer waiting) first
  }

  if (a.priority !== b.priority) return a.priority ? -1 : 1;

  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(); // newest first
}

export type TicketCreateCheckInput = {
  createdToday: number;
  openCount: number;
  topic: string;
};

export type TicketCreateCheck = { ok: true } | { ok: false; reason: string };

/**
 * Max 3 new tickets per 24h and max 3 open tickets per customer, both
 * bypassed for urgent topics (payment, link) - except the hard cap of
 * MAX_NEW_TICKETS_PER_DAY_HARD_CAP per 24h, which applies to every topic,
 * urgent or not, and is checked first. The two softer checks below remain
 * independent - either one failing blocks creation.
 */
export function ticketCreateAllowed(input: TicketCreateCheckInput): TicketCreateCheck {
  if (input.createdToday >= MAX_NEW_TICKETS_PER_DAY_HARD_CAP) {
    return { ok: false, reason: `You've reached the daily limit of ${MAX_NEW_TICKETS_PER_DAY_HARD_CAP} tickets. Please wait a bit, or add to one of your existing tickets.` };
  }
  if (URGENT_TOPICS.has(input.topic)) return { ok: true };
  if (input.createdToday >= MAX_NEW_TICKETS_PER_DAY) {
    return { ok: false, reason: `You can open ${MAX_NEW_TICKETS_PER_DAY} tickets a day. Please add to your existing ticket.` };
  }
  if (input.openCount >= MAX_OPEN_TICKETS) {
    return { ok: false, reason: `You can have ${MAX_OPEN_TICKETS} open tickets at a time. Please add to one of your existing tickets.` };
  }
  return { ok: true };
}

export const MESSAGE_BURST_TEXT = "You're sending messages quickly. Please wait a few seconds.";

export type ReplyEmailDueInput = {
  lastAdminReplyAt: Date | string | null;
  /** Latest time the visitor has read (readByVisitor) an admin message, or null if none/unread. */
  lastSeenAt: Date | string | null;
  lastCustomerEmailAt: Date | string | null;
  now: Date;
};

const REPLY_EMAIL_UNSEEN_AFTER_MS = 15 * 60_000;
const REPLY_EMAIL_THROTTLE_MS = 3 * 3_600_000;

/**
 * Decides whether the customer should get a "new reply" email: there is an
 * admin reply the visitor has not yet seen (lastSeenAt is before
 * lastAdminReplyAt, or null), it has been unseen for >= 15 minutes, and we
 * have NOT already emailed about this reply (lastCustomerEmailAt is null,
 * or it predates this lastAdminReplyAt - once lastCustomerEmailAt catches up
 * to a reply, no second email fires for that same reply, however much time
 * passes). The 3h throttle is an extra guard on top of that, in case of
 * several replies in quick succession: still at most one email per 3h.
 * Callers are expected to only pass tickets whose status is
 * open|investigating|waiting - never solved/closed (see
 * lib/support-monitor.ts's query).
 */
export function replyEmailDue(input: ReplyEmailDueInput): boolean {
  if (!input.lastAdminReplyAt) return false;
  const lastAdminReplyAt = new Date(input.lastAdminReplyAt).getTime();
  const seen = input.lastSeenAt ? new Date(input.lastSeenAt).getTime() : null;
  if (seen !== null && seen >= lastAdminReplyAt) return false; // already seen
  if (input.now.getTime() - lastAdminReplyAt < REPLY_EMAIL_UNSEEN_AFTER_MS) return false;
  const lastEmail = input.lastCustomerEmailAt ? new Date(input.lastCustomerEmailAt).getTime() : null;
  if (lastEmail !== null) {
    if (lastEmail >= lastAdminReplyAt) return false; // already emailed about this reply (or a later one)
    if (input.now.getTime() - lastEmail <= REPLY_EMAIL_THROTTLE_MS) return false; // 3h guard, even across replies
  }
  return true;
}

/** WhatsApp support is a perk of the Growth ("pro") and Agency ("ultimate") plans. Takes the resolved link plan (lib/router-entitlements.ts linkPlan). */
export function whatsappSupportEligible(linkPlanKey: string): boolean {
  return linkPlanKey === "pro" || linkPlanKey === "ultimate";
}
