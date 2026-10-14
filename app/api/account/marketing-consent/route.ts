import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sameSiteRequest } from "@/lib/crm";
import { sharedRateLimit } from "@/lib/shared-rate-limit";
import { requestIp } from "@/lib/request-ip";
import { CONSENT_WORDING, grantMarketingConsent, withdrawMarketingConsent } from "@/lib/marketing-consent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// FEAT-CONSENT "Account > Email preferences" switch. Same effect as the
// unsubscribe link when turned off; turning it on records the same kind of
// dated, worded evidence as every other entry point (lib/marketing-consent).
export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; email?: string } | undefined;
  if (!sessionUser?.id || !sessionUser.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await sharedRateLimit(`account-consent:${sessionUser.id}`, 10, 60_000))) {
    return NextResponse.json({ error: "Please wait before trying again." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { wanted?: boolean };
  const wanted = body.wanted === true;
  const ip = requestIp(req.headers);
  const userAgent = req.headers.get("user-agent");
  const granted = await prisma.$transaction(async (tx) => {
    if (wanted) {
      return grantMarketingConsent(tx, {
        userId: sessionUser.id,
        email: sessionUser.email!,
        source: "account_settings",
        wording: CONSENT_WORDING.account_settings,
        ip,
        userAgent,
      });
    }
    await withdrawMarketingConsent(tx, {
      userId: sessionUser.id,
      email: sessionUser.email!,
      reason: "Turned off email preferences in account settings.",
    });
    return true;
  });
  if (wanted && !granted) {
    return NextResponse.json({ error: "This email address cannot be re-subscribed automatically. Contact support." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, subscribed: wanted });
}
