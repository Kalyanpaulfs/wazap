import { ownsSupport } from "@/lib/support-session";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sameSiteRequest } from "@/lib/crm";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { createTicket, listTicketsForOwner } from "@/lib/support-tickets";
import { MAX_MESSAGES_PER_MINUTE, MESSAGE_BURST_TEXT } from "@/lib/support-ticket-rules";

const MAX_TICKET_CREATES_PER_IP_PER_HOUR = 20;

function cleanText(value: unknown, max = 4000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function sessionUserId() {
  const session = await getServerSession(authOptions);
  return (session?.user as { id?: string } | undefined)?.id || null;
}

// GET union of tickets on this visitor's conversation and (if logged in)
// tickets with userId = me. Never other people's.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const visitorId = cleanText(searchParams.get("visitorId"), 120);
  const userId = await sessionUserId();

  // A signed-in user's own tickets (userId ownership) must not be blocked by
  // a stale/unverified visitorId - only enforce the strict cookie check when
  // there's no session to fall back on (visitor-only request).
  const verifiedVisitorId = visitorId && ownsSupport(req, visitorId) ? visitorId : null;
  if (visitorId && !verifiedVisitorId && !userId) {
    return NextResponse.json({ error: "Support session required." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (!verifiedVisitorId && !userId) return NextResponse.json({ tickets: [] }, { headers: { "Cache-Control": "no-store" } });

  const tickets = await listTicketsForOwner({ visitorId: verifiedVisitorId, userId });
  return NextResponse.json({ tickets }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });

  const ip = requestIp(req.headers);
  if (!rateLimit(`support-tickets-ip:${ip}`, MAX_TICKET_CREATES_PER_IP_PER_HOUR, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many ticket requests from this network. Please try again in a bit." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const visitorId = cleanText(body.visitorId, 120);
  if (!ownsSupport(req, visitorId)) return NextResponse.json({ error: "Support session required." }, { status: 403 });

  const userId = await sessionUserId();
  const burstKey = userId ? `support-burst:user:${userId}` : `support-burst:visitor:${visitorId}`;
  if (!rateLimit(burstKey, MAX_MESSAGES_PER_MINUTE, 60_000)) return NextResponse.json({ error: MESSAGE_BURST_TEXT }, { status: 429 });

  const topic = cleanText(body.topic, 20);
  const subtopic = cleanText(body.subtopic, 40) || null;
  const message = cleanText(body.message, 4000);
  const quickAnswerId = cleanText(body.quickAnswerId, 60) || null;
  const differentProblem = body.differentProblem === true;
  const parentTicketId = cleanText(body.parentTicketId, 60) || null;

  const outcome = await createTicket({ visitorId, topic, subtopic, message, quickAnswerId, userId, differentProblem, parentTicketId });
  if (outcome.kind === "error") return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  if (outcome.kind === "existing") return NextResponse.json({ existing: outcome.existing });
  return NextResponse.json({ ticket: outcome.ticket }, { status: 201 });
}
