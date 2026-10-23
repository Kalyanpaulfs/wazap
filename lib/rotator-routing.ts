// Pure routing-selection helpers for the Lead rotator (RotatorLink),
// dependency-free so pause-aware rotation can be unit tested without a
// database. Shared by lib/router-claim.ts (the atomic per-click claim) and
// app/r/[code]/route.ts (the public redirect, including its degraded-cache
// fallback) so both apply the exact same rule: a paused number is skipped,
// but rotation otherwise stays fair/round-robin among the numbers that
// remain active.

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** Digits-only, >=8-digit numbers from `numbers`, in original order (same rule app/r/[code]/route.ts and lib/router-claim.ts already apply). */
export function validNumbers(numbers: readonly string[]): string[] {
  return numbers.map(onlyDigits).filter((n) => n.length >= 8);
}

/** `numbers` (validated as above) minus anything present in `pausedNumbers`. Both sides are normalized to digits-only, so either list may contain a leading '+' or other noise. */
export function activeNumbers(numbers: readonly string[], pausedNumbers: readonly string[]): string[] {
  const paused = new Set(pausedNumbers.map(onlyDigits));
  return validNumbers(numbers).filter((n) => !paused.has(n));
}

/**
 * True only when the rotator HAS at least one valid number and every single
 * one of them is paused. A rotator with zero valid numbers at all is not
 * "all paused" by this helper - that's the pre-existing "invalid rotator"
 * case, handled separately (and unaffected by this feature).
 */
export function allNumbersPaused(numbers: readonly string[], pausedNumbers: readonly string[]): boolean {
  const valid = validNumbers(numbers);
  return valid.length > 0 && activeNumbers(numbers, pausedNumbers).length === 0;
}

/**
 * Picks the destination number for one click out of the numbers that are
 * NOT paused, given an ever-increasing claim counter (e.g. the post-
 * increment RotatorLink.currentIdx — see lib/router-claim.ts). Rotation
 * stays fair among the active numbers because the counter keeps advancing
 * by 1 on every claim regardless of how many numbers happen to be active
 * right now - pausing/resuming a number never resets or skews it.
 *
 * Returns null when there is no active number to send to at all (every
 * number is paused, or there were no valid numbers to begin with) - every
 * number paused means the link is treated as paused. See
 * app/r/[code]/route.ts and lib/router-claim.ts.
 */
export function pickRotatorNumber(numbers: readonly string[], pausedNumbers: readonly string[], claimCounter: number): string | null {
  const active = activeNumbers(numbers, pausedNumbers);
  if (!active.length) return null;
  const idx = ((claimCounter % active.length) + active.length) % active.length;
  return active[idx];
}
