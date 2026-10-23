// FEAT-QUEUE: pure speed-limit / daily-cap decisions for claimNextContact
// (lib/outreach/claim.ts). Kept dependency-free from Prisma so the policy
// itself is unit-testable without a DB.

export type SpeedLimitCheck = { blocked: false } | { blocked: true; retryAfterMs: number };

/**
 * `speedLimitSeconds` is the owner's per-team setting (OutreachTeam.
 * speedLimitSeconds, default 20) - the minimum gap between two customers
 * handed to the SAME member. `lastGivenAt` is that member's
 * OutreachMember.lastGivenAt (null = never given one yet, never blocked).
 */
export function speedLimitCheck(lastGivenAt: Date | null, now: Date, speedLimitSeconds: number): SpeedLimitCheck {
  if (!lastGivenAt || speedLimitSeconds <= 0) return { blocked: false };
  const elapsedMs = now.getTime() - lastGivenAt.getTime();
  const requiredMs = speedLimitSeconds * 1000;
  if (elapsedMs >= requiredMs) return { blocked: false };
  return { blocked: true, retryAfterMs: requiredMs - elapsedMs };
}

/**
 * `dailyCap` is the owner's optional per-team setting (OutreachTeam.
 * dailyCap, default null = off). `givenTodayCount` is how many contacts
 * this member has already been given today (caller counts
 * OutreachContact rows with givenToMemberId = member AND givenAt in
 * today's window - lib/outreach/claim.ts).
 */
export function dailyCapReached(givenTodayCount: number, dailyCap: number | null | undefined): boolean {
  if (dailyCap == null || dailyCap <= 0) return false;
  return givenTodayCount >= dailyCap;
}

/** Start of the UTC calendar day containing `now` - phase 1 keeps the daily cap on a UTC day boundary (no per-team timezone setting yet). */
export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** True while `givenAt` is still within the 10-minute give-back window. */
export const GIVE_BACK_WINDOW_MS = 10 * 60_000;
export function withinGiveBackWindow(givenAt: Date, now: Date): boolean {
  return now.getTime() - givenAt.getTime() <= GIVE_BACK_WINDOW_MS;
}
