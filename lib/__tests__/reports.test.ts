import { describe, expect, it } from "vitest";
import {
  computeChange,
  escapeCsvCell,
  getPeriodBoundaries,
  isWithinRange,
  periodLengthDays,
  periodRange,
  previousPeriodRange,
  toCsv,
  toCsvRow,
  formatChange,
  parseDateParam,
  resolveCustomRange,
  previousCustomRange,
  resolveFullTierSelection,
  toDateInputValue,
  buildChatSeries,
  CHAT_SERIES_WEEKLY_THRESHOLD_DAYS,
} from "@/lib/reports";

// Wednesday 2026-10-14T12:00:00Z.
const NOW = new Date("2026-10-14T12:00:00.000Z");

describe("periodRange", () => {
  it("returns the current Mon-Sun UTC week for this_week", () => {
    const range = periodRange("this_week", NOW);
    expect(range.start.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("returns the prior Mon-Sun UTC week for last_week", () => {
    const range = periodRange("last_week", NOW);
    expect(range.start.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-12T00:00:00.000Z");
  });

  it("returns the current calendar month for this_month", () => {
    const range = periodRange("this_month", NOW);
    expect(range.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("returns the previous calendar month for last_month", () => {
    const range = periodRange("last_month", NOW);
    expect(range.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });

  it("treats a Sunday as the last day of the prior Monday's week", () => {
    const sunday = new Date("2026-10-18T08:00:00.000Z");
    const range = periodRange("this_week", sunday);
    expect(range.start.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-10-19T00:00:00.000Z");
  });

  it("handles a year boundary for last_month", () => {
    const jan = new Date("2026-01-15T00:00:00.000Z");
    const range = periodRange("last_month", jan);
    expect(range.start.toISOString()).toBe("2025-12-01T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("previousPeriodRange / getPeriodBoundaries", () => {
  it("this_week's previous range is exactly last_week's range", () => {
    const boundaries = getPeriodBoundaries("this_week", NOW);
    const lastWeek = periodRange("last_week", NOW);
    expect(boundaries.previous).toEqual(lastWeek);
  });

  it("last_week's previous range is the week before that", () => {
    const range = periodRange("last_week", NOW);
    const previous = previousPeriodRange("last_week", range);
    expect(previous.start.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(previous.end.toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("this_month's previous range is the previous calendar month, regardless of length", () => {
    const march = new Date("2026-03-15T00:00:00.000Z");
    const boundaries = getPeriodBoundaries("this_month", march);
    expect(boundaries.previous.start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(boundaries.previous.end.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("last_month's previous range is two calendar months back", () => {
    const boundaries = getPeriodBoundaries("last_month", NOW);
    expect(boundaries.previous.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(boundaries.previous.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("periodLengthDays / isWithinRange", () => {
  it("counts a calendar week as 7 days", () => {
    expect(periodLengthDays(periodRange("this_week", NOW))).toBe(7);
  });

  it("counts October as 31 days", () => {
    expect(periodLengthDays(periodRange("this_month", NOW))).toBe(31);
  });

  it("treats the range end as exclusive", () => {
    const range = periodRange("this_week", NOW);
    expect(isWithinRange(range.start, range)).toBe(true);
    expect(isWithinRange(range.end, range)).toBe(false);
    expect(isWithinRange(new Date(range.end.getTime() - 1), range)).toBe(true);
  });
});

describe("computeChange", () => {
  it("reports 'new' when previous was 0 and current is positive", () => {
    const change = computeChange(5, 0);
    expect(change.isNew).toBe(true);
    expect(change.direction).toBe("up");
    expect(formatChange(change)).toBe("new");
  });

  it("reports flat with no pct when both are 0", () => {
    const change = computeChange(0, 0);
    expect(change.isNew).toBe(false);
    expect(change.pct).toBeNull();
    expect(change.direction).toBe("flat");
  });

  it("computes a positive percentage change", () => {
    const change = computeChange(150, 100);
    expect(change.pct).toBe(50);
    expect(change.direction).toBe("up");
    expect(formatChange(change)).toBe("▲ 50%");
  });

  it("computes a negative percentage change", () => {
    const change = computeChange(50, 100);
    expect(change.pct).toBe(-50);
    expect(change.direction).toBe("down");
    expect(formatChange(change)).toBe("▼ 50%");
  });

  it("rounds to one decimal place", () => {
    const change = computeChange(1, 3);
    expect(change.pct).toBeCloseTo(-66.7, 5);
  });
});

describe("escapeCsvCell", () => {
  it("leaves a plain value untouched", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
  });

  it("quotes a value containing a comma", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
  });

  it("doubles internal quotes and wraps in quotes", () => {
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("quotes a value containing a newline", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralizes a leading equals sign (formula injection)", () => {
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
  });

  it("neutralizes a leading plus, minus and at sign", () => {
    expect(escapeCsvCell("+1234")).toBe("'+1234");
    expect(escapeCsvCell("-1234")).toBe("'-1234");
    expect(escapeCsvCell("@mention")).toBe("'@mention");
  });

  it("handles null and undefined as an empty cell", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("quotes after neutralizing a formula when the value also has a comma", () => {
    expect(escapeCsvCell("=A1,A2")).toBe('"\'=A1,A2"');
  });
});

describe("toCsvRow / toCsv", () => {
  it("joins escaped cells with commas", () => {
    expect(toCsvRow(["a", "b,c", 3])).toBe('a,"b,c",3');
  });

  it("joins rows with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", "d"]])).toBe("a,b\r\nc,d");
  });
});

describe("parseDateParam", () => {
  it("parses a valid calendar date as UTC midnight", () => {
    expect(parseDateParam("2026-09-01")?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rejects malformed strings", () => {
    expect(parseDateParam("2026/09/01")).toBeNull();
    expect(parseDateParam("09-01-2026")).toBeNull();
    expect(parseDateParam("not-a-date")).toBeNull();
    expect(parseDateParam("")).toBeNull();
    expect(parseDateParam(null)).toBeNull();
    expect(parseDateParam(undefined)).toBeNull();
  });

  it("rejects a calendar date that does not exist", () => {
    expect(parseDateParam("2026-02-30")).toBeNull();
    expect(parseDateParam("2026-13-01")).toBeNull();
  });

  it("accepts Feb 29 only in a leap year", () => {
    expect(parseDateParam("2024-02-29")).not.toBeNull();
    expect(parseDateParam("2026-02-29")).toBeNull();
  });
});

describe("resolveCustomRange", () => {
  it("resolves a valid inclusive range (end is exclusive, the day after To)", () => {
    const outcome = resolveCustomRange("2026-09-01", "2026-09-30", NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.range.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
      expect(outcome.range.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
      expect(outcome.clampedToToday).toBe(false);
    }
  });

  it("rejects malformed or non-existent dates", () => {
    expect(resolveCustomRange("not-a-date", "2026-09-30", NOW).ok).toBe(false);
    expect(resolveCustomRange("2026-09-01", "2026-02-30", NOW).ok).toBe(false);
    expect(resolveCustomRange(null, "2026-09-30", NOW).ok).toBe(false);
  });

  it("rejects From after To", () => {
    const outcome = resolveCustomRange("2026-10-20", "2026-10-10", NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/on or before/);
  });

  it("clamps a To date in the future to today", () => {
    const outcome = resolveCustomRange("2026-10-01", "2026-10-20", NOW); // NOW is 2026-10-14
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.clampedToToday).toBe(true);
      expect(outcome.range.end.toISOString()).toBe("2026-10-15T00:00:00.000Z"); // today + 1 day
    }
  });

  it("rejects when clamping To to today puts it before From", () => {
    const outcome = resolveCustomRange("2026-10-20", "2026-10-25", NOW); // both after NOW, To clamps to today but From stays after
    expect(outcome.ok).toBe(false);
  });

  it("rejects a range longer than 366 days", () => {
    const outcome = resolveCustomRange("2025-01-01", "2026-10-14", NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/366 days/);
  });

  it("accepts a range exactly at the 366-day limit", () => {
    const to = new Date(NOW.getTime());
    const from = new Date(to.getTime() - 365 * 86_400_000);
    expect(resolveCustomRange(toDateInputValue(from), toDateInputValue(to), NOW).ok).toBe(true);
  });

  it("rejects a range one day past the 366-day limit", () => {
    const to = new Date(NOW.getTime());
    const from = new Date(to.getTime() - 366 * 86_400_000);
    expect(resolveCustomRange(toDateInputValue(from), toDateInputValue(to), NOW).ok).toBe(false);
  });

  it("rejects a From date more than 2 years back", () => {
    const outcome = resolveCustomRange("2024-01-01", "2024-06-01", NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/2 years/);
  });

  it("accepts a From date exactly 2 years back", () => {
    expect(resolveCustomRange("2024-10-14", "2024-10-20", NOW).ok).toBe(true);
  });
});

describe("previousCustomRange", () => {
  it("returns a range of the same length immediately before start", () => {
    const range = { start: new Date("2026-09-01T00:00:00.000Z"), end: new Date("2026-10-01T00:00:00.000Z") };
    const previous = previousCustomRange(range);
    expect(previous.end.toISOString()).toBe(range.start.toISOString());
    expect(previous.start.toISOString()).toBe("2026-08-02T00:00:00.000Z");
  });
});

describe("resolveFullTierSelection", () => {
  it("defaults to this_month with no params", () => {
    const selection = resolveFullTierSelection({}, NOW);
    expect(selection.isCustom).toBe(false);
    expect(selection.period).toBe("this_month");
    expect(selection.current).toEqual(periodRange("this_month", NOW));
    expect(selection.fromValue).toBe("");
    expect(selection.toValue).toBe("");
  });

  it("uses the given period when no range params are present", () => {
    const selection = resolveFullTierSelection({ period: "last_week" }, NOW);
    expect(selection.period).toBe("last_week");
    expect(selection.isCustom).toBe(false);
  });

  it("resolves a valid custom range and fills in from/to values", () => {
    const selection = resolveFullTierSelection({ from: "2026-09-01", to: "2026-09-30" }, NOW);
    expect(selection.isCustom).toBe(true);
    expect(selection.customError).toBeNull();
    expect(selection.fromValue).toBe("2026-09-01");
    expect(selection.toValue).toBe("2026-09-30");
    expect(selection.current.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(selection.previous.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("falls back to the period's boundaries with a message when the range is invalid", () => {
    const selection = resolveFullTierSelection({ period: "last_month", from: "2026-10-20", to: "2026-10-10" }, NOW);
    expect(selection.isCustom).toBe(false);
    expect(selection.customError).toMatch(/on or before/);
    expect(selection.current).toEqual(periodRange("last_month", NOW));
    expect(selection.fromValue).toBe("2026-10-20");
    expect(selection.toValue).toBe("2026-10-10");
  });
});

describe("buildChatSeries", () => {
  it("returns one zero-filled point per day for a short range", () => {
    const range = { start: new Date("2026-10-01T00:00:00.000Z"), end: new Date("2026-10-04T00:00:00.000Z") };
    const counts = new Map([["2026-10-02", 5]]);
    const series = buildChatSeries(counts, range);
    expect(series).toHaveLength(3);
    expect(series.map((p) => p.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(series.map((p) => p.count)).toEqual([0, 5, 0]);
    expect(series[0].label).toBe("Oct 1");
  });

  it("switches to weekly grouping once the range exceeds the threshold", () => {
    const days = CHAT_SERIES_WEEKLY_THRESHOLD_DAYS + 1;
    const range = { start: new Date("2026-01-01T00:00:00.000Z"), end: new Date(new Date("2026-01-01T00:00:00.000Z").getTime() + days * 86_400_000) };
    const series = buildChatSeries(new Map(), range);
    // Grouped into Monday-start weeks, so there are far fewer points than days.
    expect(series.length).toBeLessThan(days / 6);
    for (const point of series) {
      expect(point.label).toMatch(/^Week of /);
    }
  });

  it("sums counts within each week bucket and uses a Monday-start key", () => {
    // 2026-01-01 is a Thursday; the Monday on/before it is 2025-12-29.
    const days = CHAT_SERIES_WEEKLY_THRESHOLD_DAYS + 1;
    const start = new Date("2026-01-01T00:00:00.000Z");
    const range = { start, end: new Date(start.getTime() + days * 86_400_000) };
    const counts = new Map([
      ["2026-01-01", 2],
      ["2026-01-02", 3],
    ]);
    const series = buildChatSeries(counts, range);
    expect(series[0].key).toBe("2025-12-29");
    expect(series[0].count).toBe(5);
    expect(series[0].label).toBe("Week of Dec 29");
  });

  it("returns an empty series for a zero-length range", () => {
    const point = new Date("2026-10-14T00:00:00.000Z");
    expect(buildChatSeries(new Map(), { start: point, end: point })).toEqual([]);
  });
});
