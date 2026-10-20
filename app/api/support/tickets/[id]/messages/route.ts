import { ownsSupport } from "@/lib/support-session";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sameSiteRequest } from "@/lib/crm";
import { rateLimit } from "@/lib/rate-limit";
import { addCustomerMessage } from "@/lib/support-tickets";
import { MAX_MESSAGES_PER_MINUTE, MESSAGE_BURST_TEXT } from "@/lib/support-ticket-rules";

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const visitorId = cleanText(body.visitorId, 120);
  if (!ownsSupport(req, visitorId)) return NextResponse.json({ error: "Support session required." }, { status: 403 });

  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id || null;
  const burstKey = userId ? `support-burst:user:${userId}` : `support-burst:visitor:${visitorId}`;
  if (!rateLimit(burstKey, MAX_MESSAGES_PER_MINUTE, 60_000)) return NextResponse.json({ error: MESSAGE_BURST_TEXT }, { status: 429 });

  const message = cleanText(body.message, 4000);
  const outcome = await addCustomerMessage(id, { visitorId, userId }, message);
  if (outcome.kind === "error") return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, status: outcome.status });
}
