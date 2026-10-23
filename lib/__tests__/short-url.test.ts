import { describe, expect, it, afterEach } from "vitest";
import {
  validateTargetUrl,
  isValidCustomCode,
  randomShortCode,
  buildShortUrlPublicUrl,
  shortLinkBaseUrl,
  BLOCKED_SHORTENER_HOSTS,
  RESERVED_SHORT_CODES,
} from "@/lib/short-url";

describe("validateTargetUrl (TOOL-FREE-2 safety, audit item 4b)", () => {
  it("accepts a normal https URL", () => {
    const res = validateTargetUrl("https://example.com/page?x=1");
    expect(res.ok).toBe(true);
  });

  it("accepts http (not just https)", () => {
    expect(validateTargetUrl("http://example.com").ok).toBe(true);
  });

  it("rejects an empty value", () => {
    const res = validateTargetUrl("");
    expect(res).toEqual({ ok: false, error: "Enter a URL to shorten." });
  });

  it("rejects a URL over 2048 characters", () => {
    const long = `https://example.com/${"a".repeat(2048)}`;
    const res = validateTargetUrl(long);
    expect(res.ok).toBe(false);
  });

  it("rejects an unparsable value", () => {
    const res = validateTargetUrl("not a url");
    expect(res.ok).toBe(false);
  });

  it("rejects non-http(s) protocols", () => {
    expect(validateTargetUrl("ftp://example.com/file").ok).toBe(false);
    expect(validateTargetUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateTargetUrl("wa.me/15551234567").ok).toBe(false);
  });

  it("rejects embedded credentials", () => {
    expect(validateTargetUrl("https://user:pass@example.com").ok).toBe(false);
  });

  it("rejects raw IPv4 and IPv6 hosts", () => {
    expect(validateTargetUrl("http://192.168.1.1/admin").ok).toBe(false);
    expect(validateTargetUrl("http://8.8.8.8").ok).toBe(false);
    expect(validateTargetUrl("http://[::1]/").ok).toBe(false);
  });

  it("rejects localhost and .local hosts", () => {
    expect(validateTargetUrl("http://localhost:3000").ok).toBe(false);
    expect(validateTargetUrl("http://myapp.local").ok).toBe(false);
    expect(validateTargetUrl("http://box.localhost").ok).toBe(false);
  });

  it("rejects links pointing back at our own short-link host (no redirect chains)", () => {
    const res = validateTargetUrl("https://wazap.lt/s/abc1234", { ownHost: "wazap.lt" });
    expect(res.ok).toBe(false);
  });

  it("rejects every known chain-hiding shortener host, with or without www.", () => {
    for (const host of BLOCKED_SHORTENER_HOSTS) {
      expect(validateTargetUrl(`https://${host}/x`).ok, host).toBe(false);
      expect(validateTargetUrl(`https://www.${host}/x`).ok, `www.${host}`).toBe(false);
    }
  });

  it("allows a normal subdomain that merely contains a blocked host as a substring", () => {
    // Guards against an overly-broad "includes" check accidentally blocking
    // unrelated domains like notbit.ly-example.com.
    expect(validateTargetUrl("https://mybitly.example.com").ok).toBe(true);
  });
});

describe("isValidCustomCode", () => {
  it("accepts lowercase letters, digits and dashes, 3-40 chars", () => {
    expect(isValidCustomCode("autumn-sale")).toBe(true);
    expect(isValidCustomCode("abc")).toBe(true);
    expect(isValidCustomCode("a".repeat(40))).toBe(true);
  });

  it("rejects too short, too long, or invalid characters", () => {
    expect(isValidCustomCode("ab")).toBe(false);
    expect(isValidCustomCode("a".repeat(41))).toBe(false);
    expect(isValidCustomCode("Has_Upper")).toBe(false);
    expect(isValidCustomCode("has space")).toBe(false);
    expect(isValidCustomCode("has_underscore")).toBe(false);
  });

  it("rejects reserved words so they can never shadow a real /s/* route", () => {
    for (const reserved of RESERVED_SHORT_CODES) {
      expect(isValidCustomCode(reserved)).toBe(false);
    }
  });
});

describe("randomShortCode", () => {
  it("generates a 7-character code by default, from the non-confusable alphabet", () => {
    const code = randomShortCode();
    expect(code).toHaveLength(7);
    expect(code).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyz]+$/);
    expect(code).not.toMatch(/[01ilo]/);
  });

  it("honours an explicit length", () => {
    expect(randomShortCode(6)).toHaveLength(6);
  });

  it("is not trivially predictable across calls", () => {
    const codes = new Set(Array.from({ length: 50 }, () => randomShortCode()));
    expect(codes.size).toBeGreaterThan(45);
  });
});

describe("shortLinkBaseUrl / buildShortUrlPublicUrl", () => {
  const originalBase = process.env.SHORT_LINK_BASE_URL;
  const originalAuth = process.env.NEXTAUTH_URL;
  afterEach(() => {
    if (originalBase === undefined) delete process.env.SHORT_LINK_BASE_URL;
    else process.env.SHORT_LINK_BASE_URL = originalBase;
    if (originalAuth === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = originalAuth;
  });

  it("falls back to NEXTAUTH_URL's origin when SHORT_LINK_BASE_URL is unset", () => {
    delete process.env.SHORT_LINK_BASE_URL;
    process.env.NEXTAUTH_URL = "https://wazap.lt";
    expect(shortLinkBaseUrl()).toBe("https://wazap.lt");
    expect(buildShortUrlPublicUrl("abc1234")).toBe("https://wazap.lt/s/abc1234");
  });

  it("prefers SHORT_LINK_BASE_URL when set (so a separate short domain can be switched in later)", () => {
    process.env.SHORT_LINK_BASE_URL = "https://wzp.to/ignored/path";
    expect(shortLinkBaseUrl()).toBe("https://wzp.to");
    expect(buildShortUrlPublicUrl("abc1234")).toBe("https://wzp.to/s/abc1234");
  });

  it("ignores a malformed SHORT_LINK_BASE_URL and falls back", () => {
    process.env.SHORT_LINK_BASE_URL = "not a url";
    process.env.NEXTAUTH_URL = "https://wazap.lt";
    expect(shortLinkBaseUrl()).toBe("https://wazap.lt");
  });
});
