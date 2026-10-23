import { describe, expect, it } from "vitest";
import { memberTotals, hasBurst, hasManyGiveBacks, contactReportCsv } from "@/lib/outreach/report";

describe("memberTotals", () => {
  it("buckets today/7d/all correctly", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const rows = [
      { memberId: "m1", memberName: "Ravi", givenAt: new Date("2026-10-22T10:00:00Z") }, // today
      { memberId: "m1", memberName: "Ravi", givenAt: new Date("2026-10-18T10:00:00Z") }, // within 7d
      { memberId: "m1", memberName: "Ravi", givenAt: new Date("2026-09-01T10:00:00Z") }, // all-time only
      { memberId: "m2", memberName: "Sara", givenAt: new Date("2026-10-22T09:00:00Z") },
    ];
    const totals = memberTotals(rows, now);
    const ravi = totals.find((t) => t.memberId === "m1")!;
    expect(ravi.today).toBe(1);
    expect(ravi.last7Days).toBe(2);
    expect(ravi.allTime).toBe(3);
    const sara = totals.find((t) => t.memberId === "m2")!;
    expect(sara).toEqual({ memberId: "m2", memberName: "Sara", today: 1, last7Days: 1, allTime: 1, giveBackCount: 0 });
  });

  it("carries the member's lifetime giveBackCount through from the supplied map", () => {
    const now = new Date("2026-10-22T12:00:00Z");
    const totals = memberTotals(
      [{ memberId: "m1", memberName: "Ravi", givenAt: now }],
      now,
      new Map([["m1", 7]])
    );
    expect(totals[0].giveBackCount).toBe(7);
  });

  it("sorts by allTime descending", () => {
    const now = new Date();
    const totals = memberTotals(
      [
        { memberId: "low", memberName: "Low", givenAt: now },
        { memberId: "high", memberName: "High", givenAt: now },
        { memberId: "high", memberName: "High", givenAt: now },
      ],
      now
    );
    expect(totals.map((t) => t.memberId)).toEqual(["high", "low"]);
  });
});

describe("hasBurst", () => {
  it("flags 8+ claims within a 5 minute window", () => {
    const base = Date.now();
    const timestamps = Array.from({ length: 8 }, (_, i) => base + i * 30_000); // 8 claims, 30s apart = 3.5 min span
    expect(hasBurst(timestamps, 5, 8)).toBe(true);
  });

  it("does not flag spread-out claims", () => {
    const base = Date.now();
    const timestamps = Array.from({ length: 8 }, (_, i) => base + i * 10 * 60_000); // 10 min apart
    expect(hasBurst(timestamps, 5, 8)).toBe(false);
  });

  it("does not flag fewer than the threshold", () => {
    expect(hasBurst([1, 2, 3], 5, 8)).toBe(false);
  });
});

describe("hasManyGiveBacks", () => {
  it("never flags below 5 give-backs", () => {
    expect(hasManyGiveBacks(4, 1)).toBe(false);
  });

  it("flags 5+ give-backs that are a large share of all-time claims", () => {
    expect(hasManyGiveBacks(5, 10)).toBe(true); // 50% of 10
    expect(hasManyGiveBacks(6, 100)).toBe(false); // 6% of 100, not a large share
  });
});

describe("contactReportCsv", () => {
  it("renders a header row plus one row per contact", () => {
    const csv = contactReportCsv([
      { contactPhone: "971500000001", contactName: "Ali", listName: "List A", memberName: "Ravi", givenAt: new Date("2026-10-22T10:00:00Z"), givenBackAt: null },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("phone,name,list,salesperson,given at,given back at");
    expect(lines[1]).toContain("971500000001");
    expect(lines[1]).toContain("Ravi");
  });
});
