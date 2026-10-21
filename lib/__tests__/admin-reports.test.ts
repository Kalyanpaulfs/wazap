import { describe, expect, it } from "vitest";
import {
  sliceMonths,
  monthShortLabel,
  monthLabelWithYear,
  chartMonthLabels,
  incomeTotals,
  currencyWithMostIncome,
  incomeSeries,
  plansSoldSummary,
  refundsSummary,
  newPaidSummary,
  buildMonthRows,
  splitActiveRows,
  periodHasActivity,
  type AdminReportsData,
} from "@/lib/admin-reports";

const MONTHS_12 = ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

function emptyData(months: string[] = MONTHS_12): AdminReportsData {
  const blank: Record<string, Record<string, number>> = {};
  const blankCount: Record<string, number> = {};
  for (const m of months) {
    blank[m] = {};
    blankCount[m] = 0;
  }
  return { months, income: {}, plansSold: {}, refunds: {}, refundCount: { ...blankCount }, newPaidByMonth: { ...blankCount }, expiredByMonth: { ...blankCount } };
}

describe("sliceMonths", () => {
  it("returns the last 6 months, ascending", () => {
    expect(sliceMonths(MONTHS_12, 6)).toEqual(["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  });
  it("returns all 12 months unchanged", () => {
    expect(sliceMonths(MONTHS_12, 12)).toEqual(MONTHS_12);
  });
  it("never slices past the start of a shorter list", () => {
    expect(sliceMonths(["2026-10"], 6)).toEqual(["2026-10"]);
  });
});

describe("month labels", () => {
  it("formats a short month name", () => {
    expect(monthShortLabel("2026-10")).toBe("Oct");
    expect(monthShortLabel("2025-11")).toBe("Nov");
  });
  it("formats with year", () => {
    expect(monthLabelWithYear("2026-10")).toBe("Oct 2026");
  });
  it("falls back to the raw key when malformed", () => {
    expect(monthShortLabel("not-a-month")).toBe("not-a-month");
  });
});

describe("chartMonthLabels", () => {
  it("shows the year only on the first point and when the year changes", () => {
    const labels = chartMonthLabels(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(labels).toEqual([
      { month: "2025-11", label: "Nov 2025" },
      { month: "2025-12", label: "Dec" },
      { month: "2026-01", label: "Jan 2026" },
      { month: "2026-02", label: "Feb" },
    ]);
  });
});

describe("incomeTotals / currencyWithMostIncome", () => {
  it("sums per currency across months and never mixes currencies", () => {
    const data = emptyData(["2026-09", "2026-10"]);
    data.income["2026-09"] = { USD: 50, EUR: 10 };
    data.income["2026-10"] = { USD: 44 };
    expect(incomeTotals(data, data.months)).toEqual({ USD: 94, EUR: 10 });
  });

  it("picks the currency with the highest total across the whole period", () => {
    const data = emptyData(["2026-09", "2026-10"]);
    data.income["2026-09"] = { USD: 20, EUR: 70 };
    data.income["2026-10"] = { USD: 10 };
    expect(currencyWithMostIncome(data, data.months)).toBe("EUR");
  });

  it("returns null with no income at all", () => {
    const data = emptyData();
    expect(currencyWithMostIncome(data, data.months)).toBeNull();
  });
});

describe("incomeSeries", () => {
  it("builds one zero-filled bar per month for the chosen currency", () => {
    const data = emptyData(["2026-09", "2026-10"]);
    data.income["2026-10"] = { USD: 44 };
    expect(incomeSeries(data, data.months, "USD")).toEqual([
      { month: "2026-09", label: "Sep 2026", value: 0 },
      { month: "2026-10", label: "Oct", value: 44 },
    ]);
  });
});

describe("plansSoldSummary", () => {
  it("totals plans sold across months, broken down by plan", () => {
    const data = emptyData(["2026-09", "2026-10"]);
    data.plansSold["2026-09"] = { solo: 2 };
    data.plansSold["2026-10"] = { solo: 1, growth: 1 };
    expect(plansSoldSummary(data, data.months)).toEqual({ total: 4, byPlan: { solo: 3, growth: 1 } });
  });
  it("is zero with no plans sold", () => {
    const data = emptyData();
    expect(plansSoldSummary(data, data.months)).toEqual({ total: 0, byPlan: {} });
  });
});

describe("refundsSummary", () => {
  it("totals refund count and per-currency amount", () => {
    const data = emptyData(["2026-09", "2026-10"]);
    data.refundCount["2026-09"] = 1;
    data.refundCount["2026-10"] = 2;
    data.refunds["2026-09"] = { USD: 20 };
    data.refunds["2026-10"] = { USD: 10, EUR: 5 };
    expect(refundsSummary(data, data.months)).toEqual({ count: 3, byCurrency: { USD: 30, EUR: 5 } });
  });
});

describe("newPaidSummary", () => {
  it("totals new paying customers and expired access", () => {
    const data = emptyData(["2026-09", "2026-10"]);
    data.newPaidByMonth["2026-09"] = 2;
    data.newPaidByMonth["2026-10"] = 3;
    data.expiredByMonth["2026-10"] = 1;
    expect(newPaidSummary(data, data.months)).toEqual({ newPaid: 5, expired: 1 });
  });
});

describe("buildMonthRows", () => {
  it("orders rows newest first", () => {
    const data = emptyData(["2026-09", "2026-10"]);
    const rows = buildMonthRows(data, data.months);
    expect(rows.map((r) => r.month)).toEqual(["2026-10", "2026-09"]);
    expect(rows[0].label).toBe("Oct 2026");
  });

  it("flags a month with any kind of activity", () => {
    const data = emptyData(["2026-09", "2026-10"]);
    data.income["2026-10"] = { USD: 5 };
    data.expiredByMonth["2026-09"] = 1;
    const rows = buildMonthRows(data, data.months);
    expect(rows.find((r) => r.month === "2026-10")?.hasActivity).toBe(true);
    expect(rows.find((r) => r.month === "2026-09")?.hasActivity).toBe(true);
  });

  it("flags a month with zero amounts (e.g. a currency key with 0) as inactive", () => {
    const data = emptyData(["2026-10"]);
    data.income["2026-10"] = { USD: 0 };
    expect(buildMonthRows(data, data.months)[0].hasActivity).toBe(false);
  });
});

describe("splitActiveRows", () => {
  it("separates active months from a count of inactive ones", () => {
    const data = emptyData(["2026-08", "2026-09", "2026-10"]);
    data.income["2026-10"] = { USD: 5 };
    const rows = buildMonthRows(data, data.months);
    const { active, inactiveCount } = splitActiveRows(rows);
    expect(active.map((r) => r.month)).toEqual(["2026-10"]);
    expect(inactiveCount).toBe(2);
  });

  it("returns everything active and zero inactive when all months have activity", () => {
    const data = emptyData(["2026-09", "2026-10"]);
    data.income["2026-09"] = { USD: 1 };
    data.income["2026-10"] = { USD: 1 };
    const rows = buildMonthRows(data, data.months);
    expect(splitActiveRows(rows).inactiveCount).toBe(0);
  });
});

describe("periodHasActivity", () => {
  it("is false when every month in the period is empty", () => {
    const data = emptyData();
    expect(periodHasActivity(data, data.months)).toBe(false);
  });
  it("is true when any month has activity", () => {
    const data = emptyData();
    data.plansSold["2026-10"] = { solo: 1 };
    expect(periodHasActivity(data, data.months)).toBe(true);
  });
});
