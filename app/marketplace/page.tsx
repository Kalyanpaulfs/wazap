import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Boxes, BadgeCheck, ShieldCheck, ShoppingBag, Star } from "lucide-react";
export const metadata = {
  title: "Marketplace — AI Agents and Conversation Workflows",
  description:
    "Discover reviewed AI agents, templates and connected productivity tools that help teams manage, qualify and follow up on Wazap business conversations.",
  alternates: { canonical: "https://wazap.lt/marketplace" },
};
export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string }>;
}) {
  const params = await searchParams;
  const q = String(params.q || "").slice(0, 80);
  const category = String(params.category || "").slice(0, 40);
  const listings = await prisma.marketplaceListing.findMany({
    where: {
      status: "published",
      pricingModel: "free",
      versions: { some: { status: "published" } },
      ...(category ? { category } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { summary: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ installCount: "desc" }, { publishedAt: "desc" }],
    take: 50,
    include: {
      publisher: true,
      versions: {
        where: { status: "published" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      reviews: { where: { status: "published" }, select: { rating: true } },
      _count: { select: { reviews: true } },
    },
  });
  return (
    <main className="min-h-screen hero-bg px-4 py-14">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[#25D366]">
              Reviewed extensions for Wazap
            </p>
            <h1 className="mt-2 text-4xl font-bold text-white">Marketplace</h1>
            <p className="mt-3 max-w-2xl text-slate-400">
              Install reviewed, versioned AI agents and connected productivity
              tools. Every public package declares the access it requests and
              requires workspace approval before installation.
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/marketplace/manage"
              className="rounded-full border border-slate-700 px-4 py-2 text-sm text-white"
            >
              Publish
            </Link>
            <Link
              href="/dashboard"
              className="rounded-full bg-[#25D366] px-4 py-2 text-sm font-bold text-black"
            >
              Workspace
            </Link>
          </div>
        </div>
        <Link
          href="/shopify"
          className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#25D366]/30 bg-[#25D366]/5 p-5"
        >
          <div className="flex items-center gap-3">
            <ShoppingBag className="text-[#25D366]" />
            <div>
              <p className="font-bold text-white">
                New: WhatsApp tools for Shopify
              </p>
              <p className="text-sm text-slate-400">
                Product links, cart recovery and order updates—usable now
                without store credentials or automatic sending.
              </p>
            </div>
          </div>
          <span className="text-sm font-semibold text-[#25D366]">
            Open Shopify tools →
          </span>
        </Link>
        <form className="mt-8 flex gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Search agents and workflows"
            className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white"
          />
          <button className="rounded-xl bg-[#25D366] px-5 font-bold text-black">
            Search
          </button>
        </form>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {listings.map((l) => {
            const rating = l.reviews.length
              ? l.reviews.reduce((sum, review) => sum + review.rating, 0) / l.reviews.length
              : null;
            return (
              <article
                key={l.id}
                className="rounded-2xl border border-slate-800 bg-[#111811] p-5"
              >
                <div className="flex items-center justify-between">
                  <Boxes className="h-6 w-6 text-[#25D366]" />
                  {l.publisher.isOfficial && (
                    <span className="flex items-center gap-1 text-xs text-[#25D366]">
                      <BadgeCheck className="h-4 w-4" /> Official
                    </span>
                  )}
                </div>
                <h2 className="mt-4 text-xl font-bold text-white">{l.name}</h2>
                <p className="mt-2 text-sm text-slate-400">{l.summary}</p>
                <p className="mt-4 text-xs text-slate-500">
                  {l.packageType.replaceAll("_", " ")} · v
                  {l.versions[0]?.version} · {l.installCount} installs
                </p>
                <p className="mt-2 text-sm font-semibold text-[#25D366]">
                  Free
                </p>
                <p className="mt-2 flex items-center gap-1 text-xs text-slate-400">
                  <Star className="h-3.5 w-3.5 text-yellow-300" />
                  {rating ? `${rating.toFixed(1)} · ${l._count.reviews} verified review${l._count.reviews === 1 ? "" : "s"}` : "New · no verified reviews yet"}
                </p>
                <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
                  <ShieldCheck className="h-4 w-4 text-[#25D366]" /> Access:{" "}
                  {l.requestedScopes.length
                    ? l.requestedScopes.join(", ")
                    : "No data scopes"}
                </div>
                <Link
                  href={`/marketplace/${l.slug}`}
                  className="mt-5 block rounded-xl bg-[#25D366] px-4 py-2 text-center text-sm font-bold text-black"
                >
                  Review access and install
                </Link>
              </article>
            );
          })}
        </div>
        {!listings.length && (
          <p className="mt-12 text-center text-slate-500">
            No published packages match this search yet.
          </p>
        )}
      </div>
    </main>
  );
}
