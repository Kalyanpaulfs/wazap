import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "test-secret-for-support-session-tests";
});

describe("support ownership token", () => {
  it("creates a token that verifies back to the same visitorId", async () => {
    const { createSupportToken, verifySupportToken } = await import("@/lib/support-session");
    const { visitorId, token } = createSupportToken();
    expect(verifySupportToken(token)).toBe(visitorId);
  });

  it("signs a token for a specific visitorId with createSupportTokenFor", async () => {
    const { createSupportTokenFor, verifySupportToken } = await import("@/lib/support-session");
    const visitorId = "11111111-1111-1111-1111-111111111111";
    expect(verifySupportToken(createSupportTokenFor(visitorId))).toBe(visitorId);
  });

  it("rejects a tampered token", async () => {
    const { createSupportToken, verifySupportToken } = await import("@/lib/support-session");
    const { token } = createSupportToken();
    const [visitorPart, expiryPart] = token.split(".");
    const tampered = `${visitorPart}.${expiryPart}.${"0".repeat(64)}`;
    expect(verifySupportToken(tampered)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { createSupportToken, verifySupportToken } = await import("@/lib/support-session");
    const past = Date.now() - 40 * 86400000; // beyond the 30-day TTL
    const { token } = createSupportToken(past);
    expect(verifySupportToken(token)).toBeNull();
  });
});

describe("continue-chat token", () => {
  it("creates a token that verifies back to the same visitorId", async () => {
    const { createContinueToken, verifyContinueToken } = await import("@/lib/support-session");
    const token = createContinueToken("some-visitor-id-123");
    expect(verifyContinueToken(token)).toBe("some-visitor-id-123");
  });

  it("round-trips a visitorId that isn't a plain UUID (client-supplied, arbitrary string)", async () => {
    const { createContinueToken, verifyContinueToken } = await import("@/lib/support-session");
    const token = createContinueToken("weird.visitor:id/with+chars");
    expect(verifyContinueToken(token)).toBe("weird.visitor:id/with+chars");
  });

  it("rejects a tampered token", async () => {
    const { createContinueToken, verifyContinueToken } = await import("@/lib/support-session");
    const token = createContinueToken("visitor-abc");
    const [payload, expiry] = token.split(".");
    const tampered = `${payload}.${expiry}.${"f".repeat(64)}`;
    expect(verifyContinueToken(tampered)).toBeNull();
  });

  it("rejects an expired token", async () => {
    const { createContinueToken, verifyContinueToken } = await import("@/lib/support-session");
    const past = Date.now() - 20 * 86400000; // beyond the 14-day TTL
    const token = createContinueToken("visitor-abc", past);
    expect(verifyContinueToken(token)).toBeNull();
  });

  it("rejects garbage input instead of throwing", async () => {
    const { verifyContinueToken } = await import("@/lib/support-session");
    expect(verifyContinueToken("")).toBeNull();
    expect(verifyContinueToken("not-a-token")).toBeNull();
    expect(verifyContinueToken("a.b.c")).toBeNull();
  });

  it("a support-session token cannot be replayed as a continue token, and vice versa", async () => {
    const { createSupportToken, createContinueToken, verifyContinueToken, verifySupportToken } = await import("@/lib/support-session");
    const { token: sessionToken } = createSupportToken();
    expect(verifyContinueToken(sessionToken)).toBeNull();
    const continueToken = createContinueToken("11111111-1111-1111-1111-111111111111");
    expect(verifySupportToken(continueToken)).toBeNull();
  });
});
