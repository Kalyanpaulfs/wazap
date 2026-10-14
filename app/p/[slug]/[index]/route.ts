import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordConversationStart } from "@/lib/conversations";
import { rateLimit } from "@/lib/rate-limit";

const PUBLIC_BASE = "https://wazap.lt";

type PageLink = { label?: string; number?: string; note?: string };

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

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; index: string }> }) {
  const { slug, index } = await params;
  const fallback = safeFallback(req);
  const itemIndex = Number.parseInt(index, 10);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    const page = await Promise.race([
      prisma.linktreePage.findUnique({ where: { slug } }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("link-page lookup timeout")), 1200)),
    ]);
    if (page?.planPausedAt) return NextResponse.redirect(`${PUBLIC_BASE}/link-paused?type=linktree`, 307);
    const links = (page && Array.isArray(page.links) ? page.links : []) as PageLink[];
    const link = Number.isInteger(itemIndex) ? links[itemIndex] : null;
    const number = String(link?.number ?? "").replace(/\D/g, "").slice(0, 20);
    if (!page || number.length < 7) return NextResponse.redirect(fallback || `${PUBLIC_BASE}/l/${encodeURIComponent(slug)}`, 307);
    if (rateLimit(`link-page-click:${ip}:${page.id}`, 60, 60_000)) {
      await recordConversationStart({
        userId: page.userId,
        assetType: "link_page",
        assetId: page.id,
        assetName: page.title,
        source: "Wazap Link Page",
        campaign: String(link?.label ?? "").slice(0, 120),
        destination: number,
      });
    }
    return NextResponse.redirect(`https://wa.me/${number}`, 307);
  } catch {
    return NextResponse.redirect(fallback || `${PUBLIC_BASE}/l/${encodeURIComponent(slug)}`, 307);
  }
}
