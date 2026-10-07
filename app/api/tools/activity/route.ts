import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOOL_LIMITS } from "@/lib/tool-access";
import { rateLimit } from "@/lib/rate-limit";

const TOOLS = ["chatInsights", "replyGenerator", "messageScheduler"] as const;
type Tool = (typeof TOOLS)[number];
function valid(value: string | null): value is Tool {
  return TOOLS.includes(value as Tool);
}
function startOfDay() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
function toolFrom(event: { metadata: unknown }) {
  const m = event.metadata as { tool?: unknown } | null;
  return typeof m?.tool === "string" ? m.tool : "";
}

async function usage(userId: string) {
  const events = await prisma.funnelEvent.findMany({
    where: { userId, name: "tool_used", createdAt: { gte: startOfDay() } },
    select: { metadata: true },
  });
  return Object.fromEntries(
    TOOLS.map((tool) => [
      tool,
      events.filter((event) => toolFrom(event) === tool).length,
    ]),
  ) as Record<Tool, number>;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const tool = req.nextUrl.searchParams.get("tool");
  if (!session?.user)
    return NextResponse.json({
      authenticated: false,
      plan: "free",
      usedToday: 0,
    });
  const userId = (session.user as { id: string }).id;
  const rawPlan = String((session.user as { plan?: string }).plan || "free");
  const plan =
    rawPlan === "business"
      ? "ultimate"
      : (rawPlan as "free" | "basic" | "pro" | "ultimate");
  const counts = await usage(userId);
  if (valid(tool))
    return NextResponse.json({
      authenticated: true,
      plan: rawPlan,
      usedToday: counts[tool],
      limit: TOOL_LIMITS[tool][plan]?.uses ?? 0,
    });
  return NextResponse.json({ authenticated: true, plan: rawPlan, counts });
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    "unknown";
  if (!rateLimit(`tool-activity:${ip}`, 60, 60_000))
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as {
    tool?: string;
    action?: string;
  };
  if (!valid(body.tool || null))
    return NextResponse.json({ error: "Invalid tool." }, { status: 400 });
  const tool: Tool = body.tool! as Tool;
  const session = await getServerSession(authOptions);
  if (!session?.user)
    return NextResponse.json({ ok: true, authenticated: false });
  const userId = (session.user as { id: string }).id;
  const rawPlan = String((session.user as { plan?: string }).plan || "free");
  const plan =
    rawPlan === "business"
      ? "ultimate"
      : (rawPlan as "free" | "basic" | "pro" | "ultimate");
  const count = (await usage(userId))[tool];
  const limit = TOOL_LIMITS[tool][plan]?.uses ?? 0;
  if (limit !== -1 && count >= limit)
    return NextResponse.json(
      { error: "limit", usedToday: count, limit },
      { status: 429 },
    );
  await prisma.funnelEvent.create({
    data: {
      userId,
      name: "tool_used",
      source: tool,
      metadata: {
        tool,
        action: String(body.action || "success").slice(0, 40),
      },
    },
  });
  return NextResponse.json({
    ok: true,
    authenticated: true,
    usedToday: count + 1,
    limit,
  });
}
