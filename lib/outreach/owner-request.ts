// FEAT-QUEUE: shared owner-API boilerplate (session -> userId -> team +
// plan limits), used by every app/api/outreach/{members,lists,report} route
// so each one doesn't repeat the same five lookups.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { teamOutreachContactLimit, teamOutreachMemberLimit } from "@/lib/plan-limits";
import { getTeamForOwner, OWNER_PLAN_SELECT } from "./team";

export function originOk(req: Request): boolean {
  return req.headers.get("origin") === new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

export type OwnerContext = { userId: string; team: NonNullable<Awaited<ReturnType<typeof getTeamForOwner>>>; contactLimit: number; memberLimit: number };
export type OwnerContextResult = { ok: true; ctx: OwnerContext } | { ok: false; status: number; error: string };

/** Resolves the signed-in owner's team for an app/api/outreach/* route. Returns a ready-to-use NextResponse status+error when unauthorized or the team doesn't exist yet. */
export async function requireOwnerTeam(): Promise<OwnerContextResult> {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };
  const [team, owner] = await Promise.all([
    getTeamForOwner(userId),
    prisma.user.findUnique({ where: { id: userId }, select: OWNER_PLAN_SELECT }),
  ]);
  if (!team) return { ok: false, status: 404, error: "Create a team first." };
  const plan = linkPlan(owner);
  return { ok: true, ctx: { userId, team, contactLimit: teamOutreachContactLimit(plan), memberLimit: teamOutreachMemberLimit(plan) } };
}
