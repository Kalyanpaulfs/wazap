import {claimRouterHandoff} from "@/lib/router-claim";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cacheRoute, readCachedRoute } from "@/lib/routing-cache";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";

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
  let rotator: { id?: string; userId?: string; name?: string; code: string; numbers: string[]; fallbackNumber?: string | null; message?: string | null; currentIdx: number; planPausedAt?: Date | null } | null = null;
  try {
    rotator = await Promise.race([
      prisma.rotatorLink.findUnique({ where: { code: normalizedCode } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("routing database timeout")), 1200)),
    ]);
    if (rotator) await cacheRoute({ code: rotator.code, numbers: rotator.numbers, fallbackNumber: rotator.fallbackNumber, message: rotator.message, currentIdx: rotator.currentIdx }).catch(() => {});
  } catch {
    rotator = await readCachedRoute(normalizedCode);
  }
  if (!rotator) redirect("/");
  // Only checked on the live DB path (not the degraded-cache fallback, which
  // intentionally fails open for availability - see the catch above).
  if (rotator.planPausedAt) redirect("/link-paused?type=rotator");

  const validNumbers = rotator.numbers.map(number => number.replace(/\D/g, "")).filter(number => number.length >= 8);
  const fallback = (rotator.fallbackNumber || process.env.WAZAP_DEFAULT_WHATSAPP_NUMBER || validNumbers[0] || "").replace(/\D/g, "");
  if (!validNumbers.length && !fallback) redirect("/");
  let number=validNumbers[rotator.currentIdx % (validNumbers.length||1)]||fallback;
  let blocked=false;
  if(rotator.id&&rotator.userId&&withinSpeedLimit){
    try{const claim=await claimRouterHandoff({...rotator,id:rotator.id,userId:rotator.userId});if(!claim.allowed)blocked=true;else number=claim.destination;}
    catch{console.warn("[router] metering unavailable; preserving public fallback");}
  }
  // Keep redirect outside the catch: Next redirects throw and must not be swallowed.
  if(blocked)redirect(`/router-limit?code=${encodeURIComponent(normalizedCode)}`);
  const target = new URL(`https://wa.me/${number || fallback}`);
  if (rotator.message) target.searchParams.set("text", rotator.message);
  redirect(target.toString());
}
