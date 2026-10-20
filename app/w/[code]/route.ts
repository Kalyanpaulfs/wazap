import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { claimShortLinkHandoff, routerQuotaAllowed } from "@/lib/router-claim";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { canRouteLinks, OWNER_ENTITLEMENT_SELECT } from "@/lib/router-entitlements";
import { captureAudience } from "@/lib/audience-capture";

// Bot protection (FEAT-PLAN-LIMITS): see app/r/[code]/route.ts for the
// rationale. A real visitor is always redirected; over ~10 hits/minute for
// the same IP+code we just stop counting the click (and stop metering it -
// see claimShortLinkHandoff).
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await prisma.shortLink.findUnique({ where: { code: code.toLowerCase() }, include: { user: { select: OWNER_ENTITLEMENT_SELECT } } });
  if (!link) redirect("/");
  if (link.planPausedAt) redirect("/link-paused?type=shortlink");
  // Manual pause (owner feature): the customer paused this link themselves,
  // independent of the plan pause above. No click is recorded.
  if (link.pausedAt) redirect("/link-paused?type=shortlink&reason=owner");
  // Live owner check on every click: free with no active Free trial never
  // routes, even before a pause-sync cron has run.
  if (!canRouteLinks(link.user)) redirect("/link-paused?type=shortlink&reason=plan");

  const ip = requestIp(req.headers);
  const withinSpeedLimit = rateLimit(`redirect:w:${code.toLowerCase()}:${ip}`, 10, 60_000);
  let blocked = false;
  if (withinSpeedLimit) {
    // A WhatsApp/brand short-link click counts against the SAME 100-lead
    // trial cap as a rotator handoff (audit item 12) - claimShortLinkHandoff
    // does the locked quota check + count + record, same as
    // claimRouterHandoff in app/r/[code]/route.ts.
    try {
      const audience = captureAudience(req.headers, ip);
      const claim = await claimShortLinkHandoff({ id: link.id, userId: link.userId, name: link.name, code: link.code, phone: link.phone, message: link.message }, new Date(), audience);
      if (!claim.allowed) blocked = true;
    } catch {
      console.warn("[router] short-link metering unavailable; preserving public fallback");
    }
  } else {
    // Over the speed limit: skip counting (bot protection), but the trial's
    // 100-lead cap must still be enforced - same reasoning as app/r/[code].
    try {
      if (!(await routerQuotaAllowed(link.userId))) blocked = true;
    } catch {
      console.warn("[router] short-link quota check unavailable; preserving public fallback");
    }
  }
  // Keep redirect outside the try/catch above: Next redirects throw and must not be swallowed.
  if (blocked) redirect(`/router-limit?code=${encodeURIComponent(link.code)}`);

  const target = `https://wa.me/${link!.phone}${link!.message ? `?text=${encodeURIComponent(link!.message)}` : ""}`;
  redirect(target);
}
