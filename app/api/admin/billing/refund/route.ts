import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sameSiteRequest } from "@/lib/crm";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { refundPayment } from "@/lib/billing-actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getServerSession(authOptions);
  const admin = session?.user as { id?: string; isAdmin?: boolean } | undefined;
  if (!admin?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await sharedRateLimit(`admin-refund:${admin.id}`, 20, 60_000))) {
    return NextResponse.json({ error: "Please wait a minute before issuing another refund." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { paymentId?: string; reason?: string };
  const paymentId = String(body.paymentId || "").trim();
  const reason = String(body.reason || "").trim();
  if (!paymentId) return NextResponse.json({ error: "Choose a payment." }, { status: 400 });
  if (reason.length < 3 || reason.length > 300) {
    return NextResponse.json({ error: "Reason must be 3-300 characters." }, { status: 400 });
  }

  const result = await refundPayment({ paymentId, kind: "admin", actorUserId: admin.id ?? null, reason, now: new Date() });
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "already_refunded" || result.reason === "window_closed" ? 409 : 502;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return NextResponse.json(result);
}
