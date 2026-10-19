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
  startOfDayInTz,
  addDaysInTz,
  dayKeyInTz,
  sanitizeTimeZone,
  legacyPeriodToResultsPeriod,
  resultsPeriodRange,
  resolveResultsSelection,
  describePeriodText,
  describeCompareText,
  computeShare,
  pickTop,
  parseLinkFilter,
  formatLinkFilterValue,
  linkFilterTypeFromAssetType,
  buildResultsExportQuery,
  buildSummarySentence,
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

  it("buckets days in the given timezone instead of UTC", () => {
    // Range is local midnight-to-midnight in Kolkata (UTC+5:30) for Oct 1-3.
    const start = startOfDayInTz(new Date("2026-10-01T12:00:00.000Z"), "Asia/Kolkata");
    const range = { start, end: addDaysInTz(start, 3, "Asia/Kolkata") };
    const counts = new Map([["2026-10-02", 5]]);
    const series = buildChatSeries(counts, range, "Asia/Kolkata");
    expect(series.map((p) => p.key)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(series.map((p) => p.count)).toEqual([0, 5, 0]);
  });
});

// ---------------------------------------------------------------------------
// /results redesign helpers
// ---------------------------------------------------------------------------

describe("startOfDayInTz", () => {
  it("returns UTC midnight for tz=UTC", () => {
    expect(startOfDayInTz(new Date("2026-10-14T23:59:00.000Z"), "UTC").toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });

  it("returns local midnight for a fixed-offset zone (Asia/Kolkata, UTC+5:30)", () => {
    // 2026-10-14T20:00:00Z is 2026-10-15T01:30 in Kolkata -> local midnight is 2026-10-14T18:30:00Z.
    const result = startOfDayInTz(new Date("2026-10-14T20:00:00.000Z"), "Asia/Kolkata");
    expect(result.toISOString()).toBe("2026-10-14T18:30:00.000Z");
  });

  it("rolls back to the previous UTC day's local midnight when local time is still yesterday", () => {
    // 2026-10-14T03:00:00Z is 2026-10-13T23:00 in America/New_York (UTC-4 in October, DST) -> midnight is 2026-10-13T04:00:00Z.
    const result = startOfDayInTz(new Date("2026-10-14T03:00:00.000Z"), "America/New_York");
    expect(result.toISOString()).toBe("2026-10-13T04:00:00.000Z");
  });
});

describe("addDaysInTz", () => {
  it("steps forward by whole calendar days in UTC", () => {
    const start = startOfDayInTz(new Date("2026-10-14T00:00:00.000Z"), "UTC");
    expect(addDaysInTz(start, 1, "UTC").toISOString()).toBe("2026-10-15T00:00:00.000Z");
    expect(addDaysInTz(start, -7, "UTC").toISOString()).toBe("2026-10-07T00:00:00.000Z");
  });

  it("steps forward by whole local calendar days for a fixed-offset zone", () => {
    const start = startOfDayInTz(new Date("2026-10-14T20:00:00.000Z"), "Asia/Kolkata"); // 2026-10-14T18:30:00Z
    const next = addDaysInTz(start, 1, "Asia/Kolkata");
    expect(next.toISOString()).toBe("2026-10-15T18:30:00.000Z");
  });
});

describe("dayKeyInTz", () => {
  it("matches the UTC calendar date for tz=UTC", () => {
    expect(dayKeyInTz(new Date("2026-10-14T23:30:00.000Z"), "UTC")).toBe("2026-10-14");
  });

  it("uses the local calendar date for a zone ahead of UTC", () => {
    // 23:30 UTC is already 2026-10-15 05:00 in Asia/Kolkata.
    expect(dayKeyInTz(new Date("2026-10-14T23:30:00.000Z"), "Asia/Kolkata")).toBe("2026-10-15");
  });
});

describe("sanitizeTimeZone", () => {
  it("accepts a valid IANA zone name", () => {
    expect(sanitizeTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  });

  it("falls back to UTC for missing or invalid input", () => {
    expect(sanitizeTimeZone(null)).toBe("UTC");
    expect(sanitizeTimeZone(undefined)).toBe("UTC");
    expect(sanitizeTimeZone("")).toBe("UTC");
    expect(sanitizeTimeZone("Not/AZone")).toBe("UTC");
    expect(sanitizeTimeZone("<script>")).toBe("UTC");
  });
});

describe("legacyPeriodToResultsPeriod", () => {
  it("passes through a valid new-style period", () => {
    expect(legacyPeriodToResultsPeriod("today")).toBe("today");
    expect(legacyPeriodToResultsPeriod("7d")).toBe("7d");
    expect(legacyPeriodToResultsPeriod("30d")).toBe("30d");
  });

  it("maps the old week/month periods onto the nearest new chip", () => {
    expect(legacyPeriodToResultsPeriod("this_week")).toBe("7d");
    expect(legacyPeriodToResultsPeriod("last_week")).toBe("7d");
    expect(legacyPeriodToResultsPeriod("this_month")).toBe("30d");
    expect(legacyPeriodToResultsPeriod("last_month")).toBe("30d");
  });

  it("returns null for anything else", () => {
    expect(legacyPeriodToResultsPeriod(undefined)).toBeNull();
    expect(legacyPeriodToResultsPeriod("bogus")).toBeNull();
  });
});

describe("resultsPeriodRange", () => {
  it("'today' is the current calendar day up to now", () => {
    const range = resultsPeriodRange("today", NOW, "UTC");
    expect(range.start.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(range.end).toEqual(NOW);
  });

  it("'7d' spans the 7 calendar days up to and including today", () => {
    const range = resultsPeriodRange("7d", NOW, "UTC");
    expect(range.start.toISOString()).toBe("2026-10-08T00:00:00.000Z");
    expect(range.end).toEqual(NOW);
  });

  it("'30d' spans the 30 calendar days up to and including today", () => {
    const range = resultsPeriodRange("30d", NOW, "UTC");
    expect(range.start.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(range.end).toEqual(NOW);
  });
});

describe("resolveResultsSelection", () => {
  it("defaults to 7d with no params", () => {
    const selection = resolveResultsSelection("full", {}, NOW, "UTC");
    expect(selection.period).toBe("7d");
    expect(selection.isCustom).toBe(false);
    expect(selection.canCompare).toBe(true);
    expect(selection.current).toEqual(resultsPeriodRange("7d", NOW, "UTC"));
    expect(selection.previous.end).toEqual(selection.current.start);
  });

  it("basic tier never compares and never accepts a custom range", () => {
    const selection = resolveResultsSelection("basic", { from: "2026-09-01", to: "2026-09-30" }, NOW, "UTC");
    expect(selection.isCustom).toBe(false);
    expect(selection.canCompare).toBe(false);
    expect(selection.period).toBe("7d");
  });

  it("full tier resolves a valid custom range", () => {
    const selection = resolveResultsSelection("full", { from: "2026-09-01", to: "2026-09-30" }, NOW, "UTC");
    expect(selection.isCustom).toBe(true);
    expect(selection.customError).toBeNull();
    expect(selection.current.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("compare=0 switches comparison off even on full tier", () => {
    const selection = resolveResultsSelection("full", { compare: "0" }, NOW, "UTC");
    expect(selection.canCompare).toBe(false);
  });

  it("falls back to the chip range with an error message for an invalid custom range", () => {
    const selection = resolveResultsSelection("full", { from: "2026-10-20", to: "2026-10-10" }, NOW, "UTC");
    expect(selection.isCustom).toBe(false);
    expect(selection.customError).toMatch(/on or before/);
  });
});

describe("describePeriodText / describeCompareText", () => {
  it("describes each chip in plain words", () => {
    expect(describePeriodText({ period: "today", isCustom: false, fromValue: "", toValue: "" })).toBe("today");
    expect(describePeriodText({ period: "7d", isCustom: false, fromValue: "", toValue: "" })).toBe("the last 7 days");
    expect(describePeriodText({ period: "30d", isCustom: false, fromValue: "", toValue: "" })).toBe("the last 30 days");
  });

  it("describes a custom range by its dates", () => {
    expect(describePeriodText({ period: "7d", isCustom: true, fromValue: "2026-09-01", toValue: "2026-09-30" })).toBe("2026-09-01 to 2026-09-30");
  });

  it("returns null for the compare text when comparison is off", () => {
    expect(describeCompareText({ period: "7d", isCustom: false, canCompare: false })).toBeNull();
  });

  it("describes the compare window for a chip and for a custom range", () => {
    expect(describeCompareText({ period: "7d", isCustom: false, canCompare: true })).toBe("the 7 days before");
    expect(describeCompareText({ period: "30d", isCustom: true, canCompare: true })).toBe("the period before");
  });
});

describe("computeShare", () => {
  it("rounds to the nearest percent", () => {
    expect(computeShare(1, 3)).toBe(33);
    expect(computeShare(2, 3)).toBe(67);
  });

  it("returns 0 for a zero total", () => {
    expect(computeShare(0, 0)).toBe(0);
  });

  it("returns 100 when count equals total", () => {
    expect(computeShare(5, 5)).toBe(100);
  });
});

describe("pickTop", () => {
  it("returns the row with the highest value", () => {
    const rows = [{ n: "a", v: 1 }, { n: "b", v: 5 }, { n: "c", v: 3 }];
    expect(pickTop(rows, (r) => r.v)?.n).toBe("b");
  });

  it("returns null for an empty list", () => {
    expect(pickTop([], (r: { v: number }) => r.v)).toBeNull();
  });

  it("keeps the first row seen on a tie", () => {
    const rows = [{ n: "a", v: 5 }, { n: "b", v: 5 }];
    expect(pickTop(rows, (r) => r.v)?.n).toBe("a");
  });
});

describe("link filter helpers", () => {
  it("round-trips format/parse", () => {
    expect(parseLinkFilter(formatLinkFilterValue("rotator", "abc123"))).toEqual({ type: "rotator", id: "abc123" });
    expect(parseLinkFilter(formatLinkFilterValue("shortlink", "xyz"))).toEqual({ type: "shortlink", id: "xyz" });
    expect(parseLinkFilter(formatLinkFilterValue("adlink", "z9"))).toEqual({ type: "adlink", id: "z9" });
  });

  it("rejects malformed or unknown-type values", () => {
    expect(parseLinkFilter(null)).toBeNull();
    expect(parseLinkFilter("")).toBeNull();
    expect(parseLinkFilter("no-colon")).toBeNull();
    expect(parseLinkFilter("bogus:123")).toBeNull();
    expect(parseLinkFilter("rotator:")).toBeNull();
  });

  it("maps ConversationStart assetType onto the LinkKind-flavoured filter type", () => {
    expect(linkFilterTypeFromAssetType("rotator")).toBe("rotator");
    expect(linkFilterTypeFromAssetType("short_link")).toBe("shortlink");
    expect(linkFilterTypeFromAssetType("ad_link")).toBe("adlink");
    expect(linkFilterTypeFromAssetType("something_else")).toBeNull();
  });
});

describe("buildResultsExportQuery", () => {
  it("uses period for a chip selection", () => {
    expect(buildResultsExportQuery({ isCustom: false, period: "7d", fromValue: "", toValue: "" }, null)).toBe("period=7d");
  });

  it("uses from/to for a custom selection", () => {
    const qs = buildResultsExportQuery({ isCustom: true, period: "30d", fromValue: "2026-09-01", toValue: "2026-09-30" }, null);
    expect(qs).toBe("from=2026-09-01&to=2026-09-30");
  });

  it("includes the link filter when present", () => {
    const qs = buildResultsExportQuery({ isCustom: false, period: "today", fromValue: "", toValue: "" }, "rotator:abc");
    expect(qs).toBe("period=today&link=rotator%3Aabc");
  });
});

describe("buildSummarySentence", () => {
  it("reports zero clicks plainly", () => {
    expect(
      buildSummarySentence({ periodText: "the last 7 days", compareText: "the 7 days before", clicks: 0, change: null, topSourceLabel: null, topSalespersonName: null })
    ).toBe("No clicks yet in the last 7 days.");
  });

  it("builds the full sentence with a positive change, source and top salesperson", () => {
    const sentence = buildSummarySentence({
      periodText: "the last 7 days",
      compareText: "the 7 days before",
      clicks: 168,
      change: { pct: 12, direction: "up", isNew: false },
      topSourceLabel: "Facebook",
      topSalespersonName: "Ravi",
    });
    expect(sentence).toBe("You got 168 clicks in the last 7 days, 12% more than the 7 days before. Most ad clicks came from Facebook. Ravi got the most.");
  });

  it("uses 'fewer' for a negative change", () => {
    const sentence = buildSummarySentence({
      periodText: "today",
      compareText: "yesterday",
      clicks: 3,
      change: { pct: -40, direction: "down", isNew: false },
      topSourceLabel: null,
      topSalespersonName: null,
    });
    expect(sentence).toBe("You got 3 clicks in today, 40% fewer than yesterday.");
  });

  it("omits the comparison clause when there's no previous data (isNew uses 'up from none')", () => {
    const sentence = buildSummarySentence({
      periodText: "today",
      compareText: "yesterday",
      clicks: 5,
      change: { pct: null, direction: "up", isNew: true },
      topSourceLabel: null,
      topSalespersonName: null,
    });
    expect(sentence).toBe("You got 5 clicks in today, up from none in yesterday.");
  });

  it("drops the comparison clause entirely when compareText is null", () => {
    const sentence = buildSummarySentence({
      periodText: "the last 30 days",
      compareText: null,
      clicks: 10,
      change: null,
      topSourceLabel: null,
      topSalespersonName: null,
    });
    expect(sentence).toBe("You got 10 clicks in the last 30 days.");
  });

  it("singularizes 1 click", () => {
    const sentence = buildSummarySentence({ periodText: "today", compareText: null, clicks: 1, change: null, topSourceLabel: null, topSalespersonName: null });
    expect(sentence).toBe("You got 1 click in today.");
  });
});
