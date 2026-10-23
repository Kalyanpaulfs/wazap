import { describe, expect, it } from "vitest";
import { maskEmail } from "@/lib/outreach/mask-email";

describe("maskEmail", () => {
  it("masks the local part to one visible character + stars", () => {
    expect(maskEmail("ravi@gmail.com")).toBe("r****@gmail.com");
  });

  it("handles a one-character local part", () => {
    expect(maskEmail("r@gmail.com")).toBe("r****@gmail.com");
  });

  it("falls back to a generic mask for malformed input", () => {
    expect(maskEmail("not-an-email")).toBe("****");
    expect(maskEmail("@gmail.com")).toBe("****");
  });
});
