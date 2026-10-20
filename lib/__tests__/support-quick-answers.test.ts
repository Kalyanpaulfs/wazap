import { describe, expect, it } from "vitest";
import { QUICK_ANSWERS, buildPersonalFacts, quickAnswerById, quickAnswersForTopic } from "@/lib/support-quick-answers";

describe("quickAnswersForTopic / quickAnswerById", () => {
  it("has no 'other' quick answers (other goes straight to the ticket form)", () => {
    expect(quickAnswersForTopic("other")).toEqual([]);
  });

  it("every answer has a non-empty title and body", () => {
    for (const answer of QUICK_ANSWERS) {
      expect(answer.title.length).toBeGreaterThan(0);
      expect(answer.body.length).toBeGreaterThan(0);
    }
  });

  it("filters by topic", () => {
    const payment = quickAnswersForTopic("payment");
    expect(payment.every(a => a.topic === "payment")).toBe(true);
    expect(payment.some(a => a.id === "pay-not-active")).toBe(true);
  });

  it("looks answers up by id", () => {
    expect(quickAnswerById("pay-not-active")?.title).toBe("Money deducted but my plan isn't active");
    expect(quickAnswerById("does-not-exist")).toBeNull();
  });

  it("flags the urgent quick answers (pay-not-active, link-down)", () => {
    expect(quickAnswerById("pay-not-active")?.urgent).toBe(true);
    expect(quickAnswerById("link-down")?.urgent).toBe(true);
    expect(quickAnswerById("pay-card")?.urgent).toBeFalsy();
  });
});

describe("buildPersonalFacts", () => {
  const now = new Date("2026-10-20T12:00:00Z");

  it("returns null for account/other topics", () => {
    expect(buildPersonalFacts({ topic: "account", now, planLabel: "Solo", planActive: true, planExpiresAt: null, trialEndsAt: null, trialActive: false, lastPayment: null, planPausedLinkCount: 0, customerPausedLinkCount: 0 })).toBeNull();
    expect(buildPersonalFacts({ topic: "other", now, planLabel: "Solo", planActive: true, planExpiresAt: null, trialEndsAt: null, trialActive: false, lastPayment: null, planPausedLinkCount: 0, customerPausedLinkCount: 0 })).toBeNull();
  });

  it("describes a lapsed free trial with plan-paused links", () => {
    const facts = buildPersonalFacts({
      topic: "link",
      now,
      planLabel: "Free trial ended",
      planActive: false,
      planExpiresAt: null,
      trialEndsAt: new Date("2026-10-18T00:00:00Z"),
      trialActive: false,
      lastPayment: null,
      planPausedLinkCount: 2,
      customerPausedLinkCount: 0,
    })!;
    expect(facts.sentences[0]).toContain("Your free trial ended on 18 Oct");
    expect(facts.sentences[0]).toContain("2 links are paused because of your plan");
  });

  it("mentions customer-paused links separately from plan-paused ones", () => {
    const facts = buildPersonalFacts({
      topic: "link",
      now,
      planLabel: "Growth",
      planActive: true,
      planExpiresAt: new Date("2026-11-19T00:00:00Z"),
      trialEndsAt: null,
      trialActive: false,
      lastPayment: null,
      planPausedLinkCount: 0,
      customerPausedLinkCount: 3,
    })!;
    expect(facts.sentences.join(" ")).not.toContain("because of your plan");
    expect(facts.sentences.join(" ")).toContain("You paused 3 links yourself.");
  });

  it("describes a confirmed payment and active plan, formatted with the payment's own currency", () => {
    const facts = buildPersonalFacts({
      topic: "payment",
      now,
      planLabel: "Growth",
      planActive: true,
      planExpiresAt: new Date("2026-11-19T00:00:00Z"),
      trialEndsAt: null,
      trialActive: false,
      lastPayment: { amount: 19, currency: "USD", createdAt: new Date("2026-10-19T00:00:00Z"), status: "active" },
      planPausedLinkCount: 0,
      customerPausedLinkCount: 0,
    })!;
    expect(facts.sentences.join(" ")).toContain("We see your $19 payment on 19 Oct");
    expect(facts.sentences.join(" ")).toContain("Your Growth plan is active until 19 Nov");
    expect(facts.suggestUrgentTicket).toBe(false);
  });

  it("formats a non-USD payment currency correctly", () => {
    const facts = buildPersonalFacts({
      topic: "payment",
      now,
      planLabel: "Growth",
      planActive: true,
      planExpiresAt: new Date("2026-11-19T00:00:00Z"),
      trialEndsAt: null,
      trialActive: false,
      lastPayment: { amount: 19, currency: "EUR", createdAt: new Date("2026-10-19T00:00:00Z"), status: "active" },
      planPausedLinkCount: 0,
      customerPausedLinkCount: 0,
    })!;
    expect(facts.sentences.join(" ")).toContain("19");
    expect(facts.sentences.join(" ")).not.toContain("$19");
  });

  it("suggests an urgent ticket when a payment landed in the last 24h but the plan is still inactive", () => {
    const facts = buildPersonalFacts({
      topic: "payment",
      now,
      planLabel: "Free trial ended",
      planActive: false,
      planExpiresAt: null,
      trialEndsAt: null,
      trialActive: false,
      lastPayment: { amount: 9, currency: "USD", createdAt: new Date(now.getTime() - 3600_000), status: "active" },
      planPausedLinkCount: 1,
      customerPausedLinkCount: 0,
    })!;
    expect(facts.suggestUrgentTicket).toBe(true);
  });

  it("does not suggest urgent for an old payment with an inactive plan", () => {
    const facts = buildPersonalFacts({
      topic: "payment",
      now,
      planLabel: "Free trial ended",
      planActive: false,
      planExpiresAt: null,
      trialEndsAt: null,
      trialActive: false,
      lastPayment: { amount: 9, currency: "USD", createdAt: new Date(now.getTime() - 30 * 86_400_000), status: "active" },
      planPausedLinkCount: 0,
      customerPausedLinkCount: 0,
    })!;
    expect(facts.suggestUrgentTicket).toBe(false);
  });

  it("reports no confirmed payment, and suggests urgent only when the customer picked pay-not-active", () => {
    const base = { topic: "payment" as const, now, planLabel: "Free trial ended", planActive: false, planExpiresAt: null, trialEndsAt: null, trialActive: false, lastPayment: null, planPausedLinkCount: 0, customerPausedLinkCount: 0 };
    const withoutQuickAnswer = buildPersonalFacts(base)!;
    expect(withoutQuickAnswer.sentences.join(" ")).toContain("haven't confirmed a payment");
    expect(withoutQuickAnswer.suggestUrgentTicket).toBe(false);

    const withQuickAnswer = buildPersonalFacts({ ...base, quickAnswerId: "pay-not-active" })!;
    expect(withQuickAnswer.suggestUrgentTicket).toBe(true);
  });

  it("never claims certainty (no 'always correct' wording)", () => {
    const facts = buildPersonalFacts({ topic: "payment", now, planLabel: "Solo", planActive: true, planExpiresAt: new Date(), trialEndsAt: null, trialActive: false, lastPayment: { amount: 9, currency: "USD", createdAt: now, status: "active" }, planPausedLinkCount: 0, customerPausedLinkCount: 0 })!;
    expect(facts.sentences.join(" ").toLowerCase()).not.toContain("always correct");
  });
});
