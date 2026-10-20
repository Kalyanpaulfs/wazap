import { ownsSupport } from "@/lib/support-session";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { unreadCountForOwner } from "@/lib/support-tickets";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Cheap poll target for the widget bubble's red dot.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const visitorId = cleanText(searchParams.get("visitorId"), 120);
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id || null;

  // A signed-in user's own tickets must not be blocked by a stale/unverified
  // visitorId - only enforce the strict cookie check when there's no
  // session to fall back on (visitor-only request).
  const verifiedVisitorId = visitorId && ownsSupport(req, visitorId) ? visitorId : null;
  if (visitorId && !verifiedVisitorId && !userId) {
    return NextResponse.json({ error: "Support session required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (!verifiedVisitorId && !userId) return NextResponse.json({ unread: 0 }, { headers: { "Cache-Control": "no-store" } });

  const unread = await unreadCountForOwner({ visitorId: verifiedVisitorId, userId });
  return NextResponse.json({ unread }, { headers: { "Cache-Control": "no-store" } });
}
