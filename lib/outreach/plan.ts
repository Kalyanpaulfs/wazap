// FEAT-QUEUE: pure plan-gating decisions for team outreach. The actual
// per-plan numbers live in lib/plan-limits.ts (teamOutreachAvailable /
// teamOutreachContactLimit / teamOutreachMemberLimit) - same single source
// of truth every other plan-gated feature uses. This module just wraps
// "current count vs limit" into reusable, unit-testable yes/no helpers.
import { canCreateMore } from "@/lib/plan-limits";

/** Can one more active member be added? */
export function canAddMember(currentActiveCount: number, memberLimit: number): boolean {
  return canCreateMore(currentActiveCount, memberLimit);
}

/** Can `newContactsCount` more contacts be added on top of the team's current total? */
export function canUploadContacts(currentTotalCount: number, newContactsCount: number, contactLimit: number): boolean {
  return currentTotalCount + newContactsCount <= contactLimit;
}

/** How many more contacts may still be uploaded before the plan's total is hit (never negative). */
export function remainingContactRoom(currentTotalCount: number, contactLimit: number): number {
  return Math.max(0, contactLimit - currentTotalCount);
}
