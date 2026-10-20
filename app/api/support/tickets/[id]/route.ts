import { ownsSupport } from "@/lib/support-session";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getTicketDetail } from "@/lib/support-tickets";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Ticket + messages, ownership-checked (visitor cookie OR logged-in userId).
// Marks admin messages as read by the visitor.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
  if (!verifiedVisitorId && !userId) return NextResponse.json({ error: "Support session required." }, { status: 403, headers: { "Cache-Control": "no-store" } });

  const ticket = await getTicketDetail(id, { visitorId: verifiedVisitorId, userId });
  if (!ticket) return NextResponse.json({ error: "Ticket not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ticket }, { headers: { "Cache-Control": "no-store" } });
}
