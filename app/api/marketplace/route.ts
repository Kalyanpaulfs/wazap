import { NextResponse } from "next/server";
import { publishedMarketplaceListings } from "@/lib/marketplace-catalog";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const result = await publishedMarketplaceListings({
    q: url.searchParams.get("q") || "",
    category: url.searchParams.get("category") || "",
    packageType: url.searchParams.get("packageType") || "",
    limit: 50,
  });
  return NextResponse.json({ listings: result.data }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}
