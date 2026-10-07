import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOOL_LIMITS } from "@/lib/tool-access";

export const dynamic = "force-dynamic";

type MeterableTool = "checker" | "vcard" | "widget" | "transcript" | "bulk";

const FIELD_MAP: Record<MeterableTool, "checkerUses" | "vcardDownloads" | "widgetCopies" | "transcriptExports" | "bulkSends"> = {
  checker:    "checkerUses",
  vcard:      "vcardDownloads",
  widget:     "widgetCopies",
  transcript: "transcriptExports",
  bulk:       "bulkSends",
};

function today() { return new Date().toISOString().slice(0, 10); }

function cleanCount(value: unknown) {
  const count = Number(value ?? 1);
  if (!Number.isFinite(count)) return 1;
  return Math.min(100, Math.max(1, Math.floor(count)));
}

// GET /api/tools/use?tool=checker — returns current usage + limit
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tool = req.nextUrl.searchParams.get("tool") as MeterableTool | null;
  if (!tool || !FIELD_MAP[tool]) return NextResponse.json({ error: "Invalid tool" }, { status: 400 });

  if (!session?.user) {
    const limit = TOOL_LIMITS[tool].free.uses;
    return NextResponse.json({ usedToday: 0, limit, remaining: limit, plan: "free", anonymous: true });
  }

  const userId = (session.user as any).id as string;
  const rawPlan = ((session.user as any).plan ?? "free") as string;
  const plan = (rawPlan === "business" ? "ultimate" : rawPlan) as keyof typeof TOOL_LIMITS.checker;
  const limit = (TOOL_LIMITS[tool as keyof typeof TOOL_LIMITS] as any)[plan]?.uses ?? 0;

  const usage = await prisma.dailyUsage.findUnique({
    where: { userId_date: { userId, date: today() } },
  });

  const field = FIELD_MAP[tool];
  const usedToday = (usage as any)?.[field] ?? 0;
  const remaining = limit === -1 ? -1 : Math.max(0, limit - usedToday);

  return NextResponse.json({ usedToday, limit, remaining, plan: rawPlan });
}

// POST /api/tools/use — { tool, count? } — increments usage, returns 429 if limit hit
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const { tool, count = 1 } = await req.json() as { tool: MeterableTool; count?: number };
  if (!tool || !FIELD_MAP[tool]) return NextResponse.json({ error: "Invalid tool" }, { status: 400 });

  if (!session?.user) {
    const limit = TOOL_LIMITS[tool].free.uses;
    return NextResponse.json({ ok: true, usedToday: 0, limit, remaining: limit, plan: "free", anonymous: true });
  }

  const userId = (session.user as any).id as string;
  const rawPlan = ((session.user as any).plan ?? "free") as string;
  const plan = rawPlan === "business" ? "ultimate" : rawPlan;
  const limit = (TOOL_LIMITS[tool as keyof typeof TOOL_LIMITS] as any)[plan]?.uses ?? 0;

  const field = FIELD_MAP[tool];

  const usage = await prisma.dailyUsage.upsert({
    where: { userId_date: { userId, date: today() } },
    create: { userId, date: today() },
    update: {},
  });

  const usedToday = (usage as any)[field] ?? 0;

  if (limit !== -1 && usedToday >= limit) {
    return NextResponse.json({ error: "limit", usedToday, limit, remaining: 0 }, { status: 429 });
  }

  const safeCount = cleanCount(count);
  const toAdd = limit === -1 ? safeCount : Math.min(safeCount, limit - usedToday);

  const updated = await prisma.dailyUsage.update({
    where: { userId_date: { userId, date: today() } },
    data: { [field]: { increment: toAdd } },
  });

  const newUsed = (updated as any)[field] ?? 0;
  const remaining = limit === -1 ? -1 : Math.max(0, limit - newUsed);

  return NextResponse.json({ ok: true, usedToday: newUsed, limit, remaining });
}
