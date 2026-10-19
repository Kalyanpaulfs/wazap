import { describe, expect, it } from "vitest";
import { normalizeWhatsAppNumber, formatForPreview, countryMobileLengthRange, countryRawMaxLength, countryLengthHint } from "@/lib/phone";

describe("normalizeWhatsAppNumber - per-country valid numbers", () => {
  it("UAE 9-digit mobile", () => {
    const r = normalizeWhatsAppNumber("AE", "501234567");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("971501234567");
    expect(r.countryCode).toBe("AE");
  });

  it("India 10-digit mobile", () => {
    const r = normalizeWhatsAppNumber("IN", "9876543210");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("919876543210");
  });

  it("US 10-digit", () => {
    const r = normalizeWhatsAppNumber("US", "2025551234");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("12025551234");
  });

  it("UK mobile", () => {
    const r = normalizeWhatsAppNumber("GB", "7911123456");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("447911123456");
  });

  it("Singapore 8-digit", () => {
    const r = normalizeWhatsAppNumber("SG", "81234567");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("6581234567");
  });

  it("Germany 10-11 digit", () => {
    const r = normalizeWhatsAppNumber("DE", "15123456789");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("4915123456789");
  });

  it("China 11-digit", () => {
    const r = normalizeWhatsAppNumber("CN", "13812345678");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("8613812345678");
  });
});

describe("normalizeWhatsAppNumber - trunk prefix / dial code handling", () => {
  it("drops a leading national trunk 0 (UAE)", () => {
    const r = normalizeWhatsAppNumber("AE", "050 123 4567");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("971501234567");
  });

  it("does not double-prefix when the dial code is already typed", () => {
    const r = normalizeWhatsAppNumber("971", "971501234567");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("971501234567");
  });

  it("accepts a bare dial code string instead of an ISO code", () => {
    const r = normalizeWhatsAppNumber("91", "9876543210");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("919876543210");
  });
});

describe("normalizeWhatsAppNumber - a pasted + number wins over the selected country", () => {
  it("+91 while UAE is selected resolves to India, not a UAE+India mashup", () => {
    const r = normalizeWhatsAppNumber("AE", "+91 98765 43210");
    expect(r.ok).toBe(true);
    expect(r.e164Digits).toBe("919876543210");
    expect(r.countryCode).toBe("IN");
  });
});

describe("normalizeWhatsAppNumber - rejections", () => {
  it("rejects letters", () => {
    const r = normalizeWhatsAppNumber("AE", "50abc4567");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Numbers only.");
  });

  it("rejects a too-short number", () => {
    const r = normalizeWhatsAppNumber("AE", "5012");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too short/i);
  });

  it("rejects a too-long number", () => {
    const r = normalizeWhatsAppNumber("AE", "5012345678901234567");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/too long/i);
  });

  it("is not ok, but has no error, for an empty box", () => {
    const r = normalizeWhatsAppNumber("AE", "");
    expect(r.ok).toBe(false);
    expect(r.error).toBeUndefined();
  });

  it("requires a country to be chosen before validating a bare national number", () => {
    const r = normalizeWhatsAppNumber("", "501234567");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("Choose a country.");
  });
});

describe("formatForPreview", () => {
  it("formats as international with spaces", () => {
    expect(formatForPreview("971501234567")).toBe("+971 50 123 4567");
  });
});

describe("countryMobileLengthRange - per-country mobile digit length, read from libphonenumber-js metadata", () => {
  it("matches the owner's examples", () => {
    expect(countryMobileLengthRange("AE")).toEqual({ min: 9, max: 9 });
    expect(countryMobileLengthRange("IN")).toEqual({ min: 10, max: 10 });
    expect(countryMobileLengthRange("US")).toEqual({ min: 10, max: 10 });
    expect(countryMobileLengthRange("GB")).toEqual({ min: 10, max: 10 });
    expect(countryMobileLengthRange("SG")).toEqual({ min: 8, max: 8 });
    expect(countryMobileLengthRange("CN")).toEqual({ min: 11, max: 11 });
    expect(countryMobileLengthRange("ID")).toEqual({ min: 9, max: 12 });
  });

  it("returns null for an unrecognized country code", () => {
    expect(countryMobileLengthRange("ZZ")).toBeNull();
    expect(countryMobileLengthRange("")).toBeNull();
    expect(countryMobileLengthRange(null)).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(countryMobileLengthRange("ae")).toEqual({ min: 9, max: 9 });
  });
});

describe("countryRawMaxLength", () => {
  it("equals the country's max for a fixed-length country", () => {
    expect(countryRawMaxLength("AE", false)).toBe(9);
  });
  it("allows one extra digit only when the first digit typed is a trunk 0", () => {
    expect(countryRawMaxLength("AE", true)).toBe(10);
  });
  it("uses the country's max for a ranged country (Indonesia)", () => {
    expect(countryRawMaxLength("ID", false)).toBe(12);
    expect(countryRawMaxLength("ID", true)).toBe(13);
  });
  it("falls back to 15 for an unknown country", () => {
    expect(countryRawMaxLength("ZZ", false)).toBe(15);
  });
});

describe("countryLengthHint", () => {
  it("shows an exact digit count for a fixed-length country", () => {
    expect(countryLengthHint("AE")).toBe("UAE mobile numbers have 9 digits (without +971).");
  });
  it("shows a range for a country with variable-length mobiles", () => {
    expect(countryLengthHint("ID")).toBe("Indonesia mobile numbers have 9-12 digits (without +62).");
  });
  it("is null for an unrecognized country", () => {
    expect(countryLengthHint("ZZ")).toBeNull();
    expect(countryLengthHint(null)).toBeNull();
  });
});
