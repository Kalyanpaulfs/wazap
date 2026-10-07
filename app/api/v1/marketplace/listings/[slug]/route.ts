import { NextResponse } from "next/server";
import { publishedMarketplaceListing } from "@/lib/marketplace-catalog";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const client = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",", 1)[0].trim();
  if (!rateLimit(`public-marketplace:${client}`, 120, 60_000)) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Marketplace API rate limit exceeded." } }, { status: 429 });
  }
  const { slug } = await params;
  const data = await publishedMarketplaceListing(slug);
  if (!data) return NextResponse.json({ error: { code: "not_found", message: "Published marketplace listing not found." } }, { status: 404 });
  return NextResponse.json({ data }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
