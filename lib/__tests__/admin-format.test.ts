import { describe, expect, it } from "vitest";
import { formatAdminDate, formatShortDate, relativeTime } from "../admin-format";

describe("formatAdminDate", () => {
  it("formats as '13 Nov 2026', not 13/11/2026", () => {
    expect(formatAdminDate(new Date("2026-11-13T00:00:00Z"))).toBe("13 Nov 2026");
  });
  it("accepts an ISO string", () => {
    expect(formatAdminDate("2026-11-13T00:00:00Z")).toBe("13 Nov 2026");
  });
  it("returns an em dash for missing/invalid input", () => {
    expect(formatAdminDate(null)).toBe("—");
    expect(formatAdminDate(undefined)).toBe("—");
    expect(formatAdminDate("not a date")).toBe("—");
  });
});

describe("formatShortDate", () => {
  it("formats as '2 Oct' - no year", () => {
    expect(formatShortDate(new Date("2026-10-02T00:00:00Z"))).toBe("2 Oct");
  });
  it("returns an em dash for missing input", () => {
    expect(formatShortDate(null)).toBe("—");
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-10-21T12:00:00Z");
  it("is 'Never' for no timestamp", () => {
    expect(relativeTime(null, now)).toBe("Never");
    expect(relativeTime(undefined, now)).toBe("Never");
  });
  it("is 'Just now' for under a minute", () => {
    expect(relativeTime(new Date(now.getTime() - 30_000), now)).toBe("Just now");
  });
  it("is in minutes under an hour", () => {
    expect(relativeTime(new Date(now.getTime() - 5 * 60_000), now)).toBe("5 minutes ago");
    expect(relativeTime(new Date(now.getTime() - 1 * 60_000), now)).toBe("1 minute ago");
  });
  it("is in hours under a day", () => {
    expect(relativeTime(new Date(now.getTime() - 3 * 3_600_000), now)).toBe("3 hours ago");
  });
  it("is 'Yesterday' for exactly one day back", () => {
    expect(relativeTime(new Date(now.getTime() - 25 * 3_600_000), now)).toBe("Yesterday");
  });
  it("is in days under a month", () => {
    expect(relativeTime(new Date(now.getTime() - 3 * 86_400_000), now)).toBe("3 days ago");
  });
  it("falls back to a full date beyond a month", () => {
    expect(relativeTime(new Date(now.getTime() - 60 * 86_400_000), now)).toBe(formatAdminDate(new Date(now.getTime() - 60 * 86_400_000)));
  });
});
