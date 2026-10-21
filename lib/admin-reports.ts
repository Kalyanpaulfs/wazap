// Pure helpers for the admin Reports page (/admin/crm/reports,
// ReportsWorkspace.tsx). Kept dependency-free (no prisma) so they can be
// unit tested directly - same convention as lib/reports.ts / lib/reports-data.ts.
// The API (app/api/admin/crm/marketing?view=reports) always returns the last
// 12 months, oldest first; everything here slices/summarizes that same shape
// client-side (6 or 12 months) so the API response never has to change.

export type AdminReportsData = {
  months: string[]; // "YYYY-MM", ascending (oldest first), as returned by the API
  income: Record<string, Record<string, number>>;
  plansSold: Record<string, Record<string, number>>;
  refunds: Record<string, Record<string, number>>;
  refundCount: Record<string, number>;
  newPaidByMonth: Record<string, number>;
  expiredByMonth: Record<string, number>;
};

export type ReportsPeriod = 6 | 12;
export const REPORTS_PERIODS: ReportsPeriod[] = [6, 12];

/** The last `count` months of `months` (ascending in, ascending out). */
export function sliceMonths(months: string[], count: ReportsPeriod): string[] {
  return months.slice(Math.max(0, months.length - count));
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseMonthKey(key: string): { year: number; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return null;
  return { year, monthIndex };
}

/** "Nov" for a "YYYY-MM" key, or the key unchanged if malformed. */
export function monthShortLabel(key: string): string {
  const parsed = parseMonthKey(key);
  return parsed ? MONTH_NAMES[parsed.monthIndex] : key;
}

/** "Nov 2025" for a "YYYY-MM" key - used for the table and chart tooltips. */
export function monthLabelWithYear(key: string): string {
  const parsed = parseMonthKey(key);
  return parsed ? `${MONTH_NAMES[parsed.monthIndex]} ${parsed.year}` : key;
}

/** Chart x-axis labels: short month name, with the year appended on the
 * first point and whenever it changes from the previous point. */
export function chartMonthLabels(months: string[]): { month: string; label: string }[] {
  let lastYear: number | null = null;
  return months.map((month) => {
    const parsed = parseMonthKey(month);
    const short = monthShortLabel(month);
    if (parsed && parsed.year !== lastYear) {
      lastYear = parsed.year;
      return { month, label: `${short} ${parsed.year}` };
    }
    return { month, label: short };
  });
}

/** Per-currency income total across `months` (never adds currencies together). */
export function incomeTotals(data: AdminReportsData, months: string[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const month of months) {
    for (const [currency, amount] of Object.entries(data.income[month] || {})) {
      totals[currency] = (totals[currency] || 0) + amount;
    }
  }
  return totals;
}

/** The currency with the highest total income across `months`, or null when there is none. */
export function currencyWithMostIncome(data: AdminReportsData, months: string[]): string | null {
  const totals = incomeTotals(data, months);
  const entries = Object.entries(totals).filter(([, amount]) => amount > 0);
  if (!entries.length) return null;
  return entries.reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0];
}

export type IncomeSeriesPoint = { month: string; label: string; value: number };

/** One income bar per month, in `currency` only, in the same order as `months`. */
export function incomeSeries(data: AdminReportsData, months: string[], currency: string): IncomeSeriesPoint[] {
  const labels = chartMonthLabels(months);
  return months.map((month, i) => ({ month, label: labels[i].label, value: (data.income[month] || {})[currency] || 0 }));
}

export type PlansSoldSummary = { total: number; byPlan: Record<string, number> };

/** Total plans sold across `months`, broken down by plan key. */
export function plansSoldSummary(data: AdminReportsData, months: string[]): PlansSoldSummary {
  const byPlan: Record<string, number> = {};
  for (const month of months) {
    for (const [plan, count] of Object.entries(data.plansSold[month] || {})) {
      byPlan[plan] = (byPlan[plan] || 0) + count;
    }
  }
  const total = Object.values(byPlan).reduce((a, b) => a + b, 0);
  return { total, byPlan };
}

export type RefundsSummary = { count: number; byCurrency: Record<string, number> };

/** Refund count and per-currency amount across `months`. */
export function refundsSummary(data: AdminReportsData, months: string[]): RefundsSummary {
  let count = 0;
  const byCurrency: Record<string, number> = {};
  for (const month of months) {
    count += data.refundCount[month] || 0;
    for (const [currency, amount] of Object.entries(data.refunds[month] || {})) {
      byCurrency[currency] = (byCurrency[currency] || 0) + amount;
    }
  }
  return { count, byCurrency };
}

export type NewPaidSummary = { newPaid: number; expired: number };

/** New paying customers and expired-access count across `months`. */
export function newPaidSummary(data: AdminReportsData, months: string[]): NewPaidSummary {
  let newPaid = 0;
  let expired = 0;
  for (const month of months) {
    newPaid += data.newPaidByMonth[month] || 0;
    expired += data.expiredByMonth[month] || 0;
  }
  return { newPaid, expired };
}

export type MonthRow = {
  month: string;
  label: string;
  income: Record<string, number>;
  plansSold: number;
  refundCount: number;
  newPaid: number;
  expired: number;
  hasActivity: boolean;
};

/** One combined-table row per month, newest first. */
export function buildMonthRows(data: AdminReportsData, months: string[]): MonthRow[] {
  return [...months].reverse().map((month) => {
    const income = data.income[month] || {};
    const plansSold = Object.values(data.plansSold[month] || {}).reduce((a, b) => a + b, 0);
    const refundCount = data.refundCount[month] || 0;
    const newPaid = data.newPaidByMonth[month] || 0;
    const expired = data.expiredByMonth[month] || 0;
    const hasActivity = Object.values(income).some(Boolean) || plansSold > 0 || refundCount > 0 || newPaid > 0 || expired > 0;
    return { month, label: monthLabelWithYear(month), income, plansSold, refundCount, newPaid, expired, hasActivity };
  });
}

export type MonthRowsSplit = { active: MonthRow[]; inactiveCount: number };

/** Splits newest-first rows into the ones with any activity and a count of
 * the rest, so the caller can collapse "No activity in N earlier months"
 * into one muted line (expandable to show every month). */
export function splitActiveRows(rows: MonthRow[]): MonthRowsSplit {
  const active = rows.filter((row) => row.hasActivity);
  return { active, inactiveCount: rows.length - active.length };
}

/** Whether the whole period (every month in `months`) has zero activity - drives the page's empty state. */
export function periodHasActivity(data: AdminReportsData, months: string[]): boolean {
  return buildMonthRows(data, months).some((row) => row.hasActivity);
}
