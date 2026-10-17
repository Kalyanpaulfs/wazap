import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { widgetAvailable } from "@/lib/plan-limits";

export const dynamic = "force-dynamic";

// The website widget is included in Solo, Growth and Agency (and the product
// trial); it is not part of Free. Paid access is unlimited - usage is only
// counted for analytics.
type MeterableTool = "widget";

const FIELD_MAP: Record<MeterableTool, "widgetCopies"> = {
  widget: "widgetCopies",
};

const UPGRADE_MESSAGE = "The website widget is included in your free trial and in Solo, Growth and Agency. Choose a plan to use it.";

function today() { return new Date().toISOString().slice(0, 10); }

function cleanCount(value: unknown) {
  const count = Number(value ?? 1);
  if (!Number.isFinite(count)) return 1;
  return Math.min(100, Math.max(1, Math.floor(count)));
}

async function planFor(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialStartedAt: true, trialEndsAt: true },
  });
  // Expiry-aware, same resolution as the link/count limits (lib/router-entitlements.ts),
  // so the widget flips off at the same moment rotators/short links do.
  return linkPlan(user);
}

// GET /api/tools/use?tool=widget - is the widget available on this plan?
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tool = req.nextUrl.searchParams.get("tool") as MeterableTool | null;
  if (!tool || !FIELD_MAP[tool]) return NextResponse.json({ error: "Invalid tool" }, { status: 400 });

  if (!session?.user) return NextResponse.json({ available: false, plan: "free", anonymous: true });

  const userId = (session.user as { id: string }).id;
  const plan = await planFor(userId);
  return NextResponse.json({ available: widgetAvailable(plan), plan });
}

// POST /api/tools/use - { tool, count? } - records usage; 403 when not in the plan
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const { tool, count = 1 } = await req.json() as { tool: MeterableTool; count?: number };
  if (!tool || !FIELD_MAP[tool]) return NextResponse.json({ error: "Invalid tool" }, { status: 400 });

  if (!session?.user) return NextResponse.json({ error: UPGRADE_MESSAGE, available: false }, { status: 403 });

  const userId = (session.user as { id: string }).id;
  const plan = await planFor(userId);
  if (!widgetAvailable(plan)) return NextResponse.json({ error: UPGRADE_MESSAGE, available: false, plan }, { status: 403 });

  const field = FIELD_MAP[tool];
  await prisma.dailyUsage.upsert({
    where: { userId_date: { userId, date: today() } },
    create: { userId, date: today(), [field]: cleanCount(count) },
    update: { [field]: { increment: cleanCount(count) } },
  });

  return NextResponse.json({ ok: true, available: true, plan });
}
