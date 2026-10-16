import { describe, expect, it } from "vitest";
import {
  normalizePlanKey,
  ROTATOR_LIMITS,
  NUMBERS_PER_ROTATOR_LIMITS,
  SHORT_LINK_LIMITS,
  AD_LINK_LIMITS,
  rotatorLimit,
  numbersPerRotatorLimit,
  shortLinkLimit,
  adLinkLimit,
  widgetAvailable,
  reportsTier,
  supportLabel,
  canCreateMore,
  numbersPatchAllowed,
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

describe("owner-approved plan table", () => {
  it("matches the signed-off rotator link limits", () => {
    expect(ROTATOR_LIMITS).toEqual({ free: 1, basic: 3, pro: 10, ultimate: 25 });
  });
  it("matches the signed-off numbers-per-rotator limits", () => {
    expect(NUMBERS_PER_ROTATOR_LIMITS).toEqual({ free: 2, basic: 3, pro: 10, ultimate: 20 });
  });
  it("matches the signed-off short link limits", () => {
    expect(SHORT_LINK_LIMITS).toEqual({ free: 0, basic: 2, pro: 5, ultimate: 15 });
  });
  it("matches the signed-off ad link limits", () => {
    expect(AD_LINK_LIMITS).toEqual({ free: 0, basic: 0, pro: 5, ultimate: 15 });
  });
  it("business is treated exactly like ultimate for every limit", () => {
    expect(rotatorLimit("business")).toBe(rotatorLimit("ultimate"));
    expect(numbersPerRotatorLimit("business")).toBe(numbersPerRotatorLimit("ultimate"));
    expect(shortLinkLimit("business")).toBe(shortLinkLimit("ultimate"));
    expect(adLinkLimit("business")).toBe(adLinkLimit("ultimate"));
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
