import { ownsSupport } from "@/lib/support-session";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sameSiteRequest } from "@/lib/crm";
import { reopenByCustomer } from "@/lib/support-tickets";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const visitorId = cleanText(body.visitorId, 120);
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id || null;

  // A signed-in user reopening their own ticket must not be blocked by a
  // stale/unverified visitorId - only enforce the strict cookie check when
  // there's no session to fall back on (visitor-only request).
  const verifiedVisitorId = visitorId && ownsSupport(req, visitorId) ? visitorId : null;
  if (visitorId && !verifiedVisitorId && !userId) return NextResponse.json({ error: "Support session required." }, { status: 403 });
  if (!verifiedVisitorId && !userId) return NextResponse.json({ error: "Support session required." }, { status: 403 });

  const outcome = await reopenByCustomer(id, { visitorId: verifiedVisitorId, userId });
  if (outcome.kind === "error") return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true });
}
