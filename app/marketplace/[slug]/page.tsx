import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Bot, ExternalLink, ShieldCheck, Star } from "lucide-react";
import { prisma } from "@/lib/prisma";

async function listing(slug: string) {
  return prisma.marketplaceListing.findFirst({
    where: { slug, status: "published", pricingModel: "free" },
    include: {
      publisher: { select: { displayName: true, isOfficial: true, website: true } },
      versions: { where: { status: "published" }, orderBy: { createdAt: "desc" }, take: 1 },
      reviews: {
        where: { status: "published" },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, rating: true, title: true, body: true, updatedAt: true },
      },
      _count: { select: { reviews: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = await listing(slug);
  if (!item) return { title: "Marketplace package not found", robots: { index: false, follow: false } };
  const url = `https://wazap.lt/marketplace/${item.slug}`;
  const description = item.summary.length >= 80
    ? item.summary
    : `${item.summary} Install this reviewed Wazap workflow with declared access, versioning, and workspace approval.`;
  return {
    title: `${item.name} — Wazap Marketplace`,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: item.name, description },
  };
}

export default async function MarketplaceListingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await listing(slug);
  if (!item || !item.versions[0]) notFound();
  const version = item.versions[0];
  const rating = item.reviews.length
    ? item.reviews.reduce((sum, review) => sum + review.rating, 0) / item.reviews.length
    : null;
  const manifest = version.manifest as { launchUrl?: string; roleType?: string };
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: item.name,
    description: item.description,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    softwareVersion: version.version,
    url: `https://wazap.lt/marketplace/${item.slug}`,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Organization", name: item.publisher.displayName },
    ...(rating ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating.toFixed(1), reviewCount: item._count.reviews } } : {}),
  };
  return (
    <main className="hero-bg min-h-screen px-4 py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <article className="mx-auto max-w-3xl rounded-3xl border border-slate-800 bg-[#111811] p-6 sm:p-8">
        <Link href="/marketplace" className="text-sm font-semibold text-[#25D366]">← Marketplace</Link>
        <div className="mt-6 flex items-start justify-between gap-4">
          <Bot className="h-10 w-10 text-[#25D366]" />
          {item.publisher.isOfficial && <span className="flex items-center gap-1 text-sm text-[#25D366]"><BadgeCheck className="h-4 w-4" /> Official Wazap package</span>}
        </div>
        <h1 className="mt-5 text-3xl font-bold text-white sm:text-4xl">{item.name}</h1>
        <p className="mt-3 text-lg text-slate-300">{item.summary}</p>
        <p className="mt-5 whitespace-pre-wrap leading-7 text-slate-400">{item.description}</p>
        <dl className="mt-7 grid gap-3 rounded-2xl bg-slate-950 p-5 sm:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Publisher</dt><dd className="mt-1 font-semibold text-white">{item.publisher.displayName}</dd></div>
          <div><dt className="text-xs text-slate-500">Version</dt><dd className="mt-1 font-semibold text-white">{version.version}</dd></div>
          <div><dt className="text-xs text-slate-500">Package type</dt><dd className="mt-1 font-semibold capitalize text-white">{item.packageType.replaceAll("_", " ")}</dd></div>
          <div><dt className="text-xs text-slate-500">Price</dt><dd className="mt-1 font-semibold text-[#25D366]">Free</dd></div>
          <div><dt className="text-xs text-slate-500">Installs</dt><dd className="mt-1 font-semibold text-white">{item.installCount}</dd></div>
          <div><dt className="text-xs text-slate-500">Verified reviews</dt><dd className="mt-1 font-semibold text-white">{rating ? `${rating.toFixed(1)} / 5 · ${item._count.reviews}` : "New package"}</dd></div>
        </dl>
        <section className="mt-6 rounded-2xl border border-[#25D366]/20 bg-[#25D366]/5 p-5">
          <h2 className="flex items-center gap-2 font-bold text-white"><ShieldCheck className="h-5 w-5 text-[#25D366]" /> Requested workspace access</h2>
          <p className="mt-2 text-sm text-slate-400">{item.requestedScopes.length ? item.requestedScopes.join(", ") : "No workspace data scopes"}</p>
          <p className="mt-3 text-sm text-slate-400">Installation requires an owner or workspace administrator. AI agents are created paused in draft-only mode and cannot automatically send messages.</p>
        </section>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href={`/marketplace/manage?install=${item.id}`} className="rounded-full bg-[#25D366] px-6 py-3 font-bold text-black">Review access and install</Link>
          {item.packageType === "external_tool" && manifest.launchUrl && <a href={manifest.launchUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-6 py-3 text-white">Publisher website <ExternalLink className="h-4 w-4" /></a>}
        </div>
        <section className="mt-8 border-t border-slate-800 pt-7">
          <h2 className="flex items-center gap-2 text-xl font-bold text-white"><Star className="h-5 w-5 text-yellow-300" /> Verified-install reviews</h2>
          <p className="mt-2 text-sm text-slate-500">Only workspaces that safely tested an installed package can publish a review.</p>
          <div className="mt-4 space-y-3">
            {item.reviews.map((review) => (
              <article key={review.id} className="rounded-xl bg-slate-950 p-4">
                <p className="text-sm text-yellow-300">{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</p>
                {review.title && <h3 className="mt-2 font-semibold text-white">{review.title}</h3>}
                {review.body && <p className="mt-1 text-sm leading-6 text-slate-400">{review.body}</p>}
                <p className="mt-2 text-xs text-slate-600">Verified install · {review.updatedAt.toLocaleDateString("en-GB")}</p>
              </article>
            ))}
            {!item.reviews.length && <p className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-500">No verified reviews yet.</p>}
          </div>
        </section>
      </article>
    </main>
  );
}
