import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOOL_LIMITS } from "@/lib/tool-access";
import { recordFunnelEvent } from "@/lib/funnel";
import { cacheRoute, removeCachedRoute } from "@/lib/routing-cache";
import { routerPlan, routerQuota } from "@/lib/router-entitlements";

function getLimit(plan: string) {
  const limits = TOOL_LIMITS.rotator;
  if (plan === "business") plan = "ultimate";
  return (limits[plan as keyof typeof limits] ?? limits.free).uses;
}

function genCode() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }
async function uniqueCode(): Promise<string> {
  let code = genCode();
  while (await prisma.rotatorLink.findUnique({ where: { code } })) code = genCode();
  return code;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const [rotators, user, lifetimeStarts] = await Promise.all([
    prisma.rotatorLink.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true } }),
    prisma.conversationStart.count({ where: { userId, assetType: "rotator" } }),
  ]);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const starts = rotators.length
    ? await prisma.conversationStart.findMany({
        where: { userId, assetType: "rotator", assetId: { in: rotators.map((rotator) => rotator.id) }, createdAt: { gte: since } },
        select: { assetId: true, destination: true },
      })
    : [];
  const analytics = new Map<string, { last30Days: number; destinations: Record<string, number> }>();
  for (const start of starts) {
    if (!start.assetId) continue;
    const entry = analytics.get(start.assetId) ?? { last30Days: 0, destinations: {} };
    entry.last30Days += 1;
    if (start.destination) entry.destinations[start.destination] = (entry.destinations[start.destination] ?? 0) + 1;
    analytics.set(start.assetId, entry);
  }
  return NextResponse.json({
    rotators: rotators.map((rotator) => ({
      ...rotator,
      last30Days: analytics.get(rotator.id)?.last30Days ?? 0,
      destinationClicks: analytics.get(rotator.id)?.destinations ?? {},
    })),
    quota: routerQuota(user, lifetimeStarts),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = routerPlan(entitlementUser);
  const limit = getLimit(plan);

  if (limit === 0) {
    return NextResponse.json({ error: "Rotators require a paid plan. Upgrade to create your first rotator.", upgrade: true }, { status: 403 });
  }
  if (limit !== -1) {
    const count = await prisma.rotatorLink.count({ where: { userId } });
    if (count >= limit) {
      return NextResponse.json({ error: `Plan limit reached. Your ${plan} plan allows ${limit} rotator${limit !== 1 ? "s" : ""}. Upgrade for more.`, upgrade: true }, { status: 403 });
    }
  }

  const { name, numbers, fallbackNumber } = await req.json();
  if (!name || !numbers?.length) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const cleanNumbers = (numbers as unknown[]).map(number => String(number).replace(/\D/g, "")).filter(number => number.length >= 8).slice(0, 100);
  const cleanFallback = String(fallbackNumber ?? "").replace(/\D/g, "");
  if (!cleanNumbers.length) return NextResponse.json({ error: "Add at least one valid WhatsApp number." }, { status: 400 });
  const code = await uniqueCode();
  const rotator = await prisma.rotatorLink.create({ data: { userId, name: String(name).slice(0, 100), numbers: cleanNumbers, fallbackNumber: cleanFallback.length >= 8 ? cleanFallback : cleanNumbers[0], code } });
  await cacheRoute({ code: rotator.code, numbers: rotator.numbers, fallbackNumber: rotator.fallbackNumber, currentIdx: rotator.currentIdx });
  await recordFunnelEvent("first_tool_success", { userId, source: "rotator" });
  return NextResponse.json(rotator);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await req.json();
  const existing = await prisma.rotatorLink.findFirst({ where: { id, userId }, select: { code: true } });
  await prisma.rotatorLink.deleteMany({ where: { id, userId } });
  if (existing) await removeCachedRoute(existing.code);
  return NextResponse.json({ success: true });
}
