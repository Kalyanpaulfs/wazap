import { describe, expect, it } from "vitest";
import { decideSupportAlert, evaluateHandoff, handoffMessage, needsHuman, supportReference } from "@/lib/support-handoff";

describe("evaluateHandoff / needsHuman", () => {
  it("flags when the AI explicitly asks for a handoff", () => {
    const result = evaluateHandoff("something went wrong", { handoff: true, reason: "angry customer" });
    expect(result).toEqual({ flagged: true, reason: "angry customer" });
    expect(needsHuman("something went wrong", { handoff: true, reason: "angry customer" })).toBe(true);
  });

  it("flags when the AI is unavailable", () => {
    expect(evaluateHandoff("hello", null)).toEqual({ flagged: true, reason: "AI assistant unavailable" });
    expect(evaluateHandoff("hello", undefined)).toEqual({ flagged: true, reason: "AI assistant unavailable" });
  });

  it("flags common English requests for a human", () => {
    for (const message of ["can I talk to a human", "I need a real person", "let me speak to an agent", "get me your manager", "talk to someone please"]) {
      expect(needsHuman(message, { handoff: false })).toBe(true);
    }
  });

  it("flags a few common non-English requests for a human", () => {
    for (const message of ["quiero hablar con un humano", "je veux parler à un humain", "falar com uma pessoa real", "ich möchte mit jemandem sprechen"]) {
      expect(needsHuman(message, { handoff: false })).toBe(true);
    }
  });

  it("flags money topics", () => {
    for (const message of ["I want a refund please", "I was charged twice this month", "this looks like a double charge", "my payment failed again", "this is a chargeback", "please cancel my subscription", "there is a billing issue on my account"]) {
      expect(needsHuman(message, { handoff: false })).toBe(true);
    }
  });

  it("does not flag an ordinary product question", () => {
    expect(evaluateHandoff("how do I create a QR code for my link?", { handoff: false, reason: "" })).toEqual({ flagged: false, reason: null });
  });
});

describe("supportReference", () => {
  it("is '#' plus the last 6 alphanumeric characters uppercased", () => {
    expect(supportReference("clv9f3k2a0001xyzABCDEF")).toBe("#ABCDEF");
  });

  it("pads short ids so the reference always has a visible tail", () => {
    expect(supportReference("ab")).toBe("#0000AB");
  });

  it("strips non-alphanumeric characters before taking the tail", () => {
    expect(supportReference("abc-def-123456")).toBe("#123456");
  });
});

describe("handoffMessage", () => {
  it("includes the reference and the reply window", () => {
    const text = handoffMessage("#ABC123", 12);
    expect(text).toContain("#ABC123");
    expect(text).toContain("12 hours");
  });
});

describe("decideSupportAlert", () => {
  it("alerts on a brand-new flagged conversation", () => {
    expect(decideSupportAlert({ previousStatus: null, lastMessageSender: null, flaggedNow: true })).toEqual({ flagged: true, shouldAlert: true });
  });

  it("does not alert or flag a brand-new, non-flagged conversation", () => {
    expect(decideSupportAlert({ previousStatus: null, lastMessageSender: null, flaggedNow: false })).toEqual({ flagged: false, shouldAlert: false });
  });

  it("does not re-alert while still flagged and waiting on the admin", () => {
    expect(decideSupportAlert({ previousStatus: "open", lastMessageSender: "visitor", flaggedNow: false })).toEqual({ flagged: true, shouldAlert: false });
    expect(decideSupportAlert({ previousStatus: "open", lastMessageSender: "bot", flaggedNow: true })).toEqual({ flagged: true, shouldAlert: false });
  });

  it("re-alerts once the admin has replied and the visitor writes again", () => {
    expect(decideSupportAlert({ previousStatus: "open", lastMessageSender: "admin", flaggedNow: false })).toEqual({ flagged: true, shouldAlert: true });
  });

  it("re-alerts when the visitor writes again after the chat was marked solved", () => {
    expect(decideSupportAlert({ previousStatus: "closed", lastMessageSender: "admin", flaggedNow: false })).toEqual({ flagged: true, shouldAlert: true });
  });

  it("leaves an ai-only conversation alone when not flagged", () => {
    expect(decideSupportAlert({ previousStatus: "ai", lastMessageSender: "bot", flaggedNow: false })).toEqual({ flagged: false, shouldAlert: false });
  });
});

describe("human-request rules do not flag normal product questions", () => {
  it.each([
    "How do I add a salesperson?",
    "Can I add another person to my rotator?",
    "My sales agents are not getting chats",
    "How does the manager see reports?",
  ])("%s → not flagged", (message) => {
    expect(evaluateHandoff(message, { reply: "ok", handoff: false } as never).flagged).toBe(false);
  });
  it.each([
    "I want to talk to a person",
    "Can I speak with a human?",
    "connect me to an agent please",
    "I need a real person",
    "are you human",
  ])("%s → flagged", (message) => {
    expect(evaluateHandoff(message, { reply: "ok", handoff: false } as never).flagged).toBe(true);
  });
});
