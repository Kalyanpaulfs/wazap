import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sameSiteRequest } from "@/lib/crm";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { currentSubscriptionRecord } from "@/lib/subscription-record";
import { updateDodoPaymentMethod } from "@/lib/dodo";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await sharedRateLimit(`update-card:${userId}`, 5, 60 * 60_000))) return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  const subscription = await currentSubscriptionRecord(userId);
  if (subscription?.method !== "dodo" || !subscription.txId) return NextResponse.json({ error: "No card subscription found." }, { status: 409 });
  try {
    const base = process.env.NEXTAUTH_URL ?? "https://wazap.lt";
    const url = await updateDodoPaymentMethod(subscription.txId, `${base}/dashboard#billing`);
    if (!url) return NextResponse.json({ error: "Could not open the card update page." }, { status: 502 });
    return NextResponse.json({ url });
  } catch (err) {
    console.error("[billing/update-card]", err);
    return NextResponse.json({ error: "Could not open the card update page." }, { status: 502 });
  }
}
