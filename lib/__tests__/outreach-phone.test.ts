import { describe, expect, it } from "vitest";
import { cleanOutreachPhone, maskContactPhone } from "@/lib/outreach/phone";

describe("cleanOutreachPhone", () => {
  it("accepts a full international number regardless of default country", () => {
    const result = cleanOutreachPhone("+971501234567", null);
    expect(result).toEqual({ ok: true, digits: "971501234567" });
  });

  it("completes a bare local number using the default country", () => {
    const result = cleanOutreachPhone("501234567", "AE");
    expect(result).toEqual({ ok: true, digits: "971501234567" });
  });

  it("rejects a bare local number with no default country", () => {
    const result = cleanOutreachPhone("501234567", null);
    expect(result.ok).toBe(false);
  });

  it("rejects empty input", () => {
    const result = cleanOutreachPhone("", "AE");
    expect(result).toEqual({ ok: false, error: "Phone number is required." });
  });

  it("rejects an invalid number", () => {
    const result = cleanOutreachPhone("123", "AE");
    expect(result.ok).toBe(false);
  });
});

describe("maskContactPhone", () => {
  it("masks a normal number to a short prefix + stars + last 4 digits", () => {
    expect(maskContactPhone("971501234567")).toBe("+971••••4567");
  });

  it("shows a short number in full (no room to mask)", () => {
    expect(maskContactPhone("1234")).toBe("+1234");
  });

  it("returns empty string for empty input", () => {
    expect(maskContactPhone("")).toBe("");
  });
});
