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

// FEAT-CONSENT dashboard banner ("Get early access to new features and
// member-only offers? Yes / No thanks"), shown only to logged-in users who
// have not yet answered (see shouldShowConsentBanner in lib/marketing-consent
// and app/dashboard/page.tsx). Both answers are one click and equally easy.
export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user as { id?: string; email?: string } | undefined;
  if (!sessionUser?.id || !sessionUser.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await sharedRateLimit(`dashboard-consent:${sessionUser.id}`, 10, 60_000))) {
    return NextResponse.json({ error: "Please wait before trying again." }, { status: 429 });
  }
  const body = (await req.json().catch(() => ({}))) as { wanted?: boolean };
  const wanted = body.wanted === true;
  const ip = requestIp(req.headers);
  const userAgent = req.headers.get("user-agent");
  await prisma.$transaction(async (tx) => {
    if (wanted) {
      await grantMarketingConsent(tx, {
        userId: sessionUser.id,
        email: sessionUser.email!,
        source: "dashboard_banner",
        wording: CONSENT_WORDING.dashboard_banner,
        ip,
        userAgent,
      });
    } else {
      await withdrawMarketingConsent(tx, {
        userId: sessionUser.id,
        email: sessionUser.email!,
        reason: "Declined the dashboard marketing prompt.",
      });
    }
  });
  return NextResponse.json({ ok: true });
}
