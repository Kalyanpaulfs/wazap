import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FUNNEL_EVENTS, recordFunnelEvent, type FunnelEventName } from "@/lib/funnel";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!rateLimit(`funnel:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many events." }, { status: 429 });
  }

  const session = await getServerSession(authOptions);
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; source?: unknown };
  const eventName = body.name as FunnelEventName;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const allowed = eventName === "pricing_view" || (eventName === "first_tool_success" && Boolean(userId));
  if (!FUNNEL_EVENTS.includes(eventName) || !allowed) {
    return NextResponse.json({ error: "Unsupported event." }, { status: 400 });
  }

  await recordFunnelEvent(eventName, {
    userId,
    source: typeof body.source === "string" ? body.source.slice(0, 100) : null,
  });
  return NextResponse.json({ ok: true });
}
