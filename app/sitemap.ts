import { MetadataRoute } from "next";
import { growthArticles, growthPath } from "@/lib/growth-content";
import { SITE_LANGUAGES, siteHreflang } from "@/lib/site-languages";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const BASE = "https://wazap.lt";
const UPDATED = "2026-08-03";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const listings = await prisma.marketplaceListing.findMany({
    where: { status: "published", pricingModel: "free" },
    select: { slug: true, updatedAt: true },
  });
  const languageAlternates = Object.fromEntries(SITE_LANGUAGES.map(language => [siteHreflang(language), `${BASE}/languages/${language}`]));
  return [
    { url: `${BASE}/languages`, lastModified: "2026-10-08", changeFrequency: "monthly", priority: 0.6 },
    ...SITE_LANGUAGES.map(language => ({ url: `${BASE}/languages/${language}`, lastModified: "2026-10-08", changeFrequency: "monthly" as const, priority: 0.7, alternates: { languages: { ...languageAlternates, "x-default": `${BASE}/languages/en` } } })),
    { url: `${BASE}/resources`, lastModified: "2026-10-07", changeFrequency: "monthly", priority: 0.8 },
    ...growthArticles.map(article => ({ url: `${BASE}${growthPath(article)}`, lastModified: article.reviewedAt ?? "2026-10-07", changeFrequency: "monthly" as const, priority: 0.75 })),
    { url: BASE, lastModified: "2026-10-09", changeFrequency: "weekly", priority: 1.0 },
    { url: `${BASE}/flow`, lastModified: "2026-08-14", changeFrequency: "weekly", priority: 0.95 },
    { url: `${BASE}/tools`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/qr`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/pricing`, lastModified: "2026-10-07", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/integrations`, lastModified: UPDATED, changeFrequency: "monthly", priority: 0.75 },
    { url: `${BASE}/api-policy`, lastModified: UPDATED, changeFrequency: "monthly", priority: 0.55 },
    { url: `${BASE}/partner-terms`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/whatsapp-business-platform`, lastModified: UPDATED, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/whatsapp-team-inbox`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/whatsapp-crm`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/whatsapp-ai-agent`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/marketplace`, lastModified: UPDATED, changeFrequency: "weekly", priority: 0.75 },
    { url: `${BASE}/shopify`, lastModified: UPDATED, changeFrequency: "weekly", priority: 0.8 },
    ...listings.map((listing) => ({ url: `${BASE}/marketplace/${listing.slug}`, lastModified: listing.updatedAt, changeFrequency: "weekly" as const, priority: 0.7 })),
    { url: `${BASE}/tools/widget`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/bulk`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/tools/checker`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/ad-builder`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/vcard`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/linktree`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/rotator`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/transcript`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/tools/link`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/templates`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/shortlink`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/catalog`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/tools/formatter`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE}/tools/follow-up`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/tools/chat-insights`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE}/tools/reply-generator`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE}/tools/message-scheduler`, lastModified: "2026-10-10", changeFrequency: "weekly", priority: 0.85 },
    { url: `${BASE}/about`, lastModified: "2026-10-07", changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/faq`, lastModified: "2026-10-07", changeFrequency: "monthly", priority: 0.65 },
    { url: `${BASE}/contact`, lastModified: "2026-10-10", changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/support`, lastModified: UPDATED, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/privacy`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/refund`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/cookie`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/acceptable-use`, lastModified: UPDATED, changeFrequency: "yearly", priority: 0.3 },
  ];
}
