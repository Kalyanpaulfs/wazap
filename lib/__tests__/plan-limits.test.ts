import { describe, expect, it } from "vitest";
import {
  normalizePlanKey,
  LINK_LIMITS,
  NUMBERS_PER_ROTATOR_LIMITS,
  AD_LINKS_AVAILABLE,
  PLAN_DISPLAY_NAME,
  linkLimit,
  numbersPerRotatorLimit,
  adLinksAvailable,
  widgetAvailable,
  reportsTier,
  supportLabel,
  canCreateMore,
  numbersPatchAllowed,
  nextPlanPoolHint,
  nextPlanNumbersHint,
} from "@/lib/plan-limits";

describe("normalizePlanKey", () => {
  it("maps business onto ultimate", () => {
    expect(normalizePlanKey("business")).toBe("ultimate");
    expect(normalizePlanKey("BUSINESS")).toBe("ultimate");
  });
  it("defaults unknown/missing plans to free", () => {
    expect(normalizePlanKey(undefined)).toBe("free");
    expect(normalizePlanKey(null)).toBe("free");
    expect(normalizePlanKey("not-a-plan")).toBe("free");
  });
  it("passes through the four known plan keys", () => {
    expect(normalizePlanKey("basic")).toBe("basic");
    expect(normalizePlanKey("PRO")).toBe("pro");
    expect(normalizePlanKey("ultimate")).toBe("ultimate");
  });
});

describe("owner-approved plan table (UX-1 step 1: shared link pool)", () => {
  it("matches the signed-off link pool limits (Free-trial restructure: free is 0, nothing grandfathered)", () => {
    expect(LINK_LIMITS).toEqual({ free: 0, basic: 5, pro: 20, ultimate: 55 });
  });
  it("matches the signed-off numbers-per-rotator limits (Free-trial restructure: free is 0)", () => {
    expect(NUMBERS_PER_ROTATOR_LIMITS).toEqual({ free: 0, basic: 3, pro: 10, ultimate: 20 });
  });
  it("ad links are only offered on Growth and Agency", () => {
    expect(AD_LINKS_AVAILABLE).toEqual({ free: false, basic: false, pro: true, ultimate: true });
  });
  it("business is treated exactly like ultimate for every limit", () => {
    expect(linkLimit("business")).toBe(linkLimit("ultimate"));
    expect(numbersPerRotatorLimit("business")).toBe(numbersPerRotatorLimit("ultimate"));
    expect(adLinksAvailable("business")).toBe(adLinksAvailable("ultimate"));
    expect(widgetAvailable("business")).toBe(widgetAvailable("ultimate"));
    expect(reportsTier("business")).toBe(reportsTier("ultimate"));
    expect(supportLabel("business")).toBe(supportLabel("ultimate"));
  });
  it("widget is unavailable on free and available on every paid plan", () => {
    expect(widgetAvailable("free")).toBe(false);
    expect(widgetAvailable("basic")).toBe(true);
    expect(widgetAvailable("pro")).toBe(true);
    expect(widgetAvailable("ultimate")).toBe(true);
  });
  it("reports tier is none/basic/full per plan", () => {
    expect(reportsTier("free")).toBe("none");
    expect(reportsTier("basic")).toBe("basic");
    expect(reportsTier("pro")).toBe("full");
    expect(reportsTier("ultimate")).toBe("full");
  });
  it("support label escalates with plan", () => {
    expect(supportLabel("free")).toBe("Basic");
    expect(supportLabel("basic")).toBe("Basic");
    expect(supportLabel("pro")).toBe("Standard");
    expect(supportLabel("ultimate")).toBe("Priority");
  });
  it("never displays the bare word 'Free' as a plan name (owner rule)", () => {
    expect(PLAN_DISPLAY_NAME.free).not.toBe("Free");
    expect(PLAN_DISPLAY_NAME.free.toLowerCase()).toContain("trial");
    expect(PLAN_DISPLAY_NAME).toMatchObject({ basic: "Solo", pro: "Growth", ultimate: "Agency" });
  });
});

describe("canCreateMore (grandfathering rule #1: counts)", () => {
  it("blocks creating once the current count is at or over the limit", () => {
    expect(canCreateMore(0, 1)).toBe(true);
    expect(canCreateMore(1, 1)).toBe(false);
    expect(canCreateMore(14, 3)).toBe(false); // legacy over-limit user: still can't create MORE
  });
  it("never blocks an existing item merely for being over the limit (no side effect here)", () => {
    // canCreateMore only gates NEW creation; it takes no action on existing rows.
    expect(canCreateMore(14, 3)).toBe(false);
    expect(canCreateMore(2, 3)).toBe(true);
  });
});

describe("numbersPatchAllowed (grandfathering rule #2: numbers per rotator)", () => {
  it("always allows keeping the same count, even over the limit", () => {
    expect(numbersPatchAllowed(14, 14, 3)).toBe(true);
  });
  it("always allows reducing the count, even while still over the limit", () => {
    expect(numbersPatchAllowed(14, 10, 3)).toBe(true);
    expect(numbersPatchAllowed(14, 3, 3)).toBe(true);
  });
  it("allows increasing up to the limit", () => {
    expect(numbersPatchAllowed(2, 3, 3)).toBe(true);
  });
  it("blocks an increase that crosses the limit", () => {
    expect(numbersPatchAllowed(2, 4, 3)).toBe(false);
  });
  it("blocks any increase for a legacy rotator already over the limit", () => {
    expect(numbersPatchAllowed(14, 15, 3)).toBe(false);
  });
});

describe("nextPlanPoolHint (UX-1 step 2: create-link chooser upgrade copy)", () => {
  it("names the next plan and its link pool total", () => {
    expect(nextPlanPoolHint("basic")).toBe("Growth for 20");
    expect(nextPlanPoolHint("pro")).toBe("Agency for 55");
  });
  it("has nothing to suggest at Agency, or for free", () => {
    expect(nextPlanPoolHint("ultimate")).toBe("");
    expect(nextPlanPoolHint("free")).toBe("");
  });
});

describe("nextPlanNumbersHint (UX-1 step 3: rotator create form salespeople counter)", () => {
  it("names the next plan and its numbers-per-rotator total", () => {
    expect(nextPlanNumbersHint("basic")).toBe("Growth allows 10");
    expect(nextPlanNumbersHint("pro")).toBe("Agency allows 20");
  });
  it("has nothing to suggest at Agency, or for free", () => {
    expect(nextPlanNumbersHint("ultimate")).toBe("");
    expect(nextPlanNumbersHint("free")).toBe("");
  });
});
