import { describe, expect, it, vi } from "vitest";
import { selectPauseResume, isLinkDowngrade, linkLimitValue, isNewStyleTrial, previousLinkPlanFor, type RankCandidate } from "@/lib/plan-limit-sync";
import { ROTATOR_LIMITS, SHORT_LINK_LIMITS, AD_LINK_LIMITS } from "@/lib/plan-limits";

const DAY_MS = 24 * 60 * 60 * 1000;

function item(id: string, score: number, createdAt: string, planPausedAt: string | null = null): RankCandidate {
  return { id, score, createdAt: new Date(createdAt), planPausedAt: planPausedAt ? new Date(planPausedAt) : null };
}

describe("selectPauseResume", () => {
  it("pauses nothing and resumes nothing when everything already fits", () => {
    const items = [item("a", 10, "2026-01-01"), item("b", 5, "2026-01-02")];
    expect(selectPauseResume(items, 5)).toEqual({ pauseIds: [], resumeIds: [] });
  });

  it("keeps the highest-score items and pauses the rest (links/pages: clicks/views desc)", () => {
    const items = [
      item("most-clicked", 100, "2026-01-05"),
      item("mid", 50, "2026-01-01"),
      item("least-clicked", 1, "2026-01-03"),
    ];
    const { pauseIds, resumeIds } = selectPauseResume(items, 2);
    expect(pauseIds).toEqual(["least-clicked"]);
    expect(resumeIds).toEqual([]);
  });

  it("tie-breaks equal scores by createdAt ascending (oldest kept, newest paused)", () => {
    const items = [
      item("newest", 0, "2026-03-01"),
      item("oldest", 0, "2026-01-01"),
      item("middle", 0, "2026-02-01"),
    ];
    const { pauseIds } = selectPauseResume(items, 2);
    expect(pauseIds).toEqual(["newest"]);
  });

  it("models the 'newest extra member first to pause' rule with a uniform score", () => {
    const items = [
      item("owner-slot-irrelevant-here", 0, "2026-01-01"),
      item("member-2", 0, "2026-01-02"),
      item("member-3-newest", 0, "2026-01-03"),
    ];
    const { pauseIds } = selectPauseResume(items, 2);
    expect(pauseIds).toEqual(["member-3-newest"]);
  });

  it("resumes a plan-paused item once it fits back within the limit", () => {
    const items = [
      item("active-1", 10, "2026-01-01"),
      item("plan-paused-but-fits", 8, "2026-01-02", "2026-02-01"),
    ];
    const { pauseIds, resumeIds } = selectPauseResume(items, 5);
    expect(pauseIds).toEqual([]);
    expect(resumeIds).toEqual(["plan-paused-but-fits"]);
  });

  it("does not resume a plan-paused item that still does not fit", () => {
    const items = [
      item("active-1", 10, "2026-01-01"),
      item("active-2", 9, "2026-01-02"),
      item("plan-paused-still-over", 1, "2026-01-03", "2026-02-01"),
    ];
    const { pauseIds, resumeIds } = selectPauseResume(items, 2);
    expect(pauseIds).toEqual([]);
    expect(resumeIds).toEqual([]);
  });

  it("never re-selects an item that is already plan-paused for pausing again (idempotent)", () => {
    const items = [item("already-paused", 1, "2026-01-01", "2026-02-01")];
    expect(selectPauseResume(items, 0)).toEqual({ pauseIds: [], resumeIds: [] });
  });

  it("never touches a user-self-paused item (planPausedAt null, status handled by the caller)", () => {
    // selectPauseResume only knows about planPausedAt; a user-self-paused row
    // must be excluded from the input entirely by the caller before this
    // runs. Confirms that when planPausedAt is null, the item is always a
    // pause candidate from this function's point of view - the caller's
    // responsibility to filter user-paused items out is what keeps them safe.
    const items = [item("user-paused-but-looks-like-candidate", 0, "2026-01-01")];
    const { pauseIds } = selectPauseResume(items, 0);
    expect(pauseIds).toEqual(["user-paused-but-looks-like-candidate"]);
  });

  it("treats a negative-infinity score (no activity signal) consistently, falling back to createdAt", () => {
    const items = [
      item("no-activity-old", Number.NEGATIVE_INFINITY, "2026-01-01"),
      item("no-activity-new", Number.NEGATIVE_INFINITY, "2026-02-01"),
      item("has-activity", 1, "2026-03-01"),
    ];
    const { pauseIds } = selectPauseResume(items, 2);
    expect(pauseIds).toEqual(["no-activity-new"]);
  });

  it("treats an unlimited (Infinity) limit as pausing nothing and resuming everything", () => {
    const items = [
      item("a", 1, "2026-01-01"),
      item("b", 2, "2026-01-02", "2026-02-01"),
    ];
    const { pauseIds, resumeIds } = selectPauseResume(items, Number.POSITIVE_INFINITY);
    expect(pauseIds).toEqual([]);
    expect(resumeIds).toEqual(["b"]);
  });

  it("treats a zero limit as pausing every active candidate", () => {
    const items = [item("a", 10, "2026-01-01"), item("b", 5, "2026-01-02")];
    const { pauseIds } = selectPauseResume(items, 0);
    expect(pauseIds.sort()).toEqual(["a", "b"]);
  });
});

describe("linkLimitValue (lib/plan-limits.ts numbers, not the stale TOOL_LIMITS ones)", () => {
  it("reads the new 2026 rotator/short-link/ad-link caps per plan (Free-trial restructure: free is 0)", () => {
    expect(linkLimitValue(ROTATOR_LIMITS, "free")).toBe(0);
    expect(linkLimitValue(ROTATOR_LIMITS, "basic")).toBe(3);
    expect(linkLimitValue(ROTATOR_LIMITS, "pro")).toBe(10);
    expect(linkLimitValue(ROTATOR_LIMITS, "ultimate")).toBe(25);
    expect(linkLimitValue(SHORT_LINK_LIMITS, "free")).toBe(0);
    expect(linkLimitValue(SHORT_LINK_LIMITS, "pro")).toBe(5);
    expect(linkLimitValue(AD_LINK_LIMITS, "basic")).toBe(0);
    expect(linkLimitValue(AD_LINK_LIMITS, "ultimate")).toBe(15);
  });

  it("maps a legacy 'business' plan onto ultimate's numbers", () => {
    expect(linkLimitValue(ROTATOR_LIMITS, "business")).toBe(linkLimitValue(ROTATOR_LIMITS, "ultimate"));
  });
});

// Owner decision (FEAT-AUDIT-HARDENING): pausing rotators/short links/ad
// links must only happen on a real downgrade. These cover the decision
// function in isolation; tests/integration/pause-engine.test.ts exercises
// the same decision end-to-end through the real trigger points (a renewal
// charge, an admin re-activation, a downgrade, an expiry).
describe("isLinkDowngrade", () => {
  it("is not a downgrade when the plan renews unchanged (free)", () => {
    expect(isLinkDowngrade("pro", "pro", "u1")).toBe(false);
    expect(isLinkDowngrade("free", "free", "u1")).toBe(false);
  });

  it("is not a downgrade on an upgrade", () => {
    expect(isLinkDowngrade("basic", "pro", "u1")).toBe(false);
    expect(isLinkDowngrade("free", "ultimate", "u1")).toBe(false);
  });

  it("is a downgrade when the plan rank strictly decreases (Growth -> Solo)", () => {
    expect(isLinkDowngrade("pro", "basic", "u1")).toBe(true);
  });

  it("is a downgrade on paid -> free (expiry/cancel/refund/admin deactivate)", () => {
    expect(isLinkDowngrade("pro", "free", "u1")).toBe(true);
    expect(isLinkDowngrade("ultimate", "free", "u1")).toBe(true);
  });

  it("treats a legacy 'business' previous plan as ultimate rank, not lower than ultimate", () => {
    expect(isLinkDowngrade("business", "ultimate", "u1")).toBe(false);
    expect(isLinkDowngrade("business", "pro", "u1")).toBe(true);
  });

  it("is never a downgrade when the previous plan is unknown (null/undefined), and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(isLinkDowngrade(null, "basic", "u1")).toBe(false);
    expect(isLinkDowngrade(undefined, "free", "u1")).toBe(false);
    expect(isLinkDowngrade("", "free", "u1")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("never produces a false-positive downgrade for an unrecognized previous-plan string (falls back to free, rank 0)", () => {
    expect(isLinkDowngrade("not-a-real-plan", "free", "u1")).toBe(false);
    expect(isLinkDowngrade("not-a-real-plan", "basic", "u1")).toBe(false);
  });
});

// Owner decision (FEAT-AUDIT-HARDENING trial links, updated for the
// Free-trial restructure): the 3-day Free trial grants exactly Solo-level
// rotator/short-link/ad-link limits, so the previous-plan comparison
// isLinkDowngrade runs must be boosted to see that - but ONLY for a
// genuinely new-style (<=4 day) trial, never the old 14-day one.
describe("isNewStyleTrial", () => {
  it("is true for the current 3-day Free trial", () => {
    const start = new Date("2026-10-10T00:00:00.000Z");
    expect(isNewStyleTrial({ trialStartedAt: start, trialEndsAt: new Date(start.getTime() + 3 * DAY_MS) })).toBe(true);
  });

  it("is true at the 4-day boundary, false just past it", () => {
    const start = new Date("2026-10-10T00:00:00.000Z");
    expect(isNewStyleTrial({ trialStartedAt: start, trialEndsAt: new Date(start.getTime() + 4 * DAY_MS) })).toBe(true);
    expect(isNewStyleTrial({ trialStartedAt: start, trialEndsAt: new Date(start.getTime() + 4 * DAY_MS + 1) })).toBe(false);
  });

  it("is false for an old 14-day trial (grandfathered - never had Solo-level link limits)", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    expect(isNewStyleTrial({ trialStartedAt: start, trialEndsAt: new Date(start.getTime() + 14 * DAY_MS) })).toBe(false);
  });

  it("is false when trialStartedAt was never recorded (legacy users) - fails safe toward no boost", () => {
    expect(isNewStyleTrial({ trialStartedAt: null, trialEndsAt: new Date() })).toBe(false);
  });

  it("is false when trialEndsAt is missing, or end is not after start", () => {
    expect(isNewStyleTrial({ trialStartedAt: new Date(), trialEndsAt: null })).toBe(false);
    const d = new Date();
    expect(isNewStyleTrial({ trialStartedAt: d, trialEndsAt: d })).toBe(false);
  });
});

// Free-trial restructure (FEAT-FREE-TRIAL): the trial is EXACTLY Solo
// ("basic"). previousLinkPlanFor now ignores the stored trialPlan (fixtures
// below keep trialPlan: "pro" on purpose, to prove a legacy value from the
// old Growth trial is ignored) and only ever boosts up to "basic".
describe("previousLinkPlanFor", () => {
  const newTrialActive = { trialPlan: "pro", trialStartedAt: new Date(Date.now() - 1 * DAY_MS), trialEndsAt: new Date(Date.now() + 2 * DAY_MS) };
  const newTrialEndedYesterday = { trialPlan: "pro", trialStartedAt: new Date(Date.now() - 4 * DAY_MS), trialEndsAt: new Date(Date.now() - 1 * DAY_MS) };
  const newTrialEndedLongAgo = { trialPlan: "pro", trialStartedAt: new Date(Date.now() - 10 * DAY_MS), trialEndsAt: new Date(Date.now() - 5 * DAY_MS) };
  const oldStyleTrial = { trialPlan: "pro", trialStartedAt: new Date(Date.now() - 1 * DAY_MS), trialEndsAt: new Date(Date.now() + 13 * DAY_MS) };

  it("leaves an unknown previousPlan untouched (fail-safe stays intact)", () => {
    expect(previousLinkPlanFor(null, newTrialActive)).toBe(null);
    expect(previousLinkPlanFor(undefined, newTrialActive)).toBe(undefined);
    expect(previousLinkPlanFor("", newTrialActive)).toBe("");
  });

  it("boosts free up to Solo ('basic') while a new-style trial is still active (purchase made during the trial), ignoring the legacy trialPlan", () => {
    expect(previousLinkPlanFor("free", newTrialActive)).toBe("basic");
  });

  it("boosts free up to Solo ('basic') when the new-style trial ended within the last 2 days (cron lookback)", () => {
    expect(previousLinkPlanFor("free", newTrialEndedYesterday)).toBe("basic");
  });

  it("does not boost once the new-style trial ended more than 2 days ago", () => {
    expect(previousLinkPlanFor("free", newTrialEndedLongAgo)).toBe("free");
  });

  it("never boosts for an old-style (14-day) trial, even while it looks active (grandfathered)", () => {
    expect(previousLinkPlanFor("free", oldStyleTrial)).toBe("free");
  });

  it("does not boost a previousPlan already at Solo ('basic') or above - the trial never outranks Solo any more", () => {
    expect(previousLinkPlanFor("basic", newTrialActive)).toBe("basic");
    expect(previousLinkPlanFor("pro", newTrialActive)).toBe("pro");
    expect(previousLinkPlanFor("ultimate", newTrialActive)).toBe("ultimate");
  });

  it("leaves previousPlan untouched when there is no trial at all", () => {
    expect(previousLinkPlanFor("free", { trialPlan: null, trialStartedAt: null, trialEndsAt: null })).toBe("free");
  });
});
