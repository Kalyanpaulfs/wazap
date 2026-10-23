// FEAT-QUEUE: owner-side team CRUD (get/create/settings/regenerate code).
// One OutreachTeam per owner (userId unique) - mirrors the simple, workspace-
// free shape of ContactList (prisma/schema.prisma), not the shared-workspace
// models.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { teamOutreachAvailable } from "@/lib/plan-limits";

function genCode(): string {
  return randomBytes(5).toString("hex").toUpperCase();
}

async function uniqueCode(): Promise<string> {
  let code = genCode();
  while (await prisma.outreachTeam.findUnique({ where: { code }, select: { id: true } })) code = genCode();
  return code;
}

export const OWNER_PLAN_SELECT = { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true } as const;

export async function getTeamForOwner(userId: string) {
  return prisma.outreachTeam.findUnique({ where: { userId } });
}

/** Creates the owner's one team, gated on plan. Idempotent: returns the existing team if one already exists. */
export async function createTeamForOwner(userId: string) {
  const existing = await getTeamForOwner(userId);
  if (existing) return { ok: true as const, team: existing };
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: OWNER_PLAN_SELECT });
  const plan = linkPlan(owner);
  if (!teamOutreachAvailable(plan)) return { ok: false as const, error: "Team outreach is a Growth/Agency feature.", upgrade: true };
  const code = await uniqueCode();
  const team = await prisma.outreachTeam.create({ data: { userId, code } });
  return { ok: true as const, team };
}

export async function regenerateTeamCode(userId: string) {
  const code = await uniqueCode();
  return prisma.outreachTeam.update({ where: { userId }, data: { code } });
}

export type TeamSettingsPatch = { speedLimitSeconds?: number; dailyCap?: number | null; defaultCountry?: string | null };

export async function updateTeamSettings(userId: string, patch: TeamSettingsPatch) {
  const data: TeamSettingsPatch = {};
  if (patch.speedLimitSeconds !== undefined) data.speedLimitSeconds = Math.max(0, Math.min(3600, Math.floor(patch.speedLimitSeconds)));
  if (patch.dailyCap !== undefined) data.dailyCap = patch.dailyCap === null ? null : Math.max(1, Math.floor(patch.dailyCap));
  if (patch.defaultCountry !== undefined) data.defaultCountry = patch.defaultCountry ? String(patch.defaultCountry).toUpperCase().slice(0, 2) : null;
  return prisma.outreachTeam.update({ where: { userId }, data });
}

/** Team + owner plan fields, for the public /team/<code> route and member login - looked up by the public code, not the owner's userId. */
export async function getTeamByCode(code: string) {
  const team = await prisma.outreachTeam.findUnique({ where: { code: code.toUpperCase() } });
  if (!team) return null;
  const owner = await prisma.user.findUnique({ where: { id: team.userId }, select: OWNER_PLAN_SELECT });
  return { team, owner };
}

type OwnerPlanFields = { plan?: string | null; planExpiresAt?: Date | string | null; trialPlan?: string | null; trialEndsAt?: Date | string | null };

/** True when the owner's plan no longer covers team outreach - the team link shows a paused state and claims are blocked, same idea as a plan-paused rotator link. */
export function teamIsPaused(owner: OwnerPlanFields | null | undefined): boolean {
  return !teamOutreachAvailable(linkPlan(owner));
}
