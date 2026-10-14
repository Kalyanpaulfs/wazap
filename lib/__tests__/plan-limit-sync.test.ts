import { describe, expect, it } from "vitest";
import { selectPauseResume, type RankCandidate } from "@/lib/plan-limit-sync";

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
