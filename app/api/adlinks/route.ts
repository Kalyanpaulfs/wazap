import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordFunnelEvent } from "@/lib/funnel";
import { adLinkLimit, PLAN_DISPLAY_NAME, normalizePlanKey } from "@/lib/plan-limits";
import { linkPlan } from "@/lib/router-entitlements";

function getLimit(plan: string) {
  return adLinkLimit(plan);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ links: [], limit: 0, plan: "free", planLabel: PLAN_DISPLAY_NAME.free });
  const userId = (session.user as any).id;
  const entitlementUser = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true } });
  const plan = linkPlan(entitlementUser);
  const links = await prisma.adLink.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clickEvents: true } } },
  });
  return NextResponse.json({
    links: links.map(l => ({ ...l, clicks: l._count.clickEvents })),
    limit: getLimit(plan),
    plan,
    planLabel: PLAN_DISPLAY_NAME[normalizePlanKey(plan)],
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const entitlementUser = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true } });
  const plan = linkPlan(entitlementUser);
  const limit = getLimit(plan);

  if (limit === 0) {
    return NextResponse.json({ error: "Ad links are not included in your plan. Upgrade to create tracked ad links.", upgrade: true }, { status: 403 });
  }
  const count = await prisma.adLink.count({ where: { userId, planPausedAt: null } });
  if (count >= limit) {
    return NextResponse.json({ error: `Plan limit reached. Your ${PLAN_DISPLAY_NAME[normalizePlanKey(plan)]} plan allows ${limit} ad link${limit !== 1 ? "s" : ""}. Upgrade for more.`, upgrade: true }, { status: 403 });
  }

  const { name, number, message, utmSource, utmMedium, utmCampaign } = await req.json();
  if (!name || !number) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const link = await prisma.adLink.create({
    data: { userId, name, number, message, utmSource, utmMedium, utmCampaign },
  });
  await recordFunnelEvent("first_tool_success", { userId, source: "ad_builder" });
  return NextResponse.json(link);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await req.json();
  await prisma.adLink.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
