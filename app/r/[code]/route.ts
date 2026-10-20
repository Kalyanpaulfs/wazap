import {claimRouterHandoff, routerQuotaAllowed} from "@/lib/router-claim";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cacheRoute, readCachedRoute, removeCachedRoute } from "@/lib/routing-cache";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { canRouteLinks, OWNER_ENTITLEMENT_SELECT } from "@/lib/router-entitlements";
import { captureAudience } from "@/lib/audience-capture";

// Bot protection (FEAT-PLAN-LIMITS): a per-IP+code speed limit of ~10 hits/
// minute. A real visitor is never blocked from the redirect itself — once
// over the limit we just stop advancing rotation / counting the click /
// consuming a free lead for that request. In-memory (lib/rate-limit.ts), the
// same helper already used for ad-link click counting; good enough for a
// soft abuse guard and avoids an extra DB round trip on every redirect.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalizedCode = code.toUpperCase();
  const ip = requestIp(req.headers);
  const withinSpeedLimit = rateLimit(`redirect:r:${normalizedCode}:${ip}`, 10, 60_000);
  let rotator: { id?: string; userId?: string; name?: string; code: string; numbers: string[]; fallbackNumber?: string | null; message?: string | null; currentIdx: number; planPausedAt?: Date | null; pausedAt?: Date | null } | null = null;
  let ownerBlocked = false;
  try {
    const row = await Promise.race([
      prisma.rotatorLink.findUnique({ where: { code: normalizedCode }, include: { user: { select: OWNER_ENTITLEMENT_SELECT } } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("routing database timeout")), 1200)),
    ]);
    if (row) {
      const { user: owner, ...link } = row;
      rotator = link;
      // Live owner check on EVERY click (not just the cached planPausedAt
      // flag): free with no active Free trial never routes, even before a
      // pause-sync cron has run and regardless of the speed limit/metering
      // availability below.
      ownerBlocked = !canRouteLinks(owner);
      // Never leave a paused/blocked rotator cached for the outage fallback
      // - this covers BOTH the plan pause and the customer's own manual
      // pause (pausedAt), so the degraded-cache path can never serve a
      // paused link either.
      if (link.planPausedAt || link.pausedAt || ownerBlocked) await removeCachedRoute(link.code);
      else await cacheRoute({ code: link.code, numbers: link.numbers, fallbackNumber: link.fallbackNumber, message: link.message, currentIdx: link.currentIdx }).catch(() => {});
    }
  } catch {
    rotator = await readCachedRoute(normalizedCode);
  }
  if (!rotator) redirect("/");
  // Only checked on the live DB path (not the degraded-cache fallback, which
  // intentionally fails open for availability - see the catch above).
  if (rotator.planPausedAt) redirect("/link-paused?type=rotator");
  // Manual pause (owner feature): the customer paused this link themselves.
  // Never record a click for a paused link - we redirect before any
  // metering/counting below.
  if (rotator.pausedAt) redirect("/link-paused?type=rotator&reason=owner");
  if (ownerBlocked) redirect(`/router-limit?code=${encodeURIComponent(normalizedCode)}`);

  const validNumbers = rotator.numbers.map(number => number.replace(/\D/g, "")).filter(number => number.length >= 8);
  const fallback = (rotator.fallbackNumber || process.env.WAZAP_DEFAULT_WHATSAPP_NUMBER || validNumbers[0] || "").replace(/\D/g, "");
  if (!validNumbers.length && !fallback) redirect("/");
  let number=validNumbers[rotator.currentIdx % (validNumbers.length||1)]||fallback;
  let blocked=false;
  if(rotator.id&&rotator.userId){
    if(withinSpeedLimit){
      try{const audience=captureAudience(req.headers,ip);const claim=await claimRouterHandoff({...rotator,id:rotator.id,userId:rotator.userId},new Date(),audience);if(!claim.allowed)blocked=true;else number=claim.destination;}
      catch{console.warn("[router] metering unavailable; preserving public fallback");}
    } else {
      // Over the speed limit: skip rotation/counting (bot protection), but
      // the trial's 100-lead cap must still be enforced - a fast enough
      // burst of requests must not be able to bypass it (audit item 12).
      try{if(!(await routerQuotaAllowed(rotator.userId)))blocked=true;}
      catch{console.warn("[router] quota check unavailable; preserving public fallback");}
    }
  }
  // Keep redirect outside the catch: Next redirects throw and must not be swallowed.
  if(blocked)redirect(`/router-limit?code=${encodeURIComponent(normalizedCode)}`);
  const target = new URL(`https://wa.me/${number || fallback}`);
  if (rotator.message) target.searchParams.set("text", rotator.message);
  redirect(target.toString());
}
