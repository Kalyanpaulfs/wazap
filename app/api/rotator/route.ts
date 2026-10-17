import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordFunnelEvent } from "@/lib/funnel";
import { cacheRoute, removeCachedRoute } from "@/lib/routing-cache";
import { routerQuota, linkPlan } from "@/lib/router-entitlements";
import { rotatorLimit, numbersPerRotatorLimit, numbersPatchAllowed } from "@/lib/plan-limits";
import { accountPlanLabel } from "@/lib/entitlements";
import { normalizeNumberNames } from "@/lib/salesperson-names";

function getLimit(plan: string) {
  return rotatorLimit(plan);
}

function genCode() { return randomBytes(5).toString("hex").toUpperCase(); }
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
  // Lead quota (routerQuota/routerPlan) stays paid-only, no trial boost -
  // how many rotators/numbers-per-rotator a user may HAVE is a separate,
  // trial-boosted question (lib/router-entitlements.ts linkPlan).
  const plan = linkPlan(user);
  return NextResponse.json({
    rotators: rotators.map((rotator) => ({
      ...rotator,
      last30Days: analytics.get(rotator.id)?.last30Days ?? 0,
      destinationClicks: analytics.get(rotator.id)?.destinations ?? {},
    })),
    quota: routerQuota(user, lifetimeStarts),
    limits: { plan, planLabel: accountPlanLabel(user), rotators: getLimit(plan), numbersPerRotator: numbersPerRotatorLimit(plan) },
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (req.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as any).id;
  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = linkPlan(entitlementUser);
  const limit = getLimit(plan);

  if (limit === 0) {
    return NextResponse.json({ error: "Your free trial has ended. Choose a plan to create rotators.", upgrade: true }, { status: 403 });
  }
  const count = await prisma.rotatorLink.count({ where: { userId, planPausedAt: null } });
  if (count >= limit) {
    return NextResponse.json({ error: `Plan limit reached. Your ${accountPlanLabel(entitlementUser)} plan allows ${limit} rotator${limit !== 1 ? "s" : ""}. Upgrade for more.`, upgrade: true }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || typeof body.name !== "string" || !body.name.trim() || !Array.isArray(body.numbers) || !body.numbers.length || body.numbers.some((number: unknown) => typeof number !== "string")) {
    return NextResponse.json({ error: "Add a router name and a list of WhatsApp numbers." }, { status: 400 });
  }
  const { name, numbers, fallbackNumber, message, numberNames } = body;
  const cleanNumbers = (numbers as unknown[]).map(number => String(number).replace(/\D/g, "")).filter(number => number.length >= 8).slice(0, 100);
  const cleanFallback = String(fallbackNumber ?? "").replace(/\D/g, "");
  if (!cleanNumbers.length) return NextResponse.json({ error: "Add at least one valid WhatsApp number." }, { status: 400 });
  const numberLimit = numbersPerRotatorLimit(plan);
  if (cleanNumbers.length > numberLimit) {
    return NextResponse.json({ error: `Your ${accountPlanLabel(entitlementUser)} plan allows ${numberLimit} numbers per rotator. Upgrade to add more.`, upgrade: true }, { status: 403 });
  }
  const cleanNumberNames = normalizeNumberNames(numberNames, cleanNumbers);
  const code = await uniqueCode();
  const rotator = await prisma.rotatorLink.create({ data: { userId, name: String(name).slice(0, 100), numbers: cleanNumbers, numberNames: cleanNumberNames, fallbackNumber: cleanFallback.length >= 8 ? cleanFallback : cleanNumbers[0], message: typeof message === "string" ? message.slice(0, 2000) : null, code } });
  await cacheRoute({ code: rotator.code, numbers: rotator.numbers, fallbackNumber: rotator.fallbackNumber, currentIdx: rotator.currentIdx, message: rotator.message });
  await recordFunnelEvent("first_tool_success", { userId, source: "rotator" });
  return NextResponse.json(rotator);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (req.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as any).id;
  const { id } = await req.json();
  const existing = await prisma.rotatorLink.findFirst({ where: { id, userId }, select: { code: true } });
  await prisma.rotatorLink.deleteMany({ where: { id, userId } });
  if (existing) await removeCachedRoute(existing.code);
  return NextResponse.json({ success: true });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (req.headers.get("origin") !== new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as any).id;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Choose a rotator." }, { status: 400 });
  const existing = await prisma.rotatorLink.findFirst({ where: { id: body.id, userId } });
  if (!existing) return NextResponse.json({ error: "Rotator not found." }, { status: 404 });
  const data: { name?: string; numbers?: string[]; numberNames?: Record<string, string>; fallbackNumber?: string; message?: string } = {};
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 100) return NextResponse.json({ error: "Enter a name of up to 100 characters." }, { status: 400 });
    data.name = body.name.trim();
  }
  if (body.numbers !== undefined) {
    if (!Array.isArray(body.numbers) || !body.numbers.length || body.numbers.length > 100 || body.numbers.some((n: unknown) => typeof n !== "string" || !/^\+?[1-9][0-9]{7,14}$/.test(n))) return NextResponse.json({ error: "Use international numbers with 8–15 digits, one per line." }, { status: 400 });
    data.numbers = [...new Set<string>(body.numbers.map((n: string) => n.replace(/^\+/, "")))];
    // Grandfathering: a PATCH that keeps or reduces the number count is
    // always allowed, even for a legacy rotator already over the new
    // per-plan limit. Only an increase that crosses the limit is blocked.
    const entitlementUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
    });
    const plan = linkPlan(entitlementUser);
    const numberLimit = numbersPerRotatorLimit(plan);
    if (!numbersPatchAllowed(existing.numbers.length, data.numbers.length, numberLimit)) {
      return NextResponse.json({ error: `Your ${accountPlanLabel(entitlementUser)} plan allows ${numberLimit} numbers per rotator. Upgrade to add more.`, upgrade: true }, { status: 403 });
    }
  }
  if (body.fallbackNumber !== undefined) {
    if (typeof body.fallbackNumber !== "string" || (body.fallbackNumber && !/^\+?[1-9][0-9]{7,14}$/.test(body.fallbackNumber))) return NextResponse.json({ error: "Enter a valid international fallback number." }, { status: 400 });
    data.fallbackNumber = body.fallbackNumber.replace(/^\+/, "") || (data.numbers || existing.numbers)[0];
  } else if (data.numbers && !data.numbers.includes(existing.fallbackNumber || "")) data.fallbackNumber = data.numbers[0];
  if (body.numberNames !== undefined) {
    if (body.numberNames === null || typeof body.numberNames !== "object" || Array.isArray(body.numberNames)) {
      return NextResponse.json({ error: "Salesperson names must be an object mapping number to name." }, { status: 400 });
    }
    data.numberNames = normalizeNumberNames(body.numberNames, data.numbers || existing.numbers);
  } else if (data.numbers) {
    // Numbers changed but no explicit numberNames supplied: prune any names
    // that belonged to numbers no longer on this rotator.
    data.numberNames = normalizeNumberNames(existing.numberNames, data.numbers);
  }
  if (body.message !== undefined) {
    if (typeof body.message !== "string" || body.message.length > 2000) return NextResponse.json({ error: "Messages may contain up to 2,000 characters." }, { status: 400 });
    data.message = body.message;
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
  const result = await prisma.rotatorLink.updateMany({ where: { id: body.id, userId }, data });
  if (!result.count) return NextResponse.json({ error: "Rotator not found." }, { status: 404 });
  const updated = await prisma.rotatorLink.findFirst({ where: { id: body.id, userId } });
  if (!updated) return NextResponse.json({ error: "Rotator not found." }, { status: 404 });
  await removeCachedRoute(updated.code);
  await cacheRoute({ code: updated.code, numbers: updated.numbers, fallbackNumber: updated.fallbackNumber, message: updated.message, currentIdx: updated.currentIdx });
  return NextResponse.json(updated);
}
