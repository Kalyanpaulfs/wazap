import { describe, expect, it } from "vitest";
import { shouldAutoDisable, isValidReportReason, hashReporterIp, REPORT_REASONS, AUTO_DISABLE_REPORT_THRESHOLD } from "@/lib/short-url-reports";

describe("shouldAutoDisable (TOOL-FREE-2, audit item 4e)", () => {
  it("does not disable below the threshold", () => {
    expect(shouldAutoDisable(0)).toBe(false);
    expect(shouldAutoDisable(1)).toBe(false);
    expect(shouldAutoDisable(2)).toBe(false);
  });

  it("disables at and above the threshold (3)", () => {
    expect(AUTO_DISABLE_REPORT_THRESHOLD).toBe(3);
    expect(shouldAutoDisable(3)).toBe(true);
    expect(shouldAutoDisable(4)).toBe(true);
  });
});

describe("isValidReportReason", () => {
  it("accepts every declared reason", () => {
    for (const reason of REPORT_REASONS) expect(isValidReportReason(reason)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidReportReason("hacking")).toBe(false);
    expect(isValidReportReason("")).toBe(false);
    expect(isValidReportReason(undefined)).toBe(false);
    expect(isValidReportReason(123)).toBe(false);
  });
});

describe("hashReporterIp", () => {
  it("never returns the raw IP", () => {
    const hashed = hashReporterIp("203.0.113.5");
    expect(hashed).not.toContain("203.0.113.5");
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same IP, different for different IPs", () => {
    expect(hashReporterIp("1.2.3.4")).toBe(hashReporterIp("1.2.3.4"));
    expect(hashReporterIp("1.2.3.4")).not.toBe(hashReporterIp("1.2.3.5"));
  });
});
