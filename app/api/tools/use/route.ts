import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";

export const dynamic = "force-dynamic";

// Owner decision: the website widget (button) is free and unlimited for
// EVERY plan, including free and anonymous (not signed in) visitors - see
// lib/plan-limits.ts WIDGET_AVAILABLE. This endpoint never gates it; for a
// signed-in user it still records a usage count for analytics (dailyUsage),
// but an anonymous visitor has no account to attribute that to, so there is
// simply nothing to meter.
type MeterableTool = "widget";

const FIELD_MAP: Record<MeterableTool, "widgetCopies"> = {
  widget: "widgetCopies",
};

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
  return linkPlan(user);
}

// GET /api/tools/use?tool=widget - always available, logged in or not.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tool = req.nextUrl.searchParams.get("tool") as MeterableTool | null;
  if (!tool || !FIELD_MAP[tool]) return NextResponse.json({ error: "Invalid tool" }, { status: 400 });

  if (!session?.user) return NextResponse.json({ available: true, plan: "free" });

  const userId = (session.user as { id: string }).id;
  const plan = await planFor(userId);
  return NextResponse.json({ available: true, plan });
}

// POST /api/tools/use - { tool, count? } - records usage for analytics only
// (never blocks it; the widget is free for everyone).
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const { tool, count = 1 } = await req.json() as { tool: MeterableTool; count?: number };
  if (!tool || !FIELD_MAP[tool]) return NextResponse.json({ error: "Invalid tool" }, { status: 400 });

  if (!session?.user) return NextResponse.json({ ok: true, available: true });

  const userId = (session.user as { id: string }).id;
  const field = FIELD_MAP[tool];
  await prisma.dailyUsage.upsert({
    where: { userId_date: { userId, date: today() } },
    create: { userId, date: today(), [field]: cleanCount(count) },
    update: { [field]: { increment: cleanCount(count) } },
  });

  return NextResponse.json({ ok: true, available: true });
}
