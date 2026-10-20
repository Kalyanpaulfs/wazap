import { describe, expect, it } from "vitest";
import { buildSupportDigest, supportDigestSlot } from "@/lib/support-digest";

const now = new Date("2026-10-20T06:00:00Z"); // 10:00 Dubai

describe("support daily digest", () => {
  it("is due only from 09:00 Dubai time, keyed by the Dubai day", () => {
    expect(supportDigestSlot(new Date("2026-10-20T04:59:00Z"))).toEqual({ day: "2026-10-20", due: false });
    expect(supportDigestSlot(new Date("2026-10-20T05:00:00Z"))).toEqual({ day: "2026-10-20", due: true });
    expect(supportDigestSlot(new Date("2026-10-20T21:00:00Z"))).toEqual({ day: "2026-10-21", due: false });
  });

  it("sends nothing when nothing needs attention", () => {
    expect(buildSupportDigest({ waiting: [], mailboxProblems: [], deliveryFailures: 0, now })).toBeNull();
  });

  it("lists every waiting customer in one email, oldest first", () => {
    const digest = buildSupportDigest({
      waiting: [
        { kind: "ticket", name: "Ravi", email: "ravi@example.com", topic: "#A1B2C3 Payment", waitingSince: "2026-10-19T18:00:00Z" },
        { kind: "request", name: "Ana", email: "ana@example.com", topic: "billing", waitingSince: "2026-10-15T06:00:00Z" },
      ],
      mailboxProblems: [],
      deliveryFailures: 2,
      now,
    })!;
    expect(digest.subject).toBe("Wazap support: 2 customers waiting for a reply");
    expect(digest.message).toContain("1. Ana <ana@example.com> - Contact form: billing - waiting 5 days");
    expect(digest.message).toContain("2. Ravi <ravi@example.com> - Ticket #A1B2C3 Payment - waiting 12 hours");
    expect(digest.message).toContain("Service emails that failed to send: 2");
  });

  it("still reports inbox problems when no one is waiting", () => {
    const digest = buildSupportDigest({ waiting: [], mailboxProblems: ["billing"], deliveryFailures: 0, now })!;
    expect(digest.subject).toBe("Wazap support: inbox or delivery needs attention");
    expect(digest.message).toContain("Mailboxes not connected: billing");
  });
});
