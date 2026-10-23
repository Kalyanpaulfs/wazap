import { describe, expect, it } from "vitest";
import { speedLimitCheck, dailyCapReached, utcDayStart, withinGiveBackWindow, GIVE_BACK_WINDOW_MS } from "@/lib/outreach/speed";

describe("speedLimitCheck", () => {
  it("never blocks when lastGivenAt is null", () => {
    expect(speedLimitCheck(null, new Date(), 20)).toEqual({ blocked: false });
  });

  it("blocks within the window and reports retryAfterMs", () => {
    const last = new Date("2026-10-22T10:00:00Z");
    const now = new Date("2026-10-22T10:00:10Z");
    const result = speedLimitCheck(last, now, 20);
    expect(result.blocked).toBe(true);
    if (result.blocked) expect(result.retryAfterMs).toBe(10_000);
  });

  it("allows once the window has passed", () => {
    const last = new Date("2026-10-22T10:00:00Z");
    const now = new Date("2026-10-22T10:00:20Z");
    expect(speedLimitCheck(last, now, 20)).toEqual({ blocked: false });
  });

  it("never blocks when speedLimitSeconds is 0", () => {
    expect(speedLimitCheck(new Date(), new Date(), 0)).toEqual({ blocked: false });
  });
});

describe("dailyCapReached", () => {
  it("never reached when dailyCap is null/undefined/0", () => {
    expect(dailyCapReached(1000, null)).toBe(false);
    expect(dailyCapReached(1000, undefined)).toBe(false);
    expect(dailyCapReached(1000, 0)).toBe(false);
  });

  it("reached at or above the cap", () => {
    expect(dailyCapReached(19, 20)).toBe(false);
    expect(dailyCapReached(20, 20)).toBe(true);
    expect(dailyCapReached(21, 20)).toBe(true);
  });
});

describe("utcDayStart", () => {
  it("returns midnight UTC for the given day", () => {
    expect(utcDayStart(new Date("2026-10-22T23:59:59Z")).toISOString()).toBe("2026-10-22T00:00:00.000Z");
  });
});

describe("withinGiveBackWindow", () => {
  it("true inside the 10 minute window, false after", () => {
    const givenAt = new Date("2026-10-22T10:00:00Z");
    expect(withinGiveBackWindow(givenAt, new Date(givenAt.getTime() + GIVE_BACK_WINDOW_MS))).toBe(true);
    expect(withinGiveBackWindow(givenAt, new Date(givenAt.getTime() + GIVE_BACK_WINDOW_MS + 1))).toBe(false);
  });
});
