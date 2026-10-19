import { describe, expect, it } from "vitest";
import { dayKey, dayLabel, sourceCampaignLabel, groupCount, busiestDay, type ConversationStartRow } from "@/lib/reports-data";

// UX-1 step 5 ("Results"): these pure helpers used to live, untested, inside
// app/reports/page.tsx. Moved to lib/reports-data.ts so /results can reuse
// them without duplicating the logic - now unit tested directly.

function row(overrides: Partial<ConversationStartRow> = {}): ConversationStartRow {
  return {
    assetType: "rotator",
    assetId: "asset-1",
    assetName: "My rotator",
    source: null,
    campaign: null,
    destination: null,
    createdAt: new Date("2026-10-14T12:00:00.000Z"),
    ...overrides,
  };
}

describe("dayKey", () => {
  it("returns the UTC yyyy-mm-dd for a date", () => {
    expect(dayKey(new Date("2026-10-14T23:59:59.000Z"))).toBe("2026-10-14");
    expect(dayKey(new Date("2026-01-01T00:00:00.000Z"))).toBe("2026-01-01");
  });

  it("buckets by a given timezone instead of UTC", () => {
    expect(dayKey(new Date("2026-10-14T23:30:00.000Z"), "Asia/Kolkata")).toBe("2026-10-15");
  });
});

describe("dayLabel", () => {
  it("formats a day key as a short UTC month/day label", () => {
    expect(dayLabel("2026-10-14")).toBe("Oct 14");
    expect(dayLabel("2026-01-01")).toBe("Jan 1");
  });
});

describe("sourceCampaignLabel", () => {
  it("falls back to Direct / untagged when there's no source", () => {
    expect(sourceCampaignLabel(null, null)).toBe("Direct / untagged");
    expect(sourceCampaignLabel("", null)).toBe("Direct / untagged");
  });

  it("uses the source alone when there's no campaign", () => {
    expect(sourceCampaignLabel("facebook", null)).toBe("Facebook");
    expect(sourceCampaignLabel("facebook", "")).toBe("Facebook");
  });

  it("joins source and campaign with a separator", () => {
    expect(sourceCampaignLabel("facebook", "spring_sale")).toBe("Facebook · spring sale");
  });

  it("trims whitespace on both sides", () => {
    expect(sourceCampaignLabel("  facebook  ", "  spring_sale  ")).toBe("Facebook · spring sale");
  });
});

describe("groupCount", () => {
  it("counts items by a derived key", () => {
    const counts = groupCount(["a", "b", "a", "c", "a"], (x) => x);
    expect(counts.get("a")).toBe(3);
    expect(counts.get("b")).toBe(1);
    expect(counts.get("c")).toBe(1);
  });

  it("returns an empty map for an empty list", () => {
    expect(groupCount([], (x: string) => x).size).toBe(0);
  });
});

describe("busiestDay", () => {
  it("returns the day with the most items", () => {
    const list: ConversationStartRow[] = [
      row({ createdAt: new Date("2026-10-14T01:00:00.000Z") }),
      row({ createdAt: new Date("2026-10-14T02:00:00.000Z") }),
      row({ createdAt: new Date("2026-10-15T01:00:00.000Z") }),
    ];
    expect(busiestDay(list)).toEqual({ key: "2026-10-14", count: 2 });
  });

  it("returns a null key and zero count for an empty list", () => {
    expect(busiestDay([])).toEqual({ key: null, count: 0 });
  });

  it("breaks ties by keeping the first day seen", () => {
    const list: ConversationStartRow[] = [
      row({ createdAt: new Date("2026-10-14T01:00:00.000Z") }),
      row({ createdAt: new Date("2026-10-15T01:00:00.000Z") }),
    ];
    expect(busiestDay(list)).toEqual({ key: "2026-10-14", count: 1 });
  });

  it("buckets by the given timezone instead of UTC", () => {
    // 2026-10-14T23:30:00Z is already 2026-10-15 in Asia/Kolkata (UTC+5:30).
    const list: ConversationStartRow[] = [
      row({ createdAt: new Date("2026-10-14T23:30:00.000Z") }),
      row({ createdAt: new Date("2026-10-15T01:00:00.000Z") }),
    ];
    expect(busiestDay(list, "Asia/Kolkata")).toEqual({ key: "2026-10-15", count: 2 });
    expect(busiestDay(list, "UTC")).toEqual({ key: "2026-10-14", count: 1 });
  });
});
