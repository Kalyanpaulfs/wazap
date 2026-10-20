// SUPPORT-2 ticket system integration test, against the real local Postgres
// (wazap_dev) the same way the other tests/integration/* files do. Covers:
// create -> staff reply -> customer sees + unread count; the monitor's
// "new reply" email (only after 15 min unseen, throttled to one per 3h);
// solve -> reopen within 7 days -> auto-close after 7 days; ownership
// (visitor B cannot read/write visitor A's ticket); the daily/open-ticket
// limits (and the urgent bypass); open-ticket-per-topic + differentProblem;
// and WhatsApp availability by plan.
import { MAX_NEW_TICKETS_PER_DAY_HARD_CAP, whatsappSupportEligible } from "@/lib/support-ticket-rules";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { monitorSupport } from "@/lib/support-monitor";
import {
  addCustomerMessage,
  createTicket,
  getTicketDetail,
  listTicketsForOwner,
  reopenByCustomer,
  setTicketStatus,
  staffReply,
  unreadCountForOwner,
} from "@/lib/support-tickets";
import { cleanupUser, createTestUser, testEmail, withEnv } from "./helpers";

type Visitor = { visitorId: string; email: string; leadId: string };

async function createVisitor(opts: { email?: string; userId?: string } = {}): Promise<Visitor> {
  const visitorId = randomUUID();
  const email = opts.email ?? testEmail();
  const lead = await prisma.crmLead.create({ data: { email, name: "Integration Test", source: "test" } });
  await prisma.supportConversation.create({
    data: { visitorId, name: "Integration Test", email, phone: "+15550000000", crmLeadId: lead.id, contactCapturedAt: new Date(), userId: opts.userId ?? null },
  });
  return { visitorId, email, leadId: lead.id };
}

async function cleanupVisitor(v: Visitor) {
  await prisma.outboundEmail.deleteMany({ where: { recipient: v.email.toLowerCase() } });
  await prisma.supportConversation.deleteMany({ where: { visitorId: v.visitorId } }); // cascades tickets/messages/attachments
  await prisma.crmLead.deleteMany({ where: { id: v.leadId } });
}

async function createAdmin() {
  return prisma.user.create({ data: { email: testEmail(), name: "Admin Test", isAdmin: true } });
}

describe("SUPPORT-2 ticket system", () => {
  const visitors: Visitor[] = [];
  const adminIds: string[] = [];
  const stateFile = path.join(os.tmpdir(), `wazap-support-monitor-test-${randomUUID()}.json`);

  afterEach(async () => {
    for (const v of visitors.splice(0)) await cleanupVisitor(v);
    for (const id of adminIds.splice(0)) await cleanupUser(id);
  });

  it("create -> staff reply -> customer sees it + unread count tracks correctly", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);
    const admin = await createAdmin();
    adminIds.push(admin.id);

    const created = await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "Login code never arrived." });
    expect(created.kind).toBe("created");
    if (created.kind !== "created") return;
    const ticketId = created.ticket.id;

    expect(await unreadCountForOwner({ visitorId: visitor.visitorId })).toBe(0);

    const reply = await staffReply(ticketId, admin.id, "Try resending the code.", "waiting");
    expect(reply.kind).toBe("ok");

    expect(await unreadCountForOwner({ visitorId: visitor.visitorId })).toBe(1);

    const detail = await getTicketDetail(ticketId, { visitorId: visitor.visitorId });
    expect(detail).toBeTruthy();
    expect(detail!.status).toBe("waiting");
    expect(detail!.messages.some(m => m.sender === "admin" && m.body === "Try resending the code.")).toBe(true);
    expect(detail!.unread).toBe(0);

    // Viewing the ticket marked the admin message read, so unread drops to 0.
    expect(await unreadCountForOwner({ visitorId: visitor.visitorId })).toBe(0);

    const list = await listTicketsForOwner({ visitorId: visitor.visitorId });
    expect(list.find(t => t.id === ticketId)?.status).toBe("waiting");

    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.assignedToId).toBe(admin.id); // auto-assigned to the replier
    expect(ticket.firstReplyAt).toBeTruthy();
  });

  it("monitor sends the 'new reply' email only once per staff reply, never a second time for the same reply", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);
    const admin = await createAdmin();
    adminIds.push(admin.id);

    const created = await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "Help please." });
    if (created.kind !== "created") throw new Error("ticket not created");
    const ticketId = created.ticket.id;
    await staffReply(ticketId, admin.id, "Looking into it now.", "waiting");

    const t0 = (await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).lastAdminReplyAt!;

    await withEnv({ WAZAP_SUPPORT_MONITOR_STATE: stateFile, SUPPORT_MONITOR_SINCE: new Date(0).toISOString() }, async () => {
      // Too soon (5 minutes unseen): no email yet.
      await monitorSupport({ poll: false, now: new Date(t0.getTime() + 5 * 60_000) });
      expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_reply" } })).toBe(0);

      // 16 minutes unseen: exactly one email.
      await monitorSupport({ poll: false, now: new Date(t0.getTime() + 16 * 60_000) });
      expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_reply" } })).toBe(1);

      // 1 hour later (still within the 3h throttle, still unseen): no second email.
      await monitorSupport({ poll: false, now: new Date(t0.getTime() + 60 * 60_000) });
      expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_reply" } })).toBe(1);

      // Past the 3h throttle, STILL the same unanswered reply, still unseen:
      // no second email either - the throttle used to allow a repeat email
      // for the same reply once 3h had passed, which was a spam bug. Only a
      // NEW staff reply can trigger another email.
      await monitorSupport({ poll: false, now: new Date(t0.getTime() + 16 * 60_000 + 3 * 3_600_000 + 60_000) });
      expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_reply" } })).toBe(1);
    });

    // A NEW staff reply (simulated here by backdating lastAdminReplyAt
    // forward, the same way other tests in this file backdate solvedAt to
    // control timing) is allowed its own "new reply" email, once 3h since
    // the first email have passed.
    const newReplyAt = new Date(t0.getTime() + 16 * 60_000 + 3 * 3_600_000 + 30 * 60_000);
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { lastAdminReplyAt: newReplyAt } });
    await withEnv({ WAZAP_SUPPORT_MONITOR_STATE: stateFile, SUPPORT_MONITOR_SINCE: new Date(0).toISOString() }, async () => {
      await monitorSupport({ poll: false, now: new Date(newReplyAt.getTime() + 16 * 60_000) });
      expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_reply" } })).toBe(2);
    });

    // Once the customer actually views the ticket (marks the admin message
    // seen), no further "new reply" email should go out.
    await getTicketDetail(ticketId, { visitorId: visitor.visitorId });
    await withEnv({ WAZAP_SUPPORT_MONITOR_STATE: stateFile, SUPPORT_MONITOR_SINCE: new Date(0).toISOString() }, async () => {
      await monitorSupport({ poll: false, now: new Date(t0.getTime() + 20 * 3_600_000) });
      expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_reply" } })).toBe(2);
    });
  });

  it("never sends the 'new reply' email for a solved or closed ticket", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);
    const admin = await createAdmin();
    adminIds.push(admin.id);

    const created = await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "Help please." });
    if (created.kind !== "created") throw new Error("ticket not created");
    const ticketId = created.ticket.id;
    // staffReply with nextStatus "solved" sends the solved email
    // immediately AND sets lastCustomerEmailAt, so the monitor's "new
    // reply" job must never fire for this same reply afterwards.
    await staffReply(ticketId, admin.id, "This is fixed.", "solved");
    expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_solved" } })).toBe(1);

    const t0 = (await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } })).lastAdminReplyAt!;
    await withEnv({ WAZAP_SUPPORT_MONITOR_STATE: stateFile, SUPPORT_MONITOR_SINCE: new Date(0).toISOString() }, async () => {
      await monitorSupport({ poll: false, now: new Date(t0.getTime() + 20 * 60_000) });
    });
    expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_reply" } })).toBe(0);
  });

  it("solve -> reopen within 7 days -> auto-closes 7 days after being solved", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);
    const admin = await createAdmin();
    adminIds.push(admin.id);

    const created = await createTicket({ visitorId: visitor.visitorId, topic: "other", message: "Question." });
    if (created.kind !== "created") throw new Error("ticket not created");
    const ticketId = created.ticket.id;

    const solved = await staffReply(ticketId, admin.id, "This is fixed now.", "solved");
    expect(solved.kind).toBe("ok");
    let ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe("solved");
    expect(ticket.solvedAt).toBeTruthy();
    expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_solved" } })).toBe(1);

    // Reopen within the 7-day window (backdate solvedAt to 2 days ago).
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { solvedAt: new Date(Date.now() - 2 * 86_400_000) } });
    const reopened = await reopenByCustomer(ticketId, { visitorId: visitor.visitorId });
    expect(reopened.kind).toBe("ok");
    ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe("open");

    // Solve again, then backdate past the 7-day reopen window: reopen is refused.
    await staffReply(ticketId, admin.id, "Fixed again.", "solved");
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { solvedAt: new Date(Date.now() - 8 * 86_400_000) } });
    const refused = await reopenByCustomer(ticketId, { visitorId: visitor.visitorId });
    expect(refused.kind).toBe("error");

    // And the monitor auto-closes a ticket solved more than 7 days ago.
    await withEnv({ WAZAP_SUPPORT_MONITOR_STATE: stateFile, SUPPORT_MONITOR_SINCE: new Date(0).toISOString() }, async () => {
      await monitorSupport({ poll: false });
    });
    ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe("closed");
    expect(ticket.closedAt).toBeTruthy();
  });

  it("auto-solves a waiting ticket after 7 days with no customer reply", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);
    const admin = await createAdmin();
    adminIds.push(admin.id);

    const created = await createTicket({ visitorId: visitor.visitorId, topic: "other", message: "Question." });
    if (created.kind !== "created") throw new Error("ticket not created");
    const ticketId = created.ticket.id;
    await staffReply(ticketId, admin.id, "Here's the answer.", "waiting");
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { lastAdminReplyAt: new Date(Date.now() - 8 * 86_400_000) } });

    await withEnv({ WAZAP_SUPPORT_MONITOR_STATE: stateFile, SUPPORT_MONITOR_SINCE: new Date(0).toISOString() }, async () => {
      await monitorSupport({ poll: false });
    });

    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe("solved");
  });

  it("ownership: visitor B cannot read or write to visitor A's ticket", async () => {
    const visitorA = await createVisitor();
    visitors.push(visitorA);
    const visitorB = await createVisitor();
    visitors.push(visitorB);

    const created = await createTicket({ visitorId: visitorA.visitorId, topic: "account", message: "Private issue." });
    if (created.kind !== "created") throw new Error("ticket not created");
    const ticketId = created.ticket.id;

    expect(await getTicketDetail(ticketId, { visitorId: visitorB.visitorId })).toBeNull();

    const writeAttempt = await addCustomerMessage(ticketId, { visitorId: visitorB.visitorId }, "snooping");
    expect(writeAttempt.kind).toBe("error");
    if (writeAttempt.kind === "error") expect(writeAttempt.status).toBe(404);

    expect(await listTicketsForOwner({ visitorId: visitorB.visitorId })).toHaveLength(0);

    // The real owner can, of course, still read and write.
    expect(await getTicketDetail(ticketId, { visitorId: visitorA.visitorId })).toBeTruthy();
  });

  it("limits: max 3 new tickets/day and max 3 open tickets, bypassed for urgent topics (payment, link)", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);

    const t1 = await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "One." });
    const t2 = await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "Two.", differentProblem: true });
    const t3 = await createTicket({ visitorId: visitor.visitorId, topic: "other", message: "Three." });
    expect(t1.kind).toBe("created");
    expect(t2.kind).toBe("created");
    expect(t3.kind).toBe("created");

    const blocked = await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "Four.", differentProblem: true });
    expect(blocked.kind).toBe("error");

    // Urgent topics bypass both the daily and open-ticket limits.
    const urgent = await createTicket({ visitorId: visitor.visitorId, topic: "payment", message: "Money taken, plan inactive." });
    expect(urgent.kind).toBe("created");
    if (urgent.kind === "created") expect(urgent.ticket.urgent).toBe(true);
  });

  it("open-ticket-per-topic: a second message on the same open topic returns the existing ticket unless differentProblem is set", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);

    const first = await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "Can't log in." });
    if (first.kind !== "created") throw new Error("ticket not created");

    const second = await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "Still can't log in." });
    expect(second.kind).toBe("existing");
    if (second.kind === "existing") expect(second.existing.id).toBe(first.ticket.id);

    const third = await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "Different account problem.", differentProblem: true });
    expect(third.kind).toBe("created");
    if (third.kind === "created") expect(third.ticket.id).not.toBe(first.ticket.id);
  });

  it("hard cap of 10 tickets/24h applies even to urgent topics - nothing bypasses it", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);

    for (let i = 0; i < MAX_NEW_TICKETS_PER_DAY_HARD_CAP; i++) {
      const result = await createTicket({ visitorId: visitor.visitorId, topic: i % 2 === 0 ? "payment" : "link", message: `Urgent issue ${i}.`, differentProblem: true });
      expect(result.kind).toBe("created");
    }

    const blocked = await createTicket({ visitorId: visitor.visitorId, topic: "payment", message: "One more, still urgent.", differentProblem: true });
    expect(blocked.kind).toBe("error");
    if (blocked.kind === "error") expect(blocked.status).toBe(429);
  });

  it("sends at most one 'Ticket received' email per recipient per hour, even across several ticket creations", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);

    await createTicket({ visitorId: visitor.visitorId, topic: "account", message: "One." });
    await createTicket({ visitorId: visitor.visitorId, topic: "other", message: "Two.", differentProblem: true });
    await createTicket({ visitorId: visitor.visitorId, topic: "payment", message: "Three, urgent.", differentProblem: true });

    expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_created" } })).toBe(1);
  });

  it("ownership: a logged-in owner can write to their ticket from a different browser/visitorId", async () => {
    const owner = await createTestUser({});
    adminIds.push(owner.id);
    const visitor = await createVisitor({ userId: owner.id });
    visitors.push(visitor);

    const created = await createTicket({ visitorId: visitor.visitorId, userId: owner.id, topic: "account", message: "Help." });
    if (created.kind !== "created") throw new Error("ticket not created");

    const otherVisitorId = randomUUID(); // a different browser/session - no matching conversation visitorId
    const result = await addCustomerMessage(created.ticket.id, { visitorId: otherVisitorId, userId: owner.id }, "Following up from my phone.");
    expect(result.kind).toBe("ok");
  });

  it("alerts the team every time a customer reopens a solved ticket, not only the first time", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);
    const admin = await createAdmin();
    adminIds.push(admin.id);

    const created = await createTicket({ visitorId: visitor.visitorId, topic: "other", message: "Question." });
    if (created.kind !== "created") throw new Error("ticket not created");
    const ticketId = created.ticket.id;
    const subject = `Ticket #${created.ticket.number} reopened by customer`;

    await staffReply(ticketId, admin.id, "Fixed.", "solved");
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { solvedAt: new Date(Date.now() - 2 * 86_400_000) } });
    expect((await reopenByCustomer(ticketId, { visitorId: visitor.visitorId })).kind).toBe("ok");

    await staffReply(ticketId, admin.id, "Fixed again.", "solved");
    await prisma.supportTicket.update({ where: { id: ticketId }, data: { solvedAt: new Date(Date.now() - 2 * 86_400_000) } });
    expect((await reopenByCustomer(ticketId, { visitorId: visitor.visitorId })).kind).toBe("ok");

    expect(await prisma.outboundEmail.count({ where: { type: "support_live_team_alert", recipient: "support@wazap.lt", subject } })).toBe(2);
  });

  it("admin 'Mark solved' matches staffReply's solved handling: solvedAt, cleared waitingSince, one email, lastCustomerEmailAt set", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);
    const admin = await createAdmin();
    adminIds.push(admin.id);

    const created = await createTicket({ visitorId: visitor.visitorId, topic: "other", message: "Question." });
    if (created.kind !== "created") throw new Error("ticket not created");
    const ticketId = created.ticket.id;
    await staffReply(ticketId, admin.id, "Here you go.", "waiting");

    const outcome = await setTicketStatus(ticketId, "solved");
    expect(outcome.kind).toBe("ok");

    const ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe("solved");
    expect(ticket.solvedAt).toBeTruthy();
    expect(ticket.waitingSince).toBeNull();
    expect(ticket.lastCustomerEmailAt).toBeTruthy();
    expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_solved" } })).toBe(1);

    // Calling it again (already solved) must not resend the solved email.
    await setTicketStatus(ticketId, "solved");
    expect(await prisma.outboundEmail.count({ where: { recipient: visitor.email.toLowerCase(), type: "support_ticket_solved" } })).toBe(1);
  });

  it("admin setting status to 'waiting' by hand starts the auto-solve clock if it wasn't already running", async () => {
    const visitor = await createVisitor();
    visitors.push(visitor);

    const created = await createTicket({ visitorId: visitor.visitorId, topic: "other", message: "Question." });
    if (created.kind !== "created") throw new Error("ticket not created");
    const ticketId = created.ticket.id;

    let ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.lastAdminReplyAt).toBeNull();

    await setTicketStatus(ticketId, "waiting");
    ticket = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } });
    expect(ticket.status).toBe("waiting");
    expect(ticket.lastAdminReplyAt).toBeTruthy();
  });

  it("setTicketStatus on an unknown ticket returns a 404-shaped error instead of throwing", async () => {
    const outcome = await setTicketStatus("does-not-exist", "solved");
    expect(outcome).toEqual({ kind: "error", status: 404, error: "Ticket not found." });
  });

  it("WhatsApp support is only available to a real, unexpired Growth or Agency plan", async () => {
    const ultimate = await createTestUser({ plan: "ultimate", planExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
    const solo = await createTestUser({ plan: "basic", planExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
    const legacyBusiness = await createTestUser({ plan: "business", planExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
    const expiredAgency = await createTestUser({ plan: "ultimate", planExpiresAt: new Date(Date.now() - 86_400_000) });
    adminIds.push(ultimate.id, solo.id, legacyBusiness.id, expiredAgency.id);

    expect(whatsappSupportEligible(linkPlan(ultimate))).toBe(true);
    expect(linkPlan(ultimate)).toBe("ultimate");
    expect(whatsappSupportEligible(linkPlan(solo))).toBe(false);
    expect(whatsappSupportEligible(linkPlan(expiredAgency))).toBe(false);
    expect(linkPlan(legacyBusiness)).toBe("ultimate"); // legacy "business" maps onto ultimate
    expect(linkPlan(expiredAgency)).not.toBe("ultimate"); // expired plan no longer counts
  });
});
