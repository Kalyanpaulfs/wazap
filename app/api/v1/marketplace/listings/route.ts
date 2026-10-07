import { NextResponse } from "next/server";
import { publishedMarketplaceListings } from "@/lib/marketplace-catalog";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const client = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",", 1)[0].trim();
  if (!rateLimit(`public-marketplace:${client}`, 120, 60_000)) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Marketplace API rate limit exceeded." } }, { status: 429 });
  }
  const url = new URL(req.url);
  const result = await publishedMarketplaceListings({
    q: url.searchParams.get("q") || "",
    category: url.searchParams.get("category") || "",
    packageType: url.searchParams.get("packageType") || "",
    limit: Number(url.searchParams.get("limit")) || 25,
    after: url.searchParams.get("after"),
  });
  return NextResponse.json({
    data: result.data,
    meta: { hasMore: result.hasMore, nextCursor: result.nextCursor },
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
