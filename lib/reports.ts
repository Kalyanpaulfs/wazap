// Pure helpers for the Reports page (app/reports/page.tsx) and its CSV export
// route (app/api/reports/export/route.ts). Kept dependency-free (no prisma)
// so they can be unit tested directly.

const DAY_MS = 86_400_000;

export type ReportPeriod = "this_week" | "last_week" | "this_month" | "last_month";

export const REPORT_PERIODS: ReportPeriod[] = ["this_week", "last_week", "this_month", "last_month"];

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  this_week: "This week",
  last_week: "Last week",
  this_month: "This month",
  last_month: "Last month",
};

export type DateRange = { start: Date; end: Date }; // end is exclusive, UTC boundaries

function utcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** The Monday (UTC) on or before `date`, at UTC midnight. */
function mondayOnOrBefore(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const offsetFromMonday = (day + 6) % 7;
  return new Date(date.getTime() - offsetFromMonday * DAY_MS);
}

export function isReportPeriod(value: unknown): value is ReportPeriod {
  return typeof value === "string" && (REPORT_PERIODS as string[]).includes(value);
}

/** The UTC date range [start, end) for the given period. */
export function periodRange(period: ReportPeriod, now: Date = new Date()): DateRange {
  const today = utcMidnight(now);

  if (period === "this_week" || period === "last_week") {
    const thisMonday = mondayOnOrBefore(today);
    if (period === "this_week") return { start: thisMonday, end: new Date(thisMonday.getTime() + 7 * DAY_MS) };
    const lastMonday = new Date(thisMonday.getTime() - 7 * DAY_MS);
    return { start: lastMonday, end: thisMonday };
  }

  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  if (period === "this_month") {
    return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
  }
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}

/** A range of the same length as `range`, immediately before its start. */
export function rangeImmediatelyBefore(range: DateRange): DateRange {
  const length = range.end.getTime() - range.start.getTime();
  return { start: new Date(range.start.getTime() - length), end: range.start };
}

/**
 * The comparison range immediately before `range`: the previous calendar
 * month for the two month-based periods, or the same number of days
 * immediately before `range.start` for the two week-based periods.
 */
export function previousPeriodRange(period: ReportPeriod, range: DateRange): DateRange {
  if (period === "this_month" || period === "last_month") {
    const year = range.start.getUTCFullYear();
    const month = range.start.getUTCMonth();
    return { start: new Date(Date.UTC(year, month - 1, 1)), end: range.start };
  }
  return rangeImmediatelyBefore(range);
}

export function getPeriodBoundaries(period: ReportPeriod, now: Date = new Date()): { current: DateRange; previous: DateRange } {
  const current = periodRange(period, now);
  const previous = previousPeriodRange(period, current);
  return { current, previous };
}

/** A fixed last-`days`-days window ending at `now` (basic-tier Reports). */
export function lastNDaysRange(days: number, now: Date = new Date()): DateRange {
  return { start: new Date(now.getTime() - days * DAY_MS), end: now };
}

// ---------------------------------------------------------------------------
// Custom date range (full tier only). "from"/"to" are inclusive calendar days
// in "YYYY-MM-DD" form, interpreted as UTC. All limits below are rules, not
// UI-only hints: app/reports/page.tsx and app/api/reports/export/route.ts
// both go through resolveFullTierSelection so they stay in sync.
// ---------------------------------------------------------------------------

export const CUSTOM_RANGE_MAX_DAYS = 366;
export const CUSTOM_RANGE_MAX_YEARS_BACK = 2;

export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parses a "YYYY-MM-DD" string as a UTC-midnight Date. Returns null for any
 * malformed or out-of-range (e.g. "2026-02-30") input. */
export function parseDateParam(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export type CustomRangeOutcome =
  | { ok: true; range: DateRange; clampedToToday: boolean }
  | { ok: false; reason: string };

/**
 * Validates and resolves a custom "from"/"to" range (both inclusive calendar
 * days). Rules: both dates must parse; `to` in the future is clamped to
 * today (not an error); `from` must be on or before the (possibly clamped)
 * `to`; the range may span at most CUSTOM_RANGE_MAX_DAYS days; `from` may
 * not be earlier than CUSTOM_RANGE_MAX_YEARS_BACK years before today.
 */
export function resolveCustomRange(
  fromParam: string | null | undefined,
  toParam: string | null | undefined,
  now: Date = new Date()
): CustomRangeOutcome {
  const fromDate = parseDateParam(fromParam);
  const toDateRaw = parseDateParam(toParam);
  if (!fromDate || !toDateRaw) {
    return { ok: false, reason: "Enter a valid From and To date (YYYY-MM-DD)." };
  }

  const today = utcMidnight(now);
  const clampedToToday = toDateRaw.getTime() > today.getTime();
  const toDate = clampedToToday ? today : toDateRaw;

  if (fromDate.getTime() > toDate.getTime()) {
    return { ok: false, reason: "The From date must be on or before the To date." };
  }

  const earliest = new Date(Date.UTC(today.getUTCFullYear() - CUSTOM_RANGE_MAX_YEARS_BACK, today.getUTCMonth(), today.getUTCDate()));
  if (fromDate.getTime() < earliest.getTime()) {
    return { ok: false, reason: `Custom ranges can start at most ${CUSTOM_RANGE_MAX_YEARS_BACK} years back.` };
  }

  const end = new Date(toDate.getTime() + DAY_MS); // exclusive end, including the To day
  const rangeDays = Math.round((end.getTime() - fromDate.getTime()) / DAY_MS);
  if (rangeDays > CUSTOM_RANGE_MAX_DAYS) {
    return { ok: false, reason: `Custom ranges can span at most ${CUSTOM_RANGE_MAX_DAYS} days.` };
  }

  return { ok: true, range: { start: fromDate, end }, clampedToToday };
}

/** The comparison range for a custom range: the same length immediately
 * before `from`. */
export function previousCustomRange(range: DateRange): DateRange {
  return rangeImmediatelyBefore(range);
}

export type ReportSelection = {
  current: DateRange;
  previous: DateRange;
  /** The underlying fixed period, used as the fallback and for the period
   * picker's highlighted state. Meaningless when `isCustom` is true. */
  period: ReportPeriod;
  isCustom: boolean;
  /** Set when from/to were supplied but invalid; callers should show it and
   * fall back to `period`'s boundaries (already reflected in current/previous). */
  customError: string | null;
  clampedToToday: boolean;
  /** Values to prefill the date inputs with, "" when not applicable. */
  fromValue: string;
  toValue: string;
};

/**
 * Resolves what a FULL-tier Reports view (page or CSV export) should show,
 * given raw query params. Basic/free tiers must never call this — they
 * ignore from/to entirely and use lastNDaysRange instead.
 */
export function resolveFullTierSelection(
  params: { period?: string | null; from?: string | null; to?: string | null },
  now: Date = new Date()
): ReportSelection {
  const period: ReportPeriod = isReportPeriod(params.period) ? params.period : "this_month";
  const hasRangeParams = Boolean(params.from || params.to);

  if (hasRangeParams) {
    const outcome = resolveCustomRange(params.from, params.to, now);
    if (outcome.ok) {
      return {
        current: outcome.range,
        previous: previousCustomRange(outcome.range),
        period,
        isCustom: true,
        customError: null,
        clampedToToday: outcome.clampedToToday,
        fromValue: toDateInputValue(outcome.range.start),
        toValue: toDateInputValue(new Date(outcome.range.end.getTime() - DAY_MS)),
      };
    }
    const fallback = getPeriodBoundaries(period, now);
    return {
      current: fallback.current,
      previous: fallback.previous,
      period,
      isCustom: false,
      customError: outcome.reason,
      clampedToToday: false,
      fromValue: params.from ?? "",
      toValue: params.to ?? "",
    };
  }

  const fallback = getPeriodBoundaries(period, now);
  return {
    current: fallback.current,
    previous: fallback.previous,
    period,
    isCustom: false,
    customError: null,
    clampedToToday: false,
    fromValue: "",
    toValue: "",
  };
}

export function periodLengthDays(range: DateRange): number {
  return Math.max(1, Math.round((range.end.getTime() - range.start.getTime()) / DAY_MS));
}

export function isWithinRange(date: Date, range: DateRange): boolean {
  return date >= range.start && date < range.end;
}

export type Change = { pct: number | null; direction: "up" | "down" | "flat"; isNew: boolean };

/** Percentage change of `current` vs `previous`. previous===0 with current>0 is reported as "new". */
export function computeChange(current: number, previous: number): Change {
  if (previous === 0) {
    if (current === 0) return { pct: null, direction: "flat", isNew: false };
    return { pct: null, direction: "up", isNew: true };
  }
  const raw = ((current - previous) / previous) * 100;
  const pct = Math.round(raw * 10) / 10;
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return { pct, direction, isNew: false };
}

export function formatChange(change: Change): string {
  if (change.isNew) return "new";
  if (change.pct === null) return "–";
  const arrow = change.direction === "up" ? "▲" : change.direction === "down" ? "▼" : "▬";
  return `${arrow} ${Math.abs(change.pct)}%`;
}

/** Escapes one CSV cell: quotes values containing commas/quotes/newlines, and
 * neutralizes formula injection by prefixing a leading =, +, - or @ with a
 * single quote. */
export function escapeCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/["\n\r,]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsvRow(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(",");
}

export function toCsv(rows: unknown[][]): string {
  return rows.map(toCsvRow).join("\r\n");
}

// ---------------------------------------------------------------------------
// "Chats per day" series (Reports page, both tiers): a zero-filled count per
// calendar day across a date range, or — once the range is long enough that
// a per-day bar chart would be unreadable — grouped into Monday-start weeks
// instead. Pure and dependency-free so it can be unit tested directly.
// ---------------------------------------------------------------------------

/** Ranges longer than this many days are grouped by week instead of by day. */
export const CHAT_SERIES_WEEKLY_THRESHOLD_DAYS = 62;

export type ChatSeriesPoint = { key: string; label: string; count: number };

function dayKeyUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Monday (UTC) on or before `date`, at UTC midnight. */
function mondayOnOrBeforeDate(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const offsetFromMonday = (day + 6) % 7;
  return new Date(date.getTime() - offsetFromMonday * DAY_MS);
}

function dayPointLabel(key: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${key}T00:00:00.000Z`));
}

function weekPointLabel(mondayKey: string): string {
  return `Week of ${dayPointLabel(mondayKey)}`;
}

/**
 * Builds a zero-filled series of chat counts across `[range.start, range.end)`
 * (UTC calendar days), given a map of "YYYY-MM-DD" day key to count. When the
 * range spans more than `CHAT_SERIES_WEEKLY_THRESHOLD_DAYS` days, days are
 * grouped into Monday-start weeks (labelled "Week of <Mon D>") instead of one
 * point per day.
 */
export function buildChatSeries(countsByDay: Map<string, number>, range: DateRange, tz: string = "UTC"): ChatSeriesPoint[] {
  // Steps local calendar days (in `tz`) from range.start to range.end, rather
  // than dividing the ms span by DAY_MS, so a DST transition inside the
  // range can't shift a day's bucket by an hour. tz="UTC" is the common,
  // cheap case (no Intl calls, identical to the old fixed-DAY_MS stepping).
  const days: { key: string; count: number }[] = [];
  let cursor = range.start;
  let guard = 0;
  while (cursor.getTime() < range.end.getTime() && guard < 400) {
    const key = tz === "UTC" ? dayKeyUTC(cursor) : dayKeyInTz(cursor, tz);
    days.push({ key, count: countsByDay.get(key) ?? 0 });
    cursor = tz === "UTC" ? new Date(cursor.getTime() + DAY_MS) : addDaysInTz(cursor, 1, tz);
    guard++;
  }
  const totalDays = days.length;

  if (totalDays <= CHAT_SERIES_WEEKLY_THRESHOLD_DAYS) {
    return days.map((day) => ({ key: day.key, label: dayPointLabel(day.key), count: day.count }));
  }

  const weekOrder: string[] = [];
  const weekCounts = new Map<string, number>();
  for (const day of days) {
    const weekKey = dayKeyUTC(mondayOnOrBeforeDate(new Date(`${day.key}T00:00:00.000Z`)));
    if (!weekCounts.has(weekKey)) {
      weekCounts.set(weekKey, 0);
      weekOrder.push(weekKey);
    }
    weekCounts.set(weekKey, (weekCounts.get(weekKey) ?? 0) + day.count);
  }
  return weekOrder.map((weekKey) => ({ key: weekKey, label: weekPointLabel(weekKey), count: weekCounts.get(weekKey) ?? 0 }));
}

// ---------------------------------------------------------------------------
// /results redesign: timezone-aware day bucketing, the new Today/7 days/30
// days + Custom range period chips (replacing the fixed this_week/last_week/
// this_month/last_month system above for the page itself - that system stays
// exported as-is since app/api/reports/export and the tests above still use
// it, and old /results?period=this_week-style bookmarks are mapped onto the
// nearest new chip by legacyPeriodToResultsPeriod so they keep working), and
// small presentation helpers (share %, top picks, link-filter parsing,
// summary sentence) extracted so they're unit-testable without Prisma.
// ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000;
const HALF_DAY_MS = 12 * HOUR_MS;

/** ms to add to a UTC instant to read it as local wall-clock time (in `tz`) while staying in UTC-field arithmetic. 0 for "UTC" (fast path, no Intl). */
function tzOffsetMs(date: Date, tz: string): number {
  if (tz === "UTC") return 0;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
    .formatToParts(date)
    .reduce((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {} as Record<string, string>);
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - date.getTime();
}

/** The UTC instant of local midnight, in `tz`, for whichever calendar day `date` falls on there. */
export function startOfDayInTz(date: Date, tz: string): Date {
  if (tz === "UTC") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const offset = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + offset);
  const localMidnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(localMidnightAsUtc - offset);
}

/**
 * `date` (expected to already be a tz-midnight instant) shifted by `days`
 * calendar days in `tz`, re-snapped to that day's true midnight so a DST
 * transition can't drift the boundary by an hour.
 */
export function addDaysInTz(date: Date, days: number, tz: string): Date {
  return startOfDayInTz(new Date(date.getTime() + days * DAY_MS + HALF_DAY_MS), tz);
}

/** "YYYY-MM-DD" calendar-day key for `date` in `tz`. */
export function dayKeyInTz(date: Date, tz: string): string {
  if (tz === "UTC") return date.toISOString().slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Validates a client-supplied IANA zone name (the `tz` cookie); anything invalid or missing falls back to "UTC". */
export function sanitizeTimeZone(value: string | null | undefined): string {
  if (!value) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return value;
  } catch {
    return "UTC";
  }
}

// ---- New period chips: Today / 7 days / 30 days / Custom range -----------

export type ResultsPeriod = "today" | "7d" | "30d";
export const RESULTS_PERIODS: ResultsPeriod[] = ["today", "7d", "30d"];
export const RESULTS_PERIOD_LABELS: Record<ResultsPeriod, string> = { today: "Today", "7d": "7 days", "30d": "30 days" };
export const RESULTS_PERIOD_DAYS: Record<ResultsPeriod, number> = { today: 1, "7d": 7, "30d": 30 };

export function isResultsPeriod(value: unknown): value is ResultsPeriod {
  return typeof value === "string" && (RESULTS_PERIODS as string[]).includes(value);
}

// Bookmarks from the previous (very short-lived) /results?period=this_week
// etc. system are mapped onto the nearest new chip.
const LEGACY_PERIOD_TO_RESULTS_PERIOD: Record<ReportPeriod, ResultsPeriod> = {
  this_week: "7d",
  last_week: "7d",
  this_month: "30d",
  last_month: "30d",
};

export function legacyPeriodToResultsPeriod(value: string | null | undefined): ResultsPeriod | null {
  if (isResultsPeriod(value)) return value;
  if (isReportPeriod(value)) return LEGACY_PERIOD_TO_RESULTS_PERIOD[value];
  return null;
}

/**
 * The rolling [start, now) window for a period chip, bucketed in `tz` -
 * e.g. "7d" is the 7 calendar days up to and including today, ending live at
 * `now` (not at tomorrow's midnight), matching how the old Overview tab
 * counted "chats today" / "last 7 days" / "last 30 days".
 */
export function resultsPeriodRange(period: ResultsPeriod, now: Date, tz: string): DateRange {
  const todayStart = startOfDayInTz(now, tz);
  const start = addDaysInTz(todayStart, -(RESULTS_PERIOD_DAYS[period] - 1), tz);
  return { start, end: now };
}

export type ResultsSelection = {
  period: ResultsPeriod;
  current: DateRange;
  previous: DateRange;
  isCustom: boolean;
  customError: string | null;
  clampedToToday: boolean;
  fromValue: string;
  toValue: string;
  /** Whether a previous-period comparison is both allowed (full tier) and switched on (the "Compare with previous period" chip). */
  canCompare: boolean;
};

/**
 * Resolves the period chip / custom range selection for /results, given raw
 * query params. `tier` gates which features apply: Custom range and Compare
 * are full-tier only (basic/free-trial-equivalent "basic" tier always gets
 * the plain chip range with no comparison, regardless of params).
 */
export function resolveResultsSelection(
  tier: "basic" | "full",
  params: { period?: string | null; from?: string | null; to?: string | null; compare?: string | null },
  now: Date,
  tz: string
): ResultsSelection {
  const period = legacyPeriodToResultsPeriod(params.period) ?? "7d";
  const canCompare = tier === "full" && params.compare !== "0";
  const hasRangeParams = tier === "full" && Boolean(params.from || params.to);

  if (hasRangeParams) {
    const outcome = resolveCustomRange(params.from, params.to, now);
    if (outcome.ok) {
      return {
        period,
        current: outcome.range,
        previous: previousCustomRange(outcome.range),
        isCustom: true,
        customError: null,
        clampedToToday: outcome.clampedToToday,
        fromValue: toDateInputValue(outcome.range.start),
        toValue: toDateInputValue(new Date(outcome.range.end.getTime() - DAY_MS)),
        canCompare,
      };
    }
    const fallback = resultsPeriodRange(period, now, tz);
    return {
      period,
      current: fallback,
      previous: rangeImmediatelyBefore(fallback),
      isCustom: false,
      customError: outcome.reason,
      clampedToToday: false,
      fromValue: params.from ?? "",
      toValue: params.to ?? "",
      canCompare,
    };
  }

  const current = resultsPeriodRange(period, now, tz);
  return {
    period,
    current,
    previous: rangeImmediatelyBefore(current),
    isCustom: false,
    customError: null,
    clampedToToday: false,
    fromValue: "",
    toValue: "",
    canCompare,
  };
}

export function periodPhrase(period: ResultsPeriod): string {
  if (period === "today") return "today";
  if (period === "7d") return "the last 7 days";
  return "the last 30 days";
}

export function comparePhrase(period: ResultsPeriod): string {
  if (period === "today") return "yesterday";
  if (period === "7d") return "the 7 days before";
  return "the 30 days before";
}

/** Plain-words period text for the summary sentence / page subheading, e.g. "the last 7 days" or "2026-09-01 to 2026-09-30". */
export function describePeriodText(selection: Pick<ResultsSelection, "period" | "isCustom" | "fromValue" | "toValue">): string {
  if (selection.isCustom) return `${selection.fromValue} to ${selection.toValue}`;
  return periodPhrase(selection.period);
}

/** Plain-words text for what the comparison covers, or null when comparison isn't available/on. */
export function describeCompareText(selection: Pick<ResultsSelection, "period" | "isCustom" | "canCompare">): string | null {
  if (!selection.canCompare) return null;
  if (selection.isCustom) return "the period before";
  return comparePhrase(selection.period);
}

export function computeShare(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}

/** The row with the highest `valueFn(row)`, or null for an empty list. Ties keep the first one seen. */
export function pickTop<T>(rows: readonly T[], valueFn: (row: T) => number): T | null {
  if (!rows.length) return null;
  return rows.reduce((best, row) => (valueFn(row) > valueFn(best) ? row : best));
}

// ---- Link filter (?link=<type>:<id>) --------------------------------------
// `type` uses the LinkKind vocabulary (lib/my-links.ts: "rotator" /
// "shortlink" / "adlink") rather than ConversationStart's own `assetType`
// spelling ("rotator" / "short_link" / "ad_link"), since that's what a link
// detail page already has at hand (its `kind` prop) with no extra mapping.
export type LinkFilterType = "rotator" | "shortlink" | "adlink";

export const LINK_FILTER_TYPE_TO_ASSET_TYPE: Record<LinkFilterType, string> = {
  rotator: "rotator",
  shortlink: "short_link",
  adlink: "ad_link",
};

const ASSET_TYPE_TO_LINK_FILTER_TYPE: Record<string, LinkFilterType> = {
  rotator: "rotator",
  short_link: "shortlink",
  ad_link: "adlink",
};

export function linkFilterTypeFromAssetType(assetType: string): LinkFilterType | null {
  return ASSET_TYPE_TO_LINK_FILTER_TYPE[assetType] ?? null;
}

export type LinkFilter = { type: LinkFilterType; id: string };

export function formatLinkFilterValue(type: LinkFilterType, id: string): string {
  return `${type}:${id}`;
}

/** Parses a "?link=<type>:<id>" value. Returns null for anything malformed or an unknown type. */
export function parseLinkFilter(value: string | null | undefined): LinkFilter | null {
  if (!value) return null;
  const sep = value.indexOf(":");
  if (sep < 1 || sep === value.length - 1) return null;
  const type = value.slice(0, sep);
  const id = value.slice(sep + 1);
  if (type !== "rotator" && type !== "shortlink" && type !== "adlink") return null;
  return { type, id };
}

/** The query string for /api/reports/export matching the current period + link filter selection. */
export function buildResultsExportQuery(
  selection: Pick<ResultsSelection, "isCustom" | "period" | "fromValue" | "toValue">,
  link: string | null
): string {
  const qs = new URLSearchParams();
  if (selection.isCustom) {
    qs.set("from", selection.fromValue);
    qs.set("to", selection.toValue);
  } else {
    qs.set("period", selection.period);
  }
  if (link) qs.set("link", link);
  return qs.toString();
}

export function buildSummarySentence(opts: {
  periodText: string;
  compareText: string | null;
  clicks: number;
  change: Change | null;
  topSourceLabel: string | null;
  topSalespersonName: string | null;
}): string {
  const { periodText, compareText, clicks, change, topSourceLabel, topSalespersonName } = opts;
  if (clicks === 0) return `No clicks yet in ${periodText}.`;

  let lead = `You got ${clicks.toLocaleString()} click${clicks === 1 ? "" : "s"} in ${periodText}`;
  if (change && compareText) {
    if (change.isNew) {
      lead += `, up from none in ${compareText}`;
    } else if (change.pct !== null && change.pct !== 0) {
      const word = change.direction === "up" ? "more" : "fewer";
      lead += `, ${Math.abs(change.pct)}% ${word} than ${compareText}`;
    }
  }
  const sentences = [`${lead}.`];
  if (topSourceLabel) sentences.push(`Most ad clicks came from ${topSourceLabel}.`);
  if (topSalespersonName) sentences.push(`${topSalespersonName} got the most.`);
  return sentences.join(" ");
}
