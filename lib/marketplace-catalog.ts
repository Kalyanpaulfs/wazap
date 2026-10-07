import { prisma } from "@/lib/prisma";

const publishedInclude = {
  publisher: { select: { displayName: true, slug: true, isOfficial: true } },
  versions: {
    where: { status: "published" },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { id: true, version: true, manifest: true, changelog: true, createdAt: true },
  },
  reviews: { where: { status: "published" }, select: { rating: true } },
  _count: { select: { reviews: { where: { status: "published" } } } },
};

function publicListing<T extends {
  id: string; slug: string; name: string; summary: string; description: string;
  category: string; packageType: string; pricingModel: string; requestedScopes: string[];
  manifest: unknown; icon: string | null; installCount: number; publishedAt: Date | null;
  updatedAt: Date; publisher: { displayName: string; slug: string; isOfficial: boolean };
  versions: Array<{ id: string; version: string; manifest: unknown; changelog: string; createdAt: Date }>;
  reviews: Array<{ rating: number }>; _count: { reviews: number };
}>(item: T) {
  const rating = item.reviews.length
    ? Number((item.reviews.reduce((sum, review) => sum + review.rating, 0) / item.reviews.length).toFixed(1))
    : null;
  return {
    id: item.id,
    slug: item.slug,
    name: item.name,
    summary: item.summary,
    description: item.description,
    category: item.category,
    packageType: item.packageType,
    pricingModel: item.pricingModel,
    requestedScopes: item.requestedScopes,
    manifest: item.manifest,
    icon: item.icon,
    installCount: item.installCount,
    rating,
    reviewCount: item._count.reviews,
    publisher: item.publisher,
    latestVersion: item.versions[0] || null,
    publishedAt: item.publishedAt,
    updatedAt: item.updatedAt,
  };
}

export async function publishedMarketplaceListings(options: {
  q?: string; category?: string; packageType?: string; limit?: number; after?: string | null;
} = {}) {
  const q = String(options.q || "").trim().slice(0, 80);
  const category = String(options.category || "").trim().slice(0, 40);
  const packageType = ["agent", "external_tool"].includes(String(options.packageType || "")) ? String(options.packageType) : "";
  const limit = Math.max(1, Math.min(Number(options.limit) || 25, 50));
  const rows = await prisma.marketplaceListing.findMany({
    where: {
      status: "published",
      pricingModel: "free",
      versions: { some: { status: "published" } },
      ...(category ? { category } : {}),
      ...(packageType ? { packageType } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { summary: { contains: q, mode: "insensitive" as const } }, { slug: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
    orderBy: [{ installCount: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
    take: limit + 1,
    ...(options.after ? { cursor: { id: options.after }, skip: 1 } : {}),
    include: publishedInclude,
  });
  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map(publicListing);
  return { data, hasMore, nextCursor: hasMore ? data.at(-1)?.id || null : null };
}

export async function publishedMarketplaceListing(slug: string) {
  const item = await prisma.marketplaceListing.findFirst({
    where: {
      slug: slug.trim().slice(0, 70),
      status: "published",
      pricingModel: "free",
      versions: { some: { status: "published" } },
    },
    include: publishedInclude,
  });
  return item ? publicListing(item) : null;
}
