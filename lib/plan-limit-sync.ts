// Billing spec 12f/12g, step 2: pauses/resumes extras automatically when a
// user's plan changes (downgrade, refund, expiry, admin change) so usage
// never exceeds the current plan's limit, without deleting anything. Called
// AFTER (outside) every transaction that changes a user's plan - never from
// inside one, since it opens its own transaction and advisory lock.
//
// Safety: completely gated behind PLAN_LIMIT_PAUSING_ENABLED. When the flag
// is not exactly "true" this is a no-op that returns all-zero counts, so it
// is safe to deploy ahead of turning the flag on (see scripts/plan-limit-dry-run.ts).
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { effectivePlan } from "./entitlements";
import { routerPlan } from "./router-entitlements";
import { TOOL_LIMITS } from "./tool-access";
import { workspaceMemberLimit } from "./workspaces";
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
  linktreePages: SyncCounts;
  catalogPages: SyncCounts;
  workspaceMembers: SyncCounts;
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
    rotators: { ...ZERO }, shortLinks: { ...ZERO }, adLinks: { ...ZERO }, linktreePages: { ...ZERO }, catalogPages: { ...ZERO },
    workspaceMembers: { ...ZERO }, automations: { ...ZERO }, aiAgents: { ...ZERO }, aiKnowledge: { ...ZERO },
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

function normalizePlanKey(plan: string) {
  return plan === "business" ? "ultimate" : plan;
}

function toolLimitValue(limits: Record<string, { uses: number }>, plan: string): number {
  const key = normalizePlanKey(plan) as keyof typeof limits;
  const uses = (limits[key] ?? limits.free).uses;
  return uses === -1 ? Number.POSITIVE_INFINITY : uses;
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
async function syncNoStatusModel(updateMany: UpdateMany, rows: RankCandidate[], limit: number, apply: boolean): Promise<SyncOutcome> {
  const { pauseIds, resumeIds } = selectPauseResume(rows, limit);
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

// --- Per-user link/page tools: rotator, short link, ad link, linktree, catalog ---
type LinkToolDelegate = {
  findMany: (args: { where: { userId: string }; select: Record<string, boolean> }) => Promise<Array<Record<string, unknown> & { id: string; createdAt: Date; planPausedAt: Date | null }>>;
  updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
};

async function syncLinkTool(tx: Tx, model: "rotatorLink" | "shortLink" | "adLink" | "linktreePage" | "catalogPage", userId: string, limit: number, scoreField: "totalClicks" | "clicks" | "views" | null, apply: boolean): Promise<SyncOutcome> {
  const delegate = tx[model] as unknown as LinkToolDelegate;
  const rows = await delegate.findMany({ where: { userId }, select: { id: true, createdAt: true, planPausedAt: true, ...(scoreField ? { [scoreField]: true } : {}) } });
  const candidates: RankCandidate[] = rows.map((r) => ({ id: r.id, score: scoreField ? Number(r[scoreField] ?? 0) : 0, createdAt: r.createdAt, planPausedAt: r.planPausedAt }));
  const updateMany: UpdateMany = (where, data) => delegate.updateMany({ where: { ...where, userId }, data });
  return syncNoStatusModel(updateMany, candidates, limit, apply);
}

// --- Workspace members: owner never touched, newest extra paused first ---
async function syncWorkspaceMembers(tx: Tx, workspaceId: string, ownerPlan: string, apply: boolean): Promise<SyncOutcome> {
  const limit = workspaceMemberLimit(ownerPlan);
  const members = await tx.workspaceMember.findMany({ where: { workspaceId }, select: { id: true, role: true, createdAt: true, planPausedAt: true } });
  const nonOwner: RankCandidate[] = members.filter((m) => m.role !== "owner").map((m) => ({ id: m.id, score: 0, createdAt: m.createdAt, planPausedAt: m.planPausedAt }));
  // One seat is always reserved for the owner - it is never a candidate and
  // never counted against the pool we rank into.
  const effectiveLimit = Math.max(0, limit - 1);
  const updateMany: UpdateMany = (where, data) => tx.workspaceMember.updateMany({ where: { ...where, workspaceId }, data });
  return syncNoStatusModel(updateMany, nonOwner, effectiveLimit, apply);
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

export async function syncPlanLimits(userId: string): Promise<SyncPlanLimitsResult> {
  if (process.env.PLAN_LIMIT_PAUSING_ENABLED !== "true") return emptyResult();
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"planlimits:" + userId}))`;
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true } });
      if (!user) return emptyResult();
      const result = emptyResult();

      // Per-user link/page tools: each uses the SAME plan resolution its own
      // create route uses (not uniformly effectivePlan - see lib/tool-access.ts
      // create routes, which deliberately differ: rotator is expiry-aware via
      // routerPlan, the other four read the raw stored plan with no trial boost).
      const rawPlan = (user.plan ?? "free").toLowerCase();
      result.rotators = await syncLinkTool(tx, "rotatorLink", userId, toolLimitValue(TOOL_LIMITS.rotator, routerPlan(user)), "totalClicks", true);
      result.shortLinks = await syncLinkTool(tx, "shortLink", userId, toolLimitValue(TOOL_LIMITS.shortlink, rawPlan), "clicks", true);
      result.adLinks = await syncLinkTool(tx, "adLink", userId, toolLimitValue(TOOL_LIMITS.adBuilder, rawPlan), "clicks", true);
      result.linktreePages = await syncLinkTool(tx, "linktreePage", userId, toolLimitValue(TOOL_LIMITS.linktree, rawPlan), "views", true);
      result.catalogPages = await syncLinkTool(tx, "catalogPage", userId, toolLimitValue(TOOL_LIMITS.catalog, rawPlan), "views", true);

      // Workspace-scoped types: limit is the OWNER's effectivePlan (trial-aware),
      // matching currentAiContext/marketplaceContext/workspaceOwnerPlan. A user
      // normally owns exactly one workspace, but this loops in case of more.
      const ownedWorkspaces = await tx.workspace.findMany({ where: { ownerId: userId }, select: { id: true } });
      const ownerPlan = effectivePlan(user);
      for (const workspace of ownedWorkspaces) {
        addCounts(result.workspaceMembers, await syncWorkspaceMembers(tx, workspace.id, ownerPlan, true));
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
// so the report can never drift from what syncPlanLimits would actually do.
// ---------------------------------------------------------------------------
export type InspectTypeResult = SyncOutcome & { limit: number };
export type InspectResult = {
  userId: string;
  plan: string;
  rotators: InspectTypeResult;
  shortLinks: InspectTypeResult;
  adLinks: InspectTypeResult;
  linktreePages: InspectTypeResult;
  catalogPages: InspectTypeResult;
  workspaceMembers: InspectTypeResult[];
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
  const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true } });
  if (!user) return null;
  const rawPlan = (user.plan ?? "free").toLowerCase();
  const rotatorLimit = toolLimitValue(TOOL_LIMITS.rotator, routerPlan(user));
  const shortLinkLimit = toolLimitValue(TOOL_LIMITS.shortlink, rawPlan);
  const adLinkLimit = toolLimitValue(TOOL_LIMITS.adBuilder, rawPlan);
  const linktreeLimit = toolLimitValue(TOOL_LIMITS.linktree, rawPlan);
  const catalogLimit = toolLimitValue(TOOL_LIMITS.catalog, rawPlan);
  const ownerPlan = effectivePlan(user);

  const ownedWorkspaces = await tx.workspace.findMany({ where: { ownerId: userId }, select: { id: true } });
  const withLimit = (limit: number) => async (outcome: SyncOutcome): Promise<InspectTypeResult> => ({ ...outcome, limit });

  const [rotators, shortLinks, adLinks, linktreePages, catalogPages] = await Promise.all([
    syncLinkTool(tx, "rotatorLink", userId, rotatorLimit, "totalClicks", false).then(withLimit(rotatorLimit)),
    syncLinkTool(tx, "shortLink", userId, shortLinkLimit, "clicks", false).then(withLimit(shortLinkLimit)),
    syncLinkTool(tx, "adLink", userId, adLinkLimit, "clicks", false).then(withLimit(adLinkLimit)),
    syncLinkTool(tx, "linktreePage", userId, linktreeLimit, "views", false).then(withLimit(linktreeLimit)),
    syncLinkTool(tx, "catalogPage", userId, catalogLimit, "views", false).then(withLimit(catalogLimit)),
  ]);

  const workspaceMembers: InspectTypeResult[] = [];
  const automations: InspectTypeResult[] = [];
  const aiAgents: InspectTypeResult[] = [];
  const aiKnowledge: InspectTypeResult[] = [];
  const channels: InspectTypeResult[] = [];
  const apiKeys: InspectTypeResult[] = [];
  const webhooks: InspectTypeResult[] = [];
  const marketplaceInstalls: InspectTypeResult[] = [];

  for (const workspace of ownedWorkspaces) {
    workspaceMembers.push({ ...(await syncWorkspaceMembers(tx, workspace.id, ownerPlan, false)), limit: workspaceMemberLimit(ownerPlan) });
    automations.push({ ...(await syncAutomations(tx, workspace.id, ownerPlan, false)), limit: AUTOMATION_LIMITS[ownerPlan] ?? AUTOMATION_LIMITS.free });
    aiAgents.push({ ...(await syncAiAgents(tx, workspace.id, ownerPlan, false)), limit: AI_AGENT_LIMITS[ownerPlan] ?? AI_AGENT_LIMITS.free });
    aiKnowledge.push({ ...(await syncAiKnowledge(tx, workspace.id, ownerPlan, false)), limit: AI_KNOWLEDGE_LIMITS[ownerPlan] ?? AI_KNOWLEDGE_LIMITS.free });
    channels.push({ ...(await syncChannels(tx, workspace.id, ownerPlan, false)), limit: CHANNEL_LIMITS[ownerPlan] ?? CHANNEL_LIMITS.free });
    apiKeys.push({ ...(await syncApiKeys(tx, workspace.id, ownerPlan, false)), limit: API_KEY_LIMITS[ownerPlan] ?? API_KEY_LIMITS.free });
    webhooks.push({ ...(await syncWebhooks(tx, workspace.id, ownerPlan, false)), limit: WEBHOOK_LIMITS[ownerPlan] ?? WEBHOOK_LIMITS.free });
    marketplaceInstalls.push({ ...(await syncMarketplaceInstalls(tx, workspace.id, ownerPlan, false)), limit: MARKETPLACE_INSTALL_LIMITS[ownerPlan] ?? MARKETPLACE_INSTALL_LIMITS.free });
  }

  return { userId, plan: ownerPlan, rotators, shortLinks, adLinks, linktreePages, catalogPages, workspaceMembers, automations, aiAgents, aiKnowledge, channels, apiKeys, webhooks, marketplaceInstalls };
}
