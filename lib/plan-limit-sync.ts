// Billing spec 12f/12g, step 2: pauses/resumes extras automatically when a
// user's plan changes (downgrade, refund, expiry, admin change) so usage
// never exceeds the current plan's limit, without deleting anything. Called
// AFTER (outside) every transaction that changes a user's plan - never from
// inside one, since it opens its own transaction and advisory lock.
//
// Safety: completely gated behind PLAN_LIMIT_PAUSING_ENABLED. When the flag
// is not exactly "true" this is a no-op that returns all-zero counts, so it
// is safe to deploy ahead of turning the flag on (see scripts/plan-limit-dry-run.ts).
//
// Pausing rotators/short links/ad links additionally requires proof of a
// real downgrade: callers pass `previousPlan` (the plan read BEFORE the
// change being reported), and pausing those three is skipped whenever the
// new plan's rank isn't strictly lower (renewal of the same plan, an
// upgrade, a same-plan admin re-activation, or an unresolvable previous
// plan all skip it) - see isLinkDowngrade. The one exception (Free-trial
// restructure, FEAT-FREE-TRIAL): whenever the user now resolves to "free"
// (no paid plan, no active Free trial), pausing is ALWAYS allowed, because
// every free limit is 0 and nothing is grandfathered there, no matter how
// the user arrived (trial lapse, an old trial, never trialled, or an
// unresolvable previous plan). Resuming is never gated by this: it always
// runs. Automations/AI/channels/API keys/webhooks/marketplace installs are
// unaffected by this gate and keep their existing behaviour.
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { effectivePlan, PRODUCT_TRIAL_PLAN } from "./entitlements";
import { linkPlan } from "./router-entitlements";
import { normalizePlanKey, ROTATOR_LIMITS, SHORT_LINK_LIMITS, AD_LINK_LIMITS, type PlanKey } from "./plan-limits";
import { CHANNEL_LIMITS } from "./channels";
import { AUTOMATION_LIMITS } from "./automations";
import { AI_AGENT_LIMITS, AI_KNOWLEDGE_LIMITS } from "./ai-agents";
import { API_KEY_LIMITS, WEBHOOK_LIMITS } from "./developer-platform";
import { MARKETPLACE_INSTALL_LIMITS } from "./marketplace";

type Tx = Prisma.TransactionClient;

export type SyncCounts = { paused: number; resumed: number };
export type SyncPlanLimitsResult = {
  rotators: SyncCounts;
  shortLinks: SyncCounts;
  adLinks: SyncCounts;
  automations: SyncCounts;
  aiAgents: SyncCounts;
  aiKnowledge: SyncCounts;
  channels: SyncCounts;
  apiKeys: SyncCounts;
  webhooks: SyncCounts;
  marketplaceInstalls: SyncCounts;
  // Leads are never paused (12g) - intentionally not a key here.
};

const ZERO: SyncCounts = { paused: 0, resumed: 0 };

function emptyResult(): SyncPlanLimitsResult {
  return {
    rotators: { ...ZERO }, shortLinks: { ...ZERO }, adLinks: { ...ZERO },
    automations: { ...ZERO }, aiAgents: { ...ZERO }, aiKnowledge: { ...ZERO },
    channels: { ...ZERO }, apiKeys: { ...ZERO }, webhooks: { ...ZERO }, marketplaceInstalls: { ...ZERO },
  };
}

function addCounts(target: SyncCounts, extra: SyncCounts) {
  target.paused += extra.paused;
  target.resumed += extra.resumed;
}

// ---------------------------------------------------------------------------
// Pure ranking/selection logic (unit tested in lib/__tests__/plan-limit-sync.test.ts).
// Keep the top `limit` items by score (desc), then createdAt (asc) as a
// tie-break ("most-used stay on" for links/tools, "oldest member stays on,
// newest extra paused" for team members, which pass a uniform score of 0).
// Items already over the limit that are not yet plan-paused get paused;
// items within the limit that are currently plan-paused get resumed.
// Never returns an id that isn't plan-paused (planPausedAt === null) for
// resume, and never returns an id that is already plan-paused for pause -
// so a second call with no changes is a true no-op (idempotent).
// ---------------------------------------------------------------------------
export type RankCandidate = {
  id: string;
  score: number;
  createdAt: Date;
  planPausedAt: Date | null;
};

export function selectPauseResume(items: RankCandidate[], limit: number): { pauseIds: string[]; resumeIds: string[] } {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : items.length;
  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const byCreated = a.createdAt.getTime() - b.createdAt.getTime();
    return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id);
  });
  const keep = new Set(sorted.slice(0, safeLimit).map((item) => item.id));
  return {
    pauseIds: sorted.filter((item) => !keep.has(item.id) && item.planPausedAt === null).map((item) => item.id),
    resumeIds: sorted.filter((item) => keep.has(item.id) && item.planPausedAt !== null).map((item) => item.id),
  };
}

function scoreOf(date: Date | null | undefined): number {
  return date ? date.getTime() : Number.NEGATIVE_INFINITY;
}

// Rank order for the downgrade check below: free < basic < pro < ultimate
// (business is folded into ultimate by normalizePlanKey). Only PAUSING for
// rotators/short links/ad links is gated on this; resume is unconditional.
const PLAN_RANK: Record<PlanKey, number> = { free: 0, basic: 1, pro: 2, ultimate: 3 };

export function linkLimitValue(limits: Record<PlanKey, number>, plan: string): number {
  const n = limits[normalizePlanKey(plan)];
  return n === -1 ? Number.POSITIVE_INFINITY : n;
}

// Owner decision (FEAT-AUDIT-HARDENING): pausing rotators/short links/ad
// links must only happen when the customer actually moved to a LOWER plan.
// `previousPlan` is whatever the caller read for that user BEFORE the plan
// change it is reporting committed - see each call site in billing-actions.ts/
// payment-integrity.ts/billing-expiry.ts/the admin + cron routes for exactly
// where that read happens. `null`/`undefined` means the caller could not
// determine it: fail safe to "not a downgrade" (no pause), and warn, rather
// than risk pausing something on an upgrade/renewal because of a bug
// upstream. An unrecognized non-empty string (never expected) normalizes to
// "free" (rank 0), which can never look lower than any new plan - so it can
// never produce a false-positive pause either.
export function isLinkDowngrade(previousPlan: string | null | undefined, newRawPlan: string, userId: string): boolean {
  if (previousPlan == null || previousPlan === "") {
    console.warn("[plan-limit-sync] previous plan unknown for user - skipping rotator/short-link/ad-link pausing (resume-only)", userId);
    return false;
  }
  return PLAN_RANK[normalizePlanKey(newRawPlan)] < PLAN_RANK[normalizePlanKey(previousPlan)];
}

// Owner decision (FEAT-AUDIT-HARDENING trial links, updated for the
// Free-trial restructure): a NEW-style trial (trialStartedAt and
// trialEndsAt both set, and no more than 4 days apart - the current 3-day
// Free trial, which is exactly Solo's limits) grants Solo-level rotator/
// short-link/ad-link limits for its duration (see
// lib/router-entitlements.ts linkPlan). This mostly matters now for legacy
// accounts whose stored trialPlan is still "pro" from the old Growth trial.
// Old 14-day trials predate that and must NEVER be treated as having had
// Growth link limits - missing trialStartedAt (never recorded for those
// users) or too long a span both fail safe to "not new-style", which is the
// side that skips the boost below (grandfathering).
export const NEW_STYLE_TRIAL_MAX_DAYS = 4;

export type TrialFieldsUser = {
  trialPlan?: string | null;
  trialStartedAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
};

export function isNewStyleTrial(user: TrialFieldsUser): boolean {
  if (!user.trialStartedAt || !user.trialEndsAt) return false;
  const start = new Date(user.trialStartedAt).getTime();
  const end = new Date(user.trialEndsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  return end - start <= NEW_STYLE_TRIAL_MAX_DAYS * 86_400_000;
}

// Covers both the "still active now" case (a purchase made during the
// trial) and the "ended recently" case (the cron's trial-lapse sweep, which
// looks back up to 2 days) with one check: a trial whose end is still in the
// future trivially satisfies this too.
const TRIAL_RELEVANCE_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

function trialStillRelevant(user: TrialFieldsUser, now: Date): boolean {
  if (!isNewStyleTrial(user)) return false;
  return new Date(user.trialEndsAt!).getTime() >= now.getTime() - TRIAL_RELEVANCE_WINDOW_MS;
}

// Owner decision (FEAT-AUDIT-HARDENING trial links): the previous-plan rank
// isLinkDowngrade compares against must reflect the Growth-level link limits
// a user actually had during an active new-style trial - a plain
// `previousPlan` never shows this, since the `plan` column stays "free" the
// whole time a trial runs. When `previousPlan` doesn't already reach "pro"
// on its own, and the user has a new-style trial that was still active (a
// purchase made during the trial) or ended within the last 2 days (the
// cron's lookback window), this bumps the comparison up to the higher of
// (previousPlan, trialPlan). An unknown previousPlan (null/undefined/"") is
// left untouched - isLinkDowngrade's existing fail-safe (no pause) still
// applies, exactly as before this feature.
export function previousLinkPlanFor(previousPlan: string | null | undefined, user: TrialFieldsUser, now = new Date()): string | null | undefined {
  if (previousPlan == null || previousPlan === "") return previousPlan;
  const prevKey = normalizePlanKey(previousPlan);
  if (PLAN_RANK[prevKey] >= PLAN_RANK.basic) return previousPlan;
  if (!trialStillRelevant(user, now)) return previousPlan;
  // Owner rule (Free-trial restructure): the trial is EXACTLY Solo - the
  // stored trialPlan is ignored here too, same as lib/entitlements.ts
  // effectivePlan and lib/router-entitlements.ts linkPlan, so a legacy
  // trialPlan: "pro" (from the old Growth trial) never makes a purchase
  // during the trial look like a downgrade from Growth-level limits the
  // user never actually had.
  const trialKey = normalizePlanKey(PRODUCT_TRIAL_PLAN);
  return PLAN_RANK[trialKey] > PLAN_RANK[prevKey] ? trialKey : previousPlan;
}

type UpdateMany = (where: Record<string, unknown>, data: Record<string, unknown>) => Promise<{ count: number }>;
// Every sync* function returns both the counts AND the selected ids. The
// write path (syncPlanLimits) only needs the counts; the read-only dry-run
// script (scripts/plan-limit-dry-run.ts) reuses the exact same selection by
// calling with apply=false, which skips every updateMany and reports
// pauseIds.length/resumeIds.length as if they had run - so the dry run can
// never drift from what a real sync would actually do.
export type SyncOutcome = SyncCounts & { pauseIds: string[]; resumeIds: string[] };

// Models with no `status` field at all (the 5 link/page tools + members):
// planPausedAt is the only on/off switch, so pause/resume is a plain write.
async function syncNoStatusModel(updateMany: UpdateMany, rows: RankCandidate[], limit: number, apply: boolean, allowPause = true): Promise<SyncOutcome> {
  const selected = selectPauseResume(rows, limit);
  // Resume always runs; pausing is skipped entirely when the caller has
  // determined this isn't a real downgrade (see isLinkDowngrade above).
  const pauseIds = allowPause ? selected.pauseIds : [];
  const { resumeIds } = selected;
  let paused = pauseIds.length, resumed = resumeIds.length;
  if (apply) {
    paused = pauseIds.length ? (await updateMany({ id: { in: pauseIds } }, { planPausedAt: new Date() })).count : 0;
    resumed = resumeIds.length ? (await updateMany({ id: { in: resumeIds } }, { planPausedAt: null })).count : 0;
  }
  return { paused, resumed, pauseIds, resumeIds };
}

function groupByFromStatus(rows: Array<{ id: string; planPausedFromStatus?: string | null }>, ids: string[]): Map<string, string[]> {
  const idSet = new Set(ids);
  const map = new Map<string, string[]>();
  for (const row of rows) {
    if (!idSet.has(row.id)) continue;
    const key = row.planPausedFromStatus || "active";
    map.set(key, [...(map.get(key) ?? []), row.id]);
  }
  return map;
}

async function pauseAndResume(updateMany: UpdateMany, pauseIds: string[], resumeGroups: Map<string, string[]>, pauseStatus: string, apply: boolean): Promise<SyncOutcome> {
  const resumeIds = [...resumeGroups.values()].flat();
  let paused = pauseIds.length, resumed = resumeIds.length;
  if (apply) {
    paused = pauseIds.length ? (await updateMany({ id: { in: pauseIds } }, { planPausedAt: new Date(), planPausedFromStatus: "active", status: pauseStatus })).count : 0;
    resumed = 0;
    for (const [fromStatus, ids] of resumeGroups) {
      if (!ids.length) continue;
      resumed += (await updateMany({ id: { in: ids } }, { planPausedAt: null, planPausedFromStatus: null, status: fromStatus })).count;
    }
  }
  return { paused, resumed, pauseIds, resumeIds };
}

// Models whose own create-route count filter does NOT already exclude every
// non-"active" row (AutomationRule/AiAgent: archivedAt:null only; Channel:
// status not "disabled"), so drafts and user-self-paused rows still occupy a
// slot. They stay untouched, but reduce how much room is left to rank into.
type StatusRow = { id: string; score: number; createdAt: Date; planPausedAt: Date | null; status: string; planPausedFromStatus: string | null };
async function syncWithOtherRows(updateMany: UpdateMany, rows: StatusRow[], limit: number, pauseStatus: string, apply: boolean): Promise<SyncOutcome> {
  const otherCount = rows.filter((r) => r.planPausedAt === null && r.status !== "active").length;
  const rankable = rows.filter((r) => r.planPausedAt !== null || r.status === "active");
  const candidates: RankCandidate[] = rankable.map((r) => ({ id: r.id, score: r.score, createdAt: r.createdAt, planPausedAt: r.planPausedAt }));
  const effectiveLimit = Number.isFinite(limit) ? Math.max(0, limit - otherCount) : limit;
  const { pauseIds, resumeIds } = selectPauseResume(candidates, effectiveLimit);
  return pauseAndResume(updateMany, pauseIds, groupByFromStatus(rankable, resumeIds), pauseStatus, apply);
}

// Models whose create-route count filter is already `status: "active"`, so a
// plan-paused row (status flipped away from "active") is never in that
// count - no "otherRows" bookkeeping needed, just fold in the separately
// queried plan-paused rows for resume consideration.
type ActiveRow = { id: string; score: number; createdAt: Date };
type PausedRow = ActiveRow & { planPausedAt: Date; planPausedFromStatus: string | null };
async function syncActiveStatusModel(updateMany: UpdateMany, activeRows: ActiveRow[], pausedRows: PausedRow[], limit: number, pauseStatus: string, apply: boolean): Promise<SyncOutcome> {
  const candidates: RankCandidate[] = [
    ...activeRows.map((r) => ({ id: r.id, score: r.score, createdAt: r.createdAt, planPausedAt: null })),
    ...pausedRows.map((r) => ({ id: r.id, score: r.score, createdAt: r.createdAt, planPausedAt: r.planPausedAt })),
  ];
  const { pauseIds, resumeIds } = selectPauseResume(candidates, limit);
  return pauseAndResume(updateMany, pauseIds, groupByFromStatus(pausedRows, resumeIds), pauseStatus, apply);
}

// --- Per-user link/page tools: rotator, short link, ad link ---
type LinkToolDelegate = {
  findMany: (args: { where: { userId: string }; select: Record<string, boolean> }) => Promise<Array<Record<string, unknown> & { id: string; createdAt: Date; planPausedAt: Date | null }>>;
  updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
};

async function syncLinkTool(tx: Tx, model: "rotatorLink" | "shortLink" | "adLink", userId: string, limit: number, scoreField: "totalClicks" | "clicks" | null, apply: boolean, allowPause = true): Promise<SyncOutcome> {
  const delegate = tx[model] as unknown as LinkToolDelegate;
  const rows = await delegate.findMany({ where: { userId }, select: { id: true, createdAt: true, planPausedAt: true, ...(scoreField ? { [scoreField]: true } : {}) } });
  const candidates: RankCandidate[] = rows.map((r) => ({ id: r.id, score: scoreField ? Number(r[scoreField] ?? 0) : 0, createdAt: r.createdAt, planPausedAt: r.planPausedAt }));
  const updateMany: UpdateMany = (where, data) => delegate.updateMany({ where: { ...where, userId }, data });
  return syncNoStatusModel(updateMany, candidates, limit, apply, allowPause);
}

async function syncAutomations(tx: Tx, workspaceId: string, plan: string, apply: boolean): Promise<SyncOutcome> {
  const limit = AUTOMATION_LIMITS[plan] ?? AUTOMATION_LIMITS.free;
  const rows = await tx.automationRule.findMany({
    where: { workspaceId, archivedAt: null },
    select: { id: true, status: true, lastRunAt: true, createdAt: true, planPausedAt: true, planPausedFromStatus: true },
  });
  const updateMany: UpdateMany = (where, data) => tx.automationRule.updateMany({ where: { ...where, workspaceId }, data });
  return syncWithOtherRows(updateMany, rows.map((r) => ({ id: r.id, score: scoreOf(r.lastRunAt), createdAt: r.createdAt, planPausedAt: r.planPausedAt, status: r.status, planPausedFromStatus: r.planPausedFromStatus })), limit, "paused", apply);
}

async function syncAiAgents(tx: Tx, workspaceId: string, plan: string, apply: boolean): Promise<SyncOutcome> {
  const limit = AI_AGENT_LIMITS[plan] ?? AI_AGENT_LIMITS.free;
  const rows = await tx.aiAgent.findMany({
    where: { workspaceId, archivedAt: null },
    select: { id: true, status: true, createdAt: true, planPausedAt: true, planPausedFromStatus: true },
  });
  const updateMany: UpdateMany = (where, data) => tx.aiAgent.updateMany({ where: { ...where, workspaceId }, data });
  // No "last run" scalar on AiAgent itself - falls back to createdAt asc (oldest kept).
  return syncWithOtherRows(updateMany, rows.map((r) => ({ id: r.id, score: Number.NEGATIVE_INFINITY, createdAt: r.createdAt, planPausedAt: r.planPausedAt, status: r.status, planPausedFromStatus: r.planPausedFromStatus })), limit, "paused", apply);
}

async function syncChannels(tx: Tx, workspaceId: string, plan: string, apply: boolean): Promise<SyncOutcome> {
  const limit = CHANNEL_LIMITS[plan] ?? CHANNEL_LIMITS.free;
  const rows = await tx.channelConnection.findMany({
    where: { workspaceId, status: { not: "disabled" } },
    select: { id: true, status: true, lastEventAt: true, createdAt: true, planPausedAt: true, planPausedFromStatus: true },
  });
  const updateMany: UpdateMany = (where, data) => tx.channelConnection.updateMany({ where: { ...where, workspaceId }, data });
  return syncWithOtherRows(updateMany, rows.map((r) => ({ id: r.id, score: scoreOf(r.lastEventAt), createdAt: r.createdAt, planPausedAt: r.planPausedAt, status: r.status, planPausedFromStatus: r.planPausedFromStatus })), limit, "paused", apply);
}

async function syncAiKnowledge(tx: Tx, workspaceId: string, plan: string, apply: boolean): Promise<SyncOutcome> {
  const limit = AI_KNOWLEDGE_LIMITS[plan] ?? AI_KNOWLEDGE_LIMITS.free;
  const [activeRows, pausedRows] = await Promise.all([
    tx.aiKnowledge.findMany({ where: { workspaceId, status: "active" }, select: { id: true, createdAt: true } }),
    // status must still be "paused" (what the pause wrote it to) - if the
    // user archived/changed it since, it is never a resume candidate even
    // if planPausedAt is still (stale) set.
    tx.aiKnowledge.findMany({ where: { workspaceId, status: "paused", planPausedAt: { not: null } }, select: { id: true, createdAt: true, planPausedAt: true, planPausedFromStatus: true } }),
  ]);
  const updateMany: UpdateMany = (where, data) => tx.aiKnowledge.updateMany({ where: { ...where, workspaceId }, data });
  return syncActiveStatusModel(
    updateMany,
    activeRows.map((r) => ({ id: r.id, score: Number.NEGATIVE_INFINITY, createdAt: r.createdAt })),
    pausedRows.map((r) => ({ id: r.id, score: Number.NEGATIVE_INFINITY, createdAt: r.createdAt, planPausedAt: r.planPausedAt!, planPausedFromStatus: r.planPausedFromStatus })),
    limit, "paused", apply,
  );
}

async function syncApiKeys(tx: Tx, workspaceId: string, plan: string, apply: boolean): Promise<SyncOutcome> {
  const limit = API_KEY_LIMITS[plan] ?? API_KEY_LIMITS.free;
  const [activeRows, pausedRows] = await Promise.all([
    tx.apiKey.findMany({ where: { workspaceId, status: "active" }, select: { id: true, lastUsedAt: true, createdAt: true } }),
    // status must still be "paused" - a key the user revoked since is never
    // a resume candidate even if planPausedAt is still (stale) set.
    tx.apiKey.findMany({ where: { workspaceId, status: "paused", planPausedAt: { not: null } }, select: { id: true, lastUsedAt: true, createdAt: true, planPausedAt: true, planPausedFromStatus: true } }),
  ]);
  const updateMany: UpdateMany = (where, data) => tx.apiKey.updateMany({ where: { ...where, workspaceId }, data });
  return syncActiveStatusModel(
    updateMany,
    activeRows.map((r) => ({ id: r.id, score: scoreOf(r.lastUsedAt), createdAt: r.createdAt })),
    pausedRows.map((r) => ({ id: r.id, score: scoreOf(r.lastUsedAt), createdAt: r.createdAt, planPausedAt: r.planPausedAt!, planPausedFromStatus: r.planPausedFromStatus })),
    limit, "paused", apply,
  );
}

async function syncWebhooks(tx: Tx, workspaceId: string, plan: string, apply: boolean): Promise<SyncOutcome> {
  const limit = WEBHOOK_LIMITS[plan] ?? WEBHOOK_LIMITS.free;
  const [activeRows, pausedRows] = await Promise.all([
    tx.webhookEndpoint.findMany({ where: { workspaceId, status: "active" }, select: { id: true, lastDeliveredAt: true, createdAt: true } }),
    // status must still be "paused" - an endpoint the user disabled since is
    // never a resume candidate even if planPausedAt is still (stale) set.
    tx.webhookEndpoint.findMany({ where: { workspaceId, status: "paused", planPausedAt: { not: null } }, select: { id: true, lastDeliveredAt: true, createdAt: true, planPausedAt: true, planPausedFromStatus: true } }),
  ]);
  const updateMany: UpdateMany = (where, data) => tx.webhookEndpoint.updateMany({ where: { ...where, workspaceId }, data });
  return syncActiveStatusModel(
    updateMany,
    activeRows.map((r) => ({ id: r.id, score: scoreOf(r.lastDeliveredAt), createdAt: r.createdAt })),
    pausedRows.map((r) => ({ id: r.id, score: scoreOf(r.lastDeliveredAt), createdAt: r.createdAt, planPausedAt: r.planPausedAt!, planPausedFromStatus: r.planPausedFromStatus })),
    limit, "paused", apply,
  );
}

async function syncMarketplaceInstalls(tx: Tx, workspaceId: string, plan: string, apply: boolean): Promise<SyncOutcome> {
  const limit = MARKETPLACE_INSTALL_LIMITS[plan] ?? MARKETPLACE_INSTALL_LIMITS.free;
  const [activeRows, pausedRows] = await Promise.all([
    tx.marketplaceInstall.findMany({ where: { workspaceId, status: "active" }, select: { id: true, installedAt: true } }),
    // status must still be "suspended" (what the pause wrote it to) - an
    // install the user uninstalled since is never a resume candidate even
    // if planPausedAt is still (stale) set.
    tx.marketplaceInstall.findMany({ where: { workspaceId, status: "suspended", planPausedAt: { not: null } }, select: { id: true, installedAt: true, planPausedAt: true, planPausedFromStatus: true } }),
  ]);
  const updateMany: UpdateMany = (where, data) => tx.marketplaceInstall.updateMany({ where: { ...where, workspaceId }, data });
  return syncActiveStatusModel(
    updateMany,
    activeRows.map((r) => ({ id: r.id, score: Number.NEGATIVE_INFINITY, createdAt: r.installedAt })),
    pausedRows.map((r) => ({ id: r.id, score: Number.NEGATIVE_INFINITY, createdAt: r.installedAt, planPausedAt: r.planPausedAt!, planPausedFromStatus: r.planPausedFromStatus })),
    limit, "suspended", apply,
  );
}

export async function syncPlanLimits(userId: string, previousPlan?: string | null): Promise<SyncPlanLimitsResult> {
  if (process.env.PLAN_LIMIT_PAUSING_ENABLED !== "true") return emptyResult();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"planlimits:" + userId}))`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, plan: true, planExpiresAt: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true, createdAt: true } });
      if (!user) return emptyResult();
      const result = emptyResult();

      // Per-user link tools: all three now use the SAME plan resolution -
      // lib/router-entitlements.ts linkPlan (expiry-aware paid plan, else the
      // trial plan during an active product trial, else free). Limits
      // themselves come from lib/plan-limits.ts (the 2026 numbers); whether
      // pausing is even allowed is gated separately below, with the previous
      // plan boosted for an active/just-ended new-style trial (previousLinkPlanFor)
      // so a trial ending, or a purchase made during one, is recognised as the
      // real downgrade it is - see previousLinkPlanFor's own comment.
      const currentLinkPlan = linkPlan(user);
      // Owner rule (Free-trial restructure): "free" (no paid plan, no active
      // Free trial) has a 0 limit for every link type and nothing is
      // grandfathered, so pausing is always allowed there regardless of how
      // the user arrived (trial lapse, old trial, never trialled, unknown
      // previous plan). For any paid/trial plan the verified-downgrade gate
      // still applies as before.
      const allowLinkPause = currentLinkPlan === "free" || isLinkDowngrade(previousLinkPlanFor(previousPlan, user), currentLinkPlan, userId);
      result.rotators = await syncLinkTool(tx, "rotatorLink", userId, linkLimitValue(ROTATOR_LIMITS, currentLinkPlan), "totalClicks", true, allowLinkPause);
      result.shortLinks = await syncLinkTool(tx, "shortLink", userId, linkLimitValue(SHORT_LINK_LIMITS, currentLinkPlan), "clicks", true, allowLinkPause);
      result.adLinks = await syncLinkTool(tx, "adLink", userId, linkLimitValue(AD_LINK_LIMITS, currentLinkPlan), "clicks", true, allowLinkPause);

      // Workspace-scoped types: limit is the OWNER's effectivePlan (trial-aware),
      // matching currentAiContext/marketplaceContext/workspaceOwnerPlan. A user
      // normally owns exactly one workspace, but this loops in case of more.
      const ownedWorkspaces = await tx.workspace.findMany({ where: { ownerId: userId }, select: { id: true } });
      const ownerPlan = effectivePlan(user);
      for (const workspace of ownedWorkspaces) {
        addCounts(result.automations, await syncAutomations(tx, workspace.id, ownerPlan, true));
        addCounts(result.aiAgents, await syncAiAgents(tx, workspace.id, ownerPlan, true));
        addCounts(result.aiKnowledge, await syncAiKnowledge(tx, workspace.id, ownerPlan, true));
        addCounts(result.channels, await syncChannels(tx, workspace.id, ownerPlan, true));
        addCounts(result.apiKeys, await syncApiKeys(tx, workspace.id, ownerPlan, true));
        addCounts(result.webhooks, await syncWebhooks(tx, workspace.id, ownerPlan, true));
        addCounts(result.marketplaceInstalls, await syncMarketplaceInstalls(tx, workspace.id, ownerPlan, true));
      }
      return result;
    }, { timeout: 20_000 });
  } catch (err) {
    console.error("[plan-limit-sync] failed", userId, err instanceof Error ? err.message : String(err));
    return emptyResult();
  }
}

// ---------------------------------------------------------------------------
// Read-only inspection for scripts/plan-limit-dry-run.ts. Deliberately does
// NOT check PLAN_LIMIT_PAUSING_ENABLED (the whole point is to see what WOULD
// happen before that flag is turned on), does not open a transaction or take
// the advisory lock (no write ever happens), and reuses the exact same
// per-type query + selectPauseResume logic as the real sync via apply=false,
// so the report can never drift from what syncPlanLimits would actually do -
// with one deliberate exception: there is no "previous plan" at rest to
// inspect, so this always previews rotators/short links/ad links as if the
// current plan were reached by a downgrade (allowPause defaults to true).
// syncPlanLimits itself only actually pauses those three when the caller can
// show the user's plan rank really did go down - see isLinkDowngrade.
// ---------------------------------------------------------------------------
export type InspectTypeResult = SyncOutcome & { limit: number };
export type InspectResult = {
  userId: string;
  plan: string;
  rotators: InspectTypeResult;
  shortLinks: InspectTypeResult;
  adLinks: InspectTypeResult;
  automations: InspectTypeResult[];
  aiAgents: InspectTypeResult[];
  aiKnowledge: InspectTypeResult[];
  channels: InspectTypeResult[];
  apiKeys: InspectTypeResult[];
  webhooks: InspectTypeResult[];
  marketplaceInstalls: InspectTypeResult[];
};

export async function inspectPlanLimitsForUser(userId: string): Promise<InspectResult | null> {
  const tx = prisma as unknown as Tx;
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, plan: true, planExpiresAt: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true, createdAt: true } });
  if (!user) return null;
  const currentLinkPlan = linkPlan(user);
  const rotatorLimit = linkLimitValue(ROTATOR_LIMITS, currentLinkPlan);
  const shortLinkLimit = linkLimitValue(SHORT_LINK_LIMITS, currentLinkPlan);
  const adLinkLimit = linkLimitValue(AD_LINK_LIMITS, currentLinkPlan);
  const ownerPlan = effectivePlan(user);

  const ownedWorkspaces = await tx.workspace.findMany({ where: { ownerId: userId }, select: { id: true } });
  const withLimit = (limit: number) => async (outcome: SyncOutcome): Promise<InspectTypeResult> => ({ ...outcome, limit });

  const [rotators, shortLinks, adLinks] = await Promise.all([
    syncLinkTool(tx, "rotatorLink", userId, rotatorLimit, "totalClicks", false).then(withLimit(rotatorLimit)),
    syncLinkTool(tx, "shortLink", userId, shortLinkLimit, "clicks", false).then(withLimit(shortLinkLimit)),
    syncLinkTool(tx, "adLink", userId, adLinkLimit, "clicks", false).then(withLimit(adLinkLimit)),
  ]);

  const automations: InspectTypeResult[] = [];
  const aiAgents: InspectTypeResult[] = [];
  const aiKnowledge: InspectTypeResult[] = [];
  const channels: InspectTypeResult[] = [];
  const apiKeys: InspectTypeResult[] = [];
  const webhooks: InspectTypeResult[] = [];
  const marketplaceInstalls: InspectTypeResult[] = [];

  for (const workspace of ownedWorkspaces) {
    automations.push({ ...(await syncAutomations(tx, workspace.id, ownerPlan, false)), limit: AUTOMATION_LIMITS[ownerPlan] ?? AUTOMATION_LIMITS.free });
    aiAgents.push({ ...(await syncAiAgents(tx, workspace.id, ownerPlan, false)), limit: AI_AGENT_LIMITS[ownerPlan] ?? AI_AGENT_LIMITS.free });
    aiKnowledge.push({ ...(await syncAiKnowledge(tx, workspace.id, ownerPlan, false)), limit: AI_KNOWLEDGE_LIMITS[ownerPlan] ?? AI_KNOWLEDGE_LIMITS.free });
    channels.push({ ...(await syncChannels(tx, workspace.id, ownerPlan, false)), limit: CHANNEL_LIMITS[ownerPlan] ?? CHANNEL_LIMITS.free });
    apiKeys.push({ ...(await syncApiKeys(tx, workspace.id, ownerPlan, false)), limit: API_KEY_LIMITS[ownerPlan] ?? API_KEY_LIMITS.free });
    webhooks.push({ ...(await syncWebhooks(tx, workspace.id, ownerPlan, false)), limit: WEBHOOK_LIMITS[ownerPlan] ?? WEBHOOK_LIMITS.free });
    marketplaceInstalls.push({ ...(await syncMarketplaceInstalls(tx, workspace.id, ownerPlan, false)), limit: MARKETPLACE_INSTALL_LIMITS[ownerPlan] ?? MARKETPLACE_INSTALL_LIMITS.free });
  }

  return { userId, plan: ownerPlan, rotators, shortLinks, adLinks, automations, aiAgents, aiKnowledge, channels, apiKeys, webhooks, marketplaceInstalls };
}
