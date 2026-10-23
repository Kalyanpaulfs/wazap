// FEAT-QUEUE: pure aggregation helpers for the owner's report (per contact,
// per member totals today/7d/all, and a "many customers in a few minutes"
// flag). DB querying lives in the API route (app/api/outreach/report); this
// file only shapes/derives numbers from rows already fetched, so it's
// unit-testable without a database.
import { toCsv } from "@/lib/reports";

export type MemberTotals = { memberId: string; memberName: string; today: number; last7Days: number; allTime: number; giveBackCount: number };

/** Buckets a flat list of (memberId, givenAt) rows into per-member totals for today/7d/all, relative to `now`. `giveBackCounts` is the member's lifetime OutreachMember.giveBackCount (STEP 0b), keyed by memberId - defaults to 0 for a member with no entry. */
export function memberTotals(
  rows: { memberId: string; memberName: string; givenAt: Date }[],
  now: Date,
  giveBackCounts: Map<string, number> = new Map()
): MemberTotals[] {
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const byMember = new Map<string, MemberTotals>();
  for (const row of rows) {
    const entry = byMember.get(row.memberId) ?? { memberId: row.memberId, memberName: row.memberName, today: 0, last7Days: 0, allTime: 0, giveBackCount: giveBackCounts.get(row.memberId) ?? 0 };
    entry.allTime++;
    if (row.givenAt >= sevenDaysAgo) entry.last7Days++;
    if (row.givenAt >= dayStart) entry.today++;
    byMember.set(row.memberId, entry);
  }
  return [...byMember.values()].sort((a, b) => b.allTime - a.allTime);
}

/**
 * Flags a member as having an unusually high number of give-backs relative
 * to how many customers they've been given overall - a possible sign of
 * mis-taps becoming a habit, or someone gaming the queue. Informational
 * only, same as hasBurst - never blocks a claim.
 */
export function hasManyGiveBacks(giveBackCount: number, allTimeGiven: number): boolean {
  if (giveBackCount < 5) return false;
  return giveBackCount >= Math.max(5, Math.ceil(allTimeGiven * 0.3));
}

/**
 * Flags a member as a possible burst/abuse pattern: `threshold` or more
 * contacts claimed within any `windowMinutes` sliding window. Used for the
 * owner's "flags (e.g. many customers in a few minutes)" report column -
 * informational only, never blocks a claim (lib/outreach/speed.ts's real
 * per-team speed limit already does the blocking).
 */
export function hasBurst(timestampsMs: number[], windowMinutes: number, threshold: number): boolean {
  if (timestampsMs.length < threshold) return false;
  const sorted = [...timestampsMs].sort((a, b) => a - b);
  const windowMs = windowMinutes * 60_000;
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (sorted[end] - sorted[start] > windowMs) start++;
    if (end - start + 1 >= threshold) return true;
  }
  return false;
}

export type ContactReportRow = {
  contactPhone: string;
  contactName: string | null;
  listName: string;
  memberName: string | null;
  givenAt: Date | null;
  givenBackAt: Date | null;
};

export function contactReportCsv(rows: ContactReportRow[]): string {
  return toCsv([
    ["phone", "name", "list", "salesperson", "given at", "given back at"],
    ...rows.map((r) => [r.contactPhone, r.contactName || "", r.listName, r.memberName || "", r.givenAt?.toISOString() || "", r.givenBackAt?.toISOString() || ""]),
  ]);
}
