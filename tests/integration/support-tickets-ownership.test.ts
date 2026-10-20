// Integration test for audit item 7: a signed-in user's OWN tickets
// (userId ownership) must not be blocked by a stale/unverified visitorId -
// e.g. opening "My tickets" (/support/tickets) on a new device/browser that
// never had this ticket's visitor cookie. Only a visitor-only request (no
// session) should still get the strict cookie check. Exercises the actual
// route handlers (not just the already-correct lib/support-tickets.ts
// ownership union) since the bug was the route-level 403 happening before
// the userId fallback ever got a chance to run.
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTicket } from "@/lib/support-tickets";
import { cleanupUser, createTestUser, testEmail, withEnv } from "./helpers";

let mockUserId: string | null = null;
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => (mockUserId ? { user: { id: mockUserId } } : null)) }));

import { GET as getTicketsList } from "@/app/api/support/tickets/route";
import { GET as getTicketDetail } from "@/app/api/support/tickets/[id]/route";
import { GET as getUnread } from "@/app/api/support/unread/route";

async function createOwnedTicket(userId: string) {
  const email = testEmail();
  const lead = await prisma.crmLead.create({ data: { email, name: "Integration Test", source: "test" } });
  // A visitorId from a DIFFERENT device/browser than the one making the
  // request in this test - never cookie-verified here, on purpose.
  const visitorId = randomUUID();
  await prisma.supportConversation.create({
    data: { visitorId, name: "Integration Test", email, phone: "+15550000000", crmLeadId: lead.id, contactCapturedAt: new Date(), userId },
  });
  const outcome = await createTicket({ visitorId, topic: "account", message: "Help please", userId });
  if (outcome.kind !== "created") throw new Error("setup: ticket not created: " + JSON.stringify(outcome));
  return { ticketId: outcome.ticket.id, visitorId, email, leadId: lead.id };
}

async function cleanupTicket(t: { visitorId: string; email: string; leadId: string }) {
  await prisma.outboundEmail.deleteMany({ where: { recipient: t.email.toLowerCase() } });
  await prisma.supportConversation.deleteMany({ where: { visitorId: t.visitorId } });
  await prisma.crmLead.deleteMany({ where: { id: t.leadId } });
}

function reqWithQuery(path: string, params: Record<string, string>) {
  const url = new URL(`http://localhost${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Deliberately NO cookie header - simulates an expired/never-set support
  // session cookie on this device.
  return new Request(url, { headers: new Headers() });
}

describe("support tickets ownership - logged-in userId must not need a valid visitorId cookie", () => {
  let userId: string | null = null;
  let ticket: Awaited<ReturnType<typeof createOwnedTicket>> | null = null;

  afterEach(async () => {
    mockUserId = null;
    if (ticket) { await cleanupTicket(ticket); ticket = null; }
    if (userId) { await cleanupUser(userId); userId = null; }
  });

  it("GET /api/support/tickets returns the user's ticket despite a bogus visitorId and no cookie", async () => {
    await withEnv({ NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "test-secret-for-support-session" }, async () => {
      const user = await createTestUser();
      userId = user.id;
      ticket = await createOwnedTicket(user.id);
      mockUserId = user.id;

      const res = await getTicketsList(reqWithQuery("/api/support/tickets", { visitorId: "not-a-real-visitor-id" }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.tickets.map((t: { id: string }) => t.id)).toContain(ticket!.ticketId);
    });
  });

  it("GET /api/support/tickets/[id] returns the ticket detail despite a bogus visitorId and no cookie", async () => {
    await withEnv({ NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "test-secret-for-support-session" }, async () => {
      const user = await createTestUser();
      userId = user.id;
      ticket = await createOwnedTicket(user.id);
      mockUserId = user.id;

      const res = await getTicketDetail(
        reqWithQuery(`/api/support/tickets/${ticket.ticketId}`, { visitorId: "not-a-real-visitor-id" }),
        { params: Promise.resolve({ id: ticket.ticketId }) },
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ticket.id).toBe(ticket.ticketId);
    });
  });

  it("GET /api/support/unread still counts despite a bogus visitorId and no cookie", async () => {
    await withEnv({ NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "test-secret-for-support-session" }, async () => {
      const user = await createTestUser();
      userId = user.id;
      ticket = await createOwnedTicket(user.id);
      mockUserId = user.id;

      const res = await getUnread(reqWithQuery("/api/support/unread", { visitorId: "not-a-real-visitor-id" }));
      expect(res.status).toBe(200);
      // Just needs to not be a 403 - count itself is covered elsewhere.
      const body = await res.json();
      expect(typeof body.unread).toBe("number");
    });
  });

  it("still 403s a visitor-only request (no session) with a bogus visitorId", async () => {
    await withEnv({ NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "test-secret-for-support-session" }, async () => {
      mockUserId = null; // no session at all
      const res = await getTicketsList(reqWithQuery("/api/support/tickets", { visitorId: "not-a-real-visitor-id" }));
      expect(res.status).toBe(403);
    });
  });
});
