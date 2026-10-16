import { describe, expect, it } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

// In-memory per-IP+code speed limiter used for bot protection on the public
// redirect routes (app/r/[code], app/w/[code], app/a/[id]): allows ~10
// hits/minute per key, after which the caller should still redirect the
// visitor but skip counting the click / advancing rotation / consuming a
// free lead. See the comment in app/r/[code]/route.ts for why an in-memory
// limiter (rather than the DB-backed lib/shared-rate-limit.ts) is fine here.
describe("rateLimit", () => {
  it("allows up to the limit within the window", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(rateLimit(key, 10, 60_000)).toBe(true);
    }
  });

  it("blocks once the limit is exceeded within the window", () => {
    const key = `test:${Math.random()}`;
    for (let i = 0; i < 10; i++) rateLimit(key, 10, 60_000);
    expect(rateLimit(key, 10, 60_000)).toBe(false);
    expect(rateLimit(key, 10, 60_000)).toBe(false);
  });

  it("tracks separate IP+code keys independently", () => {
    const codeA = `redirect:r:AAA:${Math.random()}`;
    const codeB = `redirect:r:BBB:${Math.random()}`;
    for (let i = 0; i < 10; i++) expect(rateLimit(codeA, 10, 60_000)).toBe(true);
    expect(rateLimit(codeA, 10, 60_000)).toBe(false);
    // A different code (or a different IP suffix) is a fresh bucket.
    expect(rateLimit(codeB, 10, 60_000)).toBe(true);
  });

  it("resets after the window elapses", () => {
    const key = `test:${Math.random()}`;
    expect(rateLimit(key, 1, 20)).toBe(true);
    expect(rateLimit(key, 1, 20)).toBe(false);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(rateLimit(key, 1, 20)).toBe(true);
        resolve(undefined);
      }, 30);
    });
  });

  it("rejects degenerate inputs safely instead of throwing", () => {
    expect(rateLimit("x", 0, 60_000)).toBe(false);
    expect(rateLimit("x", 10, 0)).toBe(false);
    expect(rateLimit("x".repeat(600), 10, 60_000)).toBe(false);
  });
});
