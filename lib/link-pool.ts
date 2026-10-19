// UX-1 step 1: rotators, short links ("brand links") and ad links share ONE
// pool of `links` per user, sized by lib/plan-limits.ts LINK_LIMITS. A link
// counts toward the pool as long as it isn't plan-paused (planPausedAt:
// null) - same rule the old per-type counts used.
import { prisma } from "./prisma";
import { canCreateMore, linkLimit, adLinksAvailable, nextPlanPoolHint } from "./plan-limits";

export async function countLiveLinks(userId: string): Promise<number> {
  const [rotators, shortLinks, adLinks] = await Promise.all([
    prisma.rotatorLink.count({ where: { userId, planPausedAt: null } }),
    prisma.shortLink.count({ where: { userId, planPausedAt: null } }),
    prisma.adLink.count({ where: { userId, planPausedAt: null } }),
  ]);
  return rotators + shortLinks + adLinks;
}

export type LinkKind = "rotator" | "shortlink" | "adlink";
const LINK_KIND_LABEL: Record<LinkKind, string> = {
  rotator: "lead rotator",
  shortlink: "brand link",
  adlink: "ad link",
};

export type LinkPoolCheck = { ok: true } | { ok: false; error: string };

// Pure decision, given an already-counted `used` - unit tested directly in
// lib/__tests__/link-pool.test.ts without touching the database.
export function describeLinkPoolCreateCheck(plan: string, kind: LinkKind, used: number, planLabel: string): LinkPoolCheck {
  if (kind === "adlink" && !adLinksAvailable(plan)) {
    return { ok: false, error: "Ad links are available on Growth and Agency." };
  }
  const limit = linkLimit(plan);
  if (limit === 0) {
    return { ok: false, error: `Your ${planLabel} plan doesn't include links. Choose a plan to create a ${LINK_KIND_LABEL[kind]}.` };
  }
  if (!canCreateMore(used, limit)) {
    const next = nextPlanPoolHint(plan);
    const upgrade = next ? ` Upgrade to ${next}.` : "";
    return { ok: false, error: `You've used ${used} of ${limit} links on your plan.${upgrade}` };
  }
  return { ok: true };
}

// Shared create-check for app/api/rotator, app/api/shortlinks and
// app/api/adlinks POST handlers. `plan` is already resolved (linkPlan).
export async function checkLinkPoolForCreate(userId: string, plan: string, kind: LinkKind, planLabel: string): Promise<LinkPoolCheck> {
  const used = await countLiveLinks(userId);
  return describeLinkPoolCreateCheck(plan, kind, used, planLabel);
}
