// TOOL-FREE-2: public "Report this link" reasons + auto-disable rule (audit
// item 4e). Pure/offline so it's unit tested without a database.
import { createHash } from "node:crypto";

export const REPORT_REASONS = ["phishing", "malware", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  phishing: "Phishing or scam",
  malware: "Malware",
  spam: "Spam",
  other: "Other",
};

export function isValidReportReason(value: unknown): value is ReportReason {
  return typeof value === "string" && (REPORT_REASONS as readonly string[]).includes(value);
}

// A link is auto-disabled once it collects this many reports - admins can
// still re-enable it from the admin panel (app/admin/crm/ShortLinksWorkspace.tsx).
export const AUTO_DISABLE_REPORT_THRESHOLD = 3;

export function shouldAutoDisable(reportCountAfterThisReport: number): boolean {
  return reportCountAfterThisReport >= AUTO_DISABLE_REPORT_THRESHOLD;
}

/** Hash of the reporter's IP (never the raw address) - just enough to rate-limit repeat reports. */
export function hashReporterIp(ip: string): string {
  return createHash("sha256").update(ip).digest("hex");
}
