import { describe, expect, it } from "vitest";
import { describeLinkPoolCreateCheck } from "@/lib/link-pool";

describe("describeLinkPoolCreateCheck (pure pool create-check, UX-1 step 1)", () => {
  it("blocks ad links outright on Solo, regardless of pool room", () => {
    const res = describeLinkPoolCreateCheck("basic", "adlink", 0, "Solo");
    expect(res).toEqual({ ok: false, error: "Ad links are available on Growth and Agency." });
  });

  it("allows ad links on Growth when the pool has room", () => {
    expect(describeLinkPoolCreateCheck("pro", "adlink", 5, "Growth")).toEqual({ ok: true });
  });

  it("blocks everything on a plan with a 0 pool limit (free/no trial)", () => {
    const res = describeLinkPoolCreateCheck("free", "rotator", 0, "Free trial ended");
    expect(res).toEqual({ ok: false, error: "Your Free trial ended plan doesn't include links. Choose a plan to create a lead rotator." });
  });

  it("names the right kind in the 0-limit message", () => {
    expect((describeLinkPoolCreateCheck("free", "shortlink", 0, "Free trial ended") as { error: string }).error).toContain("brand link");
    expect((describeLinkPoolCreateCheck("free", "adlink", 0, "Free trial ended") as { error: string }).error).toContain("Ad links are available");
  });

  it("allows creating while under the pool limit, any mix of kinds", () => {
    expect(describeLinkPoolCreateCheck("basic", "rotator", 19, "Solo")).toEqual({ ok: true });
    expect(describeLinkPoolCreateCheck("basic", "shortlink", 19, "Solo")).toEqual({ ok: true });
  });

  it("blocks once the shared pool is full, suggesting the next plan up", () => {
    expect(describeLinkPoolCreateCheck("basic", "rotator", 20, "Solo")).toEqual({
      ok: false,
      error: "You've used 20 of 20 links on your plan. Upgrade to Growth for 100.",
    });
    expect(describeLinkPoolCreateCheck("pro", "shortlink", 100, "Growth")).toEqual({
      ok: false,
      error: "You've used 100 of 100 links on your plan. Upgrade to Agency for 200.",
    });
  });

  it("blocks at Agency's limit with no further upgrade to suggest", () => {
    expect(describeLinkPoolCreateCheck("ultimate", "rotator", 200, "Agency")).toEqual({
      ok: false,
      error: "You've used 200 of 200 links on your plan.",
    });
  });

  it("the pool is shared across kinds: a rotator-only count still blocks a new short link", () => {
    expect(describeLinkPoolCreateCheck("basic", "shortlink", 20, "Solo").ok).toBe(false);
  });
});
