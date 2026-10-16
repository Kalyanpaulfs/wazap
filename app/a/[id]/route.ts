import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordConversationStart } from "@/lib/conversations";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";

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
      prisma.adLink.findUnique({ where: { id } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("ad-link lookup timeout")), 1200)),
    ]);
    if (!link) return NextResponse.redirect(fallback || `${PUBLIC_BASE}/tools/ad-builder`, 307);
    if (link.planPausedAt) return NextResponse.redirect(`${PUBLIC_BASE}/link-paused?type=ad`, 307);
    const target = `https://wa.me/${link.number}${link.message ? `?text=${encodeURIComponent(link.message)}` : ""}`;
    // Bot protection (FEAT-PLAN-LIMITS): ~10 hits/minute per IP+link; a real
    // visitor is always redirected either way (see the return below).
    if (rateLimit(`ad-click:${ip}:${id}`, 10, 60_000)) {
      await Promise.allSettled([
        prisma.$transaction([
          prisma.adLinkClick.create({ data: { adLinkId: link.id } }),
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
        }),
      ]);
    }
    return NextResponse.redirect(target, 307);
  } catch {
    return NextResponse.redirect(fallback || `${PUBLIC_BASE}/tools/ad-builder`, 307);
  }
}
