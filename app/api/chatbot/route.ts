import { NextResponse } from "next/server";

// AI chat is retired (SUPPORT-2, "no AI" - see lib/support-tickets.ts). This
// endpoint is kept only as a clean stub: an old open browser tab, or a
// worker/monitor still polling the old URL, gets a clear 410 instead of a
// bare 404. The widget no longer calls this route at all.
export const runtime = "nodejs";

function gone() {
  return NextResponse.json({ error: "Chat assistant retired. Use support tickets." }, { status: 410 });
}

export async function GET() {
  return gone();
}

export async function POST() {
  return gone();
}
