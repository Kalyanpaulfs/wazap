import { describe, expect, it } from "vitest";
import { adminReplyContent } from "@/lib/support-admin-service";

describe("adminReplyContent", () => {
  it("uses the typed text for both the chat body and the email when there is text", () => {
    expect(adminReplyContent("We've refunded the duplicate charge.", false)).toEqual({
      body: "We've refunded the duplicate charge.",
      emailText: "We've refunded the duplicate charge.",
    });
  });

  it("uses the typed text even when a screenshot is also attached", () => {
    expect(adminReplyContent("Here's what I mean:", true)).toEqual({
      body: "Here's what I mean:",
      emailText: "Here's what I mean:",
    });
  });

  it("falls back to the screenshot convention for the chat body, and friendlier prose for the email, when there is no text", () => {
    expect(adminReplyContent("", true)).toEqual({
      body: "📎 Screenshot",
      emailText: "Our team sent you a screenshot.",
    });
  });

  it("trims whitespace-only text the same as empty", () => {
    expect(adminReplyContent("   ", true)).toEqual({
      body: "📎 Screenshot",
      emailText: "Our team sent you a screenshot.",
    });
  });

  it("returns empty body/email text when there is neither text nor an attachment (caller is expected to reject this before calling)", () => {
    expect(adminReplyContent("", false)).toEqual({ body: "", emailText: "" });
  });
});
