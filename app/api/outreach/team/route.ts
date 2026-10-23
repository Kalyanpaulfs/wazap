import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { teamOutreachAvailable, teamOutreachContactLimit, teamOutreachMemberLimit } from "@/lib/plan-limits";
import { accountPlanLabel } from "@/lib/entitlements";
import { getTeamForOwner, createTeamForOwner, updateTeamSettings, regenerateTeamCode, OWNER_PLAN_SELECT } from "@/lib/outreach/team";
import { activeMemberCount } from "@/lib/outreach/members";
import { teamContactTotal } from "@/lib/outreach/lists";

function originOk(req: Request) {
  return req.headers.get("origin") === new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin;
}

// GET: the owner's team (null if not created yet) + plan limits, so the UI
// can show "create your team" vs the real settings.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const owner = await prisma.user.findUnique({ where: { id: userId }, select: OWNER_PLAN_SELECT });
  const plan = linkPlan(owner);
  const [team, limits] = await Promise.all([
    getTeamForOwner(userId),
    Promise.resolve({ available: teamOutreachAvailable(plan), contactLimit: teamOutreachContactLimit(plan), memberLimit: teamOutreachMemberLimit(plan), planLabel: accountPlanLabel(owner) }),
  ]);
  if (!team) return NextResponse.json({ team: null, limits });
  const [memberCount, contactTotal] = await Promise.all([activeMemberCount(team.id), teamContactTotal(team.id)]);
  return NextResponse.json({ team, limits, memberCount, contactTotal, paused: !limits.available });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as { id: string }).id;
  const result = await createTeamForOwner(userId);
  if (!result.ok) return NextResponse.json({ error: result.error, upgrade: result.upgrade }, { status: 403 });
  return NextResponse.json({ team: result.team });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!originOk(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as { id: string }).id;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const existing = await getTeamForOwner(userId);
  if (!existing) return NextResponse.json({ error: "Create a team first." }, { status: 404 });

  if (body.regenerateCode === true) {
    const team = await regenerateTeamCode(userId);
    return NextResponse.json({ team });
  }

  const patch: { speedLimitSeconds?: number; dailyCap?: number | null; defaultCountry?: string | null } = {};
  if (body.speedLimitSeconds !== undefined) {
    if (typeof body.speedLimitSeconds !== "number" || !Number.isFinite(body.speedLimitSeconds) || body.speedLimitSeconds < 0) {
      return NextResponse.json({ error: "Invalid speed limit." }, { status: 400 });
    }
    patch.speedLimitSeconds = body.speedLimitSeconds;
  }
  if (body.dailyCap !== undefined) {
    if (body.dailyCap !== null && (typeof body.dailyCap !== "number" || !Number.isFinite(body.dailyCap) || body.dailyCap < 1)) {
      return NextResponse.json({ error: "Invalid daily cap." }, { status: 400 });
    }
    patch.dailyCap = body.dailyCap;
  }
  if (body.defaultCountry !== undefined) {
    if (body.defaultCountry !== null && (typeof body.defaultCountry !== "string" || !/^[A-Za-z]{2}$/.test(body.defaultCountry))) {
      return NextResponse.json({ error: "Invalid country." }, { status: 400 });
    }
    patch.defaultCountry = body.defaultCountry;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
  const team = await updateTeamSettings(userId, patch);
  return NextResponse.json({ team });
}
