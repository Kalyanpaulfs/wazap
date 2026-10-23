import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";
import { publicUrl } from "@/lib/my-links";

// TOOL-FREE-2 Link shortener redirect. Deliberately simpler than app/w's
// WhatsApp-link redirect: no ConversationStart/Audience capture (owner
// spec - this free tool isn't part of the lead-routing/trial-cap system),
// no plan-pause check (it isn't part of the shared link pool either - see
// lib/link-pool.ts). Live -> 302 to the target. Disabled/unknown -> the
// friendly page at /s/unavailable (same "redirect to a page" pattern as
// app/r, app/w, app/a redirecting to /link-paused instead of rendering
// inline) - NextResponse.redirect is used directly (not next/navigation's
// redirect()) so the live-link case is a literal, explicit 302.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await prisma.shortUrl.findUnique({ where: { code: code.toLowerCase() } });
  if (!link) return NextResponse.redirect(publicUrl(`/s/unavailable?reason=notfound`), 302);
  if (link.disabledAt) {
    return NextResponse.redirect(publicUrl(`/s/unavailable?reason=disabled&code=${encodeURIComponent(link.code)}`), 302);
  }

  const ip = requestIp(req.headers);
  // Same bot/prefetch protection as the other redirect routes: over ~10
  // hits/minute for the same IP+code, the visitor is still redirected but
  // the click isn't counted.
  const withinSpeedLimit = rateLimit(`redirect:s:${link.code}:${ip}`, 10, 60_000);
  if (withinSpeedLimit) {
    try {
      await prisma.shortUrl.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });
    } catch {
      console.warn("[short-url] click increment failed; preserving the redirect");
    }
  }

  return NextResponse.redirect(link.targetUrl, 302);
}
