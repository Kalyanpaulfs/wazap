import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordConversationStart } from "@/lib/conversations";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { canRouteLinks, linkPlan, OWNER_ENTITLEMENT_SELECT } from "@/lib/router-entitlements";
import { adLinksAvailable } from "@/lib/plan-limits";
import { captureAudience } from "@/lib/audience-capture";

const PUBLIC_BASE = "https://wazap.lt";

function safeFallback(req: Request) {
  const value = new URL(req.url).searchParams.get("to");
  if (!value) return null;
  try {
    const target = new URL(value);
    return target.protocol === "https:" && target.hostname === "wa.me" && /^\/\d{7,20}$/.test(target.pathname)
      ? target.toString()
      : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = safeFallback(req);
  const ip = requestIp(req.headers);
  try {
    const link = await Promise.race([
      prisma.adLink.findUnique({ where: { id }, include: { user: { select: OWNER_ENTITLEMENT_SELECT } } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ad-link lookup timeout")), 1200)),
    ]);
    // The ad link genuinely does not exist (deleted) - this is a definite
    // answer, not an availability problem, so it must NOT fall back to the
    // caller-supplied `?to=` wa.me number (that fallback is only for a real
    // DB error/timeout below, in the catch block).
    if (!link) return NextResponse.redirect(`${PUBLIC_BASE}/link-paused?type=ad&reason=unavailable`, 307);
    if (link.planPausedAt) return NextResponse.redirect(`${PUBLIC_BASE}/link-paused?type=ad`, 307);
    // Manual pause (owner feature): the customer paused this link
    // themselves, independent of the plan pause above. No click is recorded.
    if (link.pausedAt) return NextResponse.redirect(`${PUBLIC_BASE}/link-paused?type=ad&reason=owner`, 307);
    // Live owner check on every click: free with no active Free trial never
    // routes, and a plan that doesn't include ad links (e.g. downgraded from
    // Growth to Solo) never routes ad links either - both even before a
    // pause-sync cron has run.
    if (!canRouteLinks(link.user) || !adLinksAvailable(linkPlan(link.user))) {
      return NextResponse.redirect(`${PUBLIC_BASE}/link-paused?type=ad&reason=plan`, 307);
    }
    const target = `https://wa.me/${link.number}${link.message ? `?text=${encodeURIComponent(link.message)}` : ""}`;
    // Bot protection (FEAT-PLAN-LIMITS): ~10 hits/minute per IP+link; a real
    // visitor is always redirected either way (see the return below).
    if (rateLimit(`ad-click:${ip}:${id}`, 10, 60_000)) {
      const audience = captureAudience(req.headers, ip);
      await Promise.allSettled([
        prisma.$transaction([
          prisma.adLinkClick.create({ data: { adLinkId: link.id, country: audience.country } }),
          prisma.adLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } }),
        ]),
        recordConversationStart({
          userId: link.userId,
          assetType: "ad_link",
          assetId: link.id,
          assetName: link.name,
          source: link.utmSource || link.utmMedium || "Wazap ad link",
          campaign: link.utmCampaign,
          destination: link.number,
          audience,
        }),
      ]);
    }
    return NextResponse.redirect(target, 307);
  } catch {
    return NextResponse.redirect(fallback || `${PUBLIC_BASE}/tools/ad-builder`, 307);
  }
}
