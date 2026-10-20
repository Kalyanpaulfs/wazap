import { describe, expect, it } from "vitest";
import {
  AUTO_SOLVE_AFTER_MS,
  CLOSE_AFTER_SOLVED_MS,
  MAX_MESSAGES_PER_MINUTE,
  MAX_NEW_TICKETS_PER_DAY,
  MAX_NEW_TICKETS_PER_DAY_HARD_CAP,
  MAX_OPEN_TICKETS,
  MESSAGE_BURST_TEXT,
  OVERDUE_AFTER_MS,
  REOPEN_WINDOW_MS,
  TICKET_NUMBER_LENGTH,
  URGENT_ESCALATION_AFTER_MS,
  applyCustomerMessage,
  applyStaffReply,
  autoSolveDue,
  canReopen,
  closeDue,
  compareTicketsForAdmin,
  generateTicketNumber,
  isOverdue,
  isUrgent,
  replyEmailDue,
  ticketCreateAllowed,
  ticketTopicLabel,
  type MinimalTicket,
} from "@/lib/support-ticket-rules";

function minimal(overrides: Partial<MinimalTicket> = {}): MinimalTicket {
  return {
    status: "open",
    waitingSince: null,
    firstReplyAt: null,
    lastAdminReplyAt: null,
    solvedAt: null,
    closedAt: null,
    ...overrides,
  };
}

describe("generateTicketNumber", () => {
  it("generates 6 characters from the ambiguity-free alphabet (no 0/O/1/I)", () => {
    for (let i = 0; i < 200; i++) {
      const number = generateTicketNumber();
      expect(number).toHaveLength(TICKET_NUMBER_LENGTH);
      expect(number).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    }
  });

  it("uses the injected random function", () => {
    const number = generateTicketNumber(() => 0);
    expect(number).toBe("AAAAAA");
  });
});

describe("applyCustomerMessage", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("rejects a closed ticket", () => {
    const result = applyCustomerMessage(minimal({ status: "closed" }), now);
    expect(result).toEqual({ ok: false, reason: "This ticket is closed. Start a new ticket." });
  });

  it("reopens a solved ticket within the 7-day window", () => {
    const solvedAt = new Date(now.getTime() - 2 * 86_400_000);
    const result = applyCustomerMessage(minimal({ status: "solved", solvedAt }), now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status).toBe("open");
  });

  it("rejects a solved ticket past the 7-day reopen window", () => {
    const solvedAt = new Date(now.getTime() - 8 * 86_400_000);
    const result = applyCustomerMessage(minimal({ status: "solved", solvedAt }), now);
    expect(result).toEqual({ ok: false, reason: "This ticket is closed. Start a new ticket." });
  });

  it("moves waiting to open and starts waitingSince when it was null", () => {
    const result = applyCustomerMessage(minimal({ status: "waiting", waitingSince: null }), now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("open");
      expect(result.waitingSince).toEqual(now);
    }
  });

  it("leaves open unchanged and does not reset an existing waitingSince", () => {
    const waitingSince = new Date(now.getTime() - 3600_000);
    const result = applyCustomerMessage(minimal({ status: "open", waitingSince }), now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.status).toBe("open");
      expect(result.waitingSince).toEqual(waitingSince);
    }
  });

  it("leaves investigating unchanged", () => {
    const result = applyCustomerMessage(minimal({ status: "investigating", waitingSince: null }), now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status).toBe("investigating");
  });
});

describe("applyStaffReply", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("defaults to waiting, clears waitingSince, sets firstReplyAt and lastAdminReplyAt", () => {
    const result = applyStaffReply(minimal({ waitingSince: new Date(), firstReplyAt: null }), undefined, now);
    expect(result.status).toBe("waiting");
    expect(result.waitingSince).toBeNull();
    expect(result.firstReplyAt).toEqual(now);
    expect(result.lastAdminReplyAt).toEqual(now);
    expect(result.solvedAt).toBeNull();
  });

  it("does not overwrite an existing firstReplyAt", () => {
    const firstReplyAt = new Date(now.getTime() - 86_400_000);
    const result = applyStaffReply(minimal({ firstReplyAt }), "investigating", now);
    expect(result.firstReplyAt).toEqual(firstReplyAt);
    expect(result.status).toBe("investigating");
  });

  it("sets solvedAt only when the next status is solved", () => {
    const result = applyStaffReply(minimal(), "solved", now);
    expect(result.status).toBe("solved");
    expect(result.solvedAt).toEqual(now);
  });
});

describe("canReopen", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("is false for a non-solved ticket", () => {
    expect(canReopen({ status: "open", solvedAt: null }, now)).toBe(false);
  });

  it("is true within 7 days of solvedAt", () => {
    expect(canReopen({ status: "solved", solvedAt: new Date(now.getTime() - REOPEN_WINDOW_MS + 1000) }, now)).toBe(true);
  });

  it("is false past the 7-day window", () => {
    expect(canReopen({ status: "solved", solvedAt: new Date(now.getTime() - REOPEN_WINDOW_MS - 1000) }, now)).toBe(false);
  });
});

describe("autoSolveDue", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("is true only for waiting, >= 7 days since the last admin reply", () => {
    expect(autoSolveDue({ status: "waiting", lastAdminReplyAt: new Date(now.getTime() - AUTO_SOLVE_AFTER_MS) }, now)).toBe(true);
    expect(autoSolveDue({ status: "waiting", lastAdminReplyAt: new Date(now.getTime() - AUTO_SOLVE_AFTER_MS + 1000) }, now)).toBe(false);
  });

  it("never fires from investigating, even after 7 days", () => {
    expect(autoSolveDue({ status: "investigating", lastAdminReplyAt: new Date(now.getTime() - AUTO_SOLVE_AFTER_MS - 1000) }, now)).toBe(false);
  });

  it("is false without a lastAdminReplyAt", () => {
    expect(autoSolveDue({ status: "waiting", lastAdminReplyAt: null }, now)).toBe(false);
  });
});

describe("closeDue", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("is true only for solved, >= 7 days since solvedAt", () => {
    expect(closeDue({ status: "solved", solvedAt: new Date(now.getTime() - CLOSE_AFTER_SOLVED_MS) }, now)).toBe(true);
    expect(closeDue({ status: "solved", solvedAt: new Date(now.getTime() - CLOSE_AFTER_SOLVED_MS + 1000) }, now)).toBe(false);
  });

  it("is false for any other status", () => {
    expect(closeDue({ status: "waiting", solvedAt: new Date(now.getTime() - CLOSE_AFTER_SOLVED_MS) }, now)).toBe(false);
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  it("is false with no waitingSince", () => expect(isOverdue(null, now)).toBe(false));
  it("is true at/after 12 hours", () => {
    expect(isOverdue(new Date(now.getTime() - OVERDUE_AFTER_MS), now)).toBe(true);
    expect(isOverdue(new Date(now.getTime() - OVERDUE_AFTER_MS + 1000), now)).toBe(false);
  });
});

describe("isUrgent", () => {
  it("payment is always urgent", () => expect(isUrgent("payment")).toBe(true));
  it("link is always urgent (link not working)", () => expect(isUrgent("link")).toBe(true));
  it("account/other are not urgent by themselves", () => {
    expect(isUrgent("account")).toBe(false);
    expect(isUrgent("other")).toBe(false);
  });
  it("account/other become urgent when a real problem was found", () => {
    expect(isUrgent("account", null, true)).toBe(true);
    expect(isUrgent("other", null, true)).toBe(true);
  });
});

describe("ticketTopicLabel", () => {
  it("maps every topic to a human label", () => {
    expect(ticketTopicLabel("payment")).toBe("Payment");
    expect(ticketTopicLabel("link")).toBe("Link not working");
    expect(ticketTopicLabel("account")).toBe("Account/login");
    expect(ticketTopicLabel("other")).toBe("Other");
  });
});

describe("compareTicketsForAdmin", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  const base = { id: "x", status: "open" as const, urgent: false, priority: false, waitingSince: null, updatedAt: now };

  it("puts open/investigating before waiting/solved/closed", () => {
    const active = { ...base, id: "a", status: "open" as const };
    const inactive = { ...base, id: "b", status: "waiting" as const };
    expect(compareTicketsForAdmin(active, inactive, now)).toBeLessThan(0);
    expect(compareTicketsForAdmin(inactive, active, now)).toBeGreaterThan(0);
  });

  it("puts urgent before non-urgent", () => {
    const urgent = { ...base, id: "a", urgent: true };
    const normal = { ...base, id: "b", urgent: false };
    expect(compareTicketsForAdmin(urgent, normal, now)).toBeLessThan(0);
  });

  it("puts overdue before non-overdue (within the same urgency)", () => {
    const overdue = { ...base, id: "a", waitingSince: new Date(now.getTime() - OVERDUE_AFTER_MS - 1000) };
    const fresh = { ...base, id: "b", waitingSince: new Date(now.getTime() - 1000) };
    expect(compareTicketsForAdmin(overdue, fresh, now)).toBeLessThan(0);
  });

  it("orders by longest waitingSince within the same overdue bucket", () => {
    const older = { ...base, id: "a", waitingSince: new Date(now.getTime() - 20 * 3600_000) };
    const newer = { ...base, id: "b", waitingSince: new Date(now.getTime() - 13 * 3600_000) };
    expect(compareTicketsForAdmin(older, newer, now)).toBeLessThan(0);
  });

  it("puts priority (Agency) before non-priority when otherwise tied", () => {
    const priority = { ...base, id: "a", priority: true };
    const normal = { ...base, id: "b", priority: false };
    expect(compareTicketsForAdmin(priority, normal, now)).toBeLessThan(0);
  });

  it("falls back to newest updatedAt first", () => {
    const newer = { ...base, id: "a", updatedAt: new Date(now.getTime() - 1000) };
    const older = { ...base, id: "b", updatedAt: new Date(now.getTime() - 5000) };
    expect(compareTicketsForAdmin(newer, older, now)).toBeLessThan(0);
  });
});

describe("ticketCreateAllowed", () => {
  it("allows under both limits", () => {
    expect(ticketCreateAllowed({ createdToday: 0, openCount: 0, topic: "account" })).toEqual({ ok: true });
  });

  it("blocks at the daily limit", () => {
    const result = ticketCreateAllowed({ createdToday: MAX_NEW_TICKETS_PER_DAY, openCount: 0, topic: "account" });
    expect(result.ok).toBe(false);
  });

  it("blocks at the open-ticket limit", () => {
    const result = ticketCreateAllowed({ createdToday: 0, openCount: MAX_OPEN_TICKETS, topic: "other" });
    expect(result.ok).toBe(false);
  });

  it("bypasses the daily and open-ticket limits for urgent topics (payment, link)", () => {
    expect(ticketCreateAllowed({ createdToday: MAX_NEW_TICKETS_PER_DAY_HARD_CAP - 1, openCount: 99, topic: "payment" })).toEqual({ ok: true });
    expect(ticketCreateAllowed({ createdToday: MAX_NEW_TICKETS_PER_DAY_HARD_CAP - 1, openCount: 99, topic: "link" })).toEqual({ ok: true });
  });

  it("the hard cap of 10/day applies even to urgent topics - nothing bypasses it", () => {
    const blockedUrgent = ticketCreateAllowed({ createdToday: MAX_NEW_TICKETS_PER_DAY_HARD_CAP, openCount: 0, topic: "payment" });
    expect(blockedUrgent.ok).toBe(false);
    const blockedNormal = ticketCreateAllowed({ createdToday: MAX_NEW_TICKETS_PER_DAY_HARD_CAP, openCount: 0, topic: "account" });
    expect(blockedNormal.ok).toBe(false);
  });
});

describe("MAX_MESSAGES_PER_MINUTE / MESSAGE_BURST_TEXT", () => {
  it("is 5 messages per minute with a friendly message", () => {
    expect(MAX_MESSAGES_PER_MINUTE).toBe(5);
    expect(MESSAGE_BURST_TEXT).toBe("You're sending messages quickly. Please wait a few seconds.");
  });
});

describe("replyEmailDue", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("is false with no admin reply yet", () => {
    expect(replyEmailDue({ lastAdminReplyAt: null, lastSeenAt: null, lastCustomerEmailAt: null, now })).toBe(false);
  });

  it("is false when the customer has already seen the reply", () => {
    const lastAdminReplyAt = new Date(now.getTime() - 20 * 60_000);
    expect(replyEmailDue({ lastAdminReplyAt, lastSeenAt: new Date(now.getTime() - 5 * 60_000), lastCustomerEmailAt: null, now })).toBe(false);
  });

  it("is false before 15 minutes unseen", () => {
    const lastAdminReplyAt = new Date(now.getTime() - 10 * 60_000);
    expect(replyEmailDue({ lastAdminReplyAt, lastSeenAt: null, lastCustomerEmailAt: null, now })).toBe(false);
  });

  it("is true after 15 minutes unseen with no previous email", () => {
    const lastAdminReplyAt = new Date(now.getTime() - 16 * 60_000);
    expect(replyEmailDue({ lastAdminReplyAt, lastSeenAt: null, lastCustomerEmailAt: null, now })).toBe(true);
  });

  it("is throttled to one email per 3 hours when a new reply follows quickly", () => {
    const lastAdminReplyAt = new Date(now.getTime() - 16 * 60_000);
    // The previous email predates this reply (a newer reply came in after
    // it), so a fresh email is possible in principle, but the 3h guard still
    // blocks it until enough time has passed.
    expect(replyEmailDue({ lastAdminReplyAt, lastSeenAt: null, lastCustomerEmailAt: new Date(now.getTime() - 60 * 60_000), now })).toBe(false);
    expect(replyEmailDue({ lastAdminReplyAt, lastSeenAt: null, lastCustomerEmailAt: new Date(now.getTime() - 3 * 3600_000 - 1000), now })).toBe(true);
  });

  it("never sends a second email for the SAME reply, even long after the 3h throttle window", () => {
    const lastAdminReplyAt = new Date(now.getTime() - 16 * 60_000);
    // The email already sent is AFTER this reply (it was the email for this
    // very reply) - no amount of extra elapsed time should trigger another.
    const lastCustomerEmailAt = new Date(now.getTime() - 15 * 60_000);
    expect(replyEmailDue({ lastAdminReplyAt, lastSeenAt: null, lastCustomerEmailAt, now: new Date(now.getTime() + 10 * 3600_000) })).toBe(false);
  });

  it("allows a new email after a NEW staff reply, once 3h since the last email have passed", () => {
    const earlierReplyAt = new Date(now.getTime() - 5 * 3600_000);
    const earlierEmailAt = new Date(earlierReplyAt.getTime() + 15 * 60_000); // emailed about the earlier reply
    const newReplyAt = new Date(now.getTime() - 20 * 60_000); // a NEW reply, after that email
    expect(replyEmailDue({ lastAdminReplyAt: newReplyAt, lastSeenAt: null, lastCustomerEmailAt: earlierEmailAt, now })).toBe(true);
  });
});

describe("URGENT_ESCALATION_AFTER_MS", () => {
  it("is 2 hours", () => expect(URGENT_ESCALATION_AFTER_MS).toBe(2 * 3600_000));
});

describe("whatsappSupportEligible", () => {
  it("is a Growth and Agency perk only", async () => {
    const { whatsappSupportEligible } = await import("@/lib/support-ticket-rules");
    expect(whatsappSupportEligible("pro")).toBe(true);
    expect(whatsappSupportEligible("ultimate")).toBe(true);
    expect(whatsappSupportEligible("basic")).toBe(false);
    expect(whatsappSupportEligible("free")).toBe(false);
  });
});
