import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";
import Link from "next/link";
import { publicOffers, routingOfferText, workspaceTrialText, routerPrivacyText } from "@/lib/marketing-offer";

export const metadata: Metadata = {
  title: "WhatsApp Link Rotator — Round-Robin Lead Routing",
  description: "Distribute leads evenly across multiple WhatsApp numbers with one round-robin link. Add your team, create the rotator and start routing instantly.",
  keywords: ["whatsapp link rotator", "whatsapp round robin leads", "distribute whatsapp leads", "whatsapp sales team tool", "whatsapp agent rotation", "lead distribution whatsapp"],
  alternates: { canonical: "https://wazap.lt/tools/rotator" },
  robots: { index: true, follow: true },
  openGraph: { title: "WhatsApp Link Rotator — Distribute Leads Evenly — Wazap", description: "One link, automatic round-robin rotation across your WhatsApp team. Handoffs rotate across configured WhatsApp numbers; agent availability is not checked.", url: "https://wazap.lt/tools/rotator" },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication",
  name: "WhatsApp Link Rotator", applicationCategory: "BusinessApplication",
  url: "https://wazap.lt/tools/rotator", operatingSystem: "Web",
  description: "Automatically rotate WhatsApp links across multiple agents in round-robin order.",
  offers: publicOffers,
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />{children}<section className="mx-auto max-w-4xl px-4 py-10 text-sm leading-7 text-slate-400"><h2 className="text-xl font-bold text-white">Know what your routing link measures</h2><p className="mt-3">{routingOfferText}</p><p className="mt-2">{workspaceTrialText}</p><p className="mt-2">{routerPrivacyText}</p><p className="mt-4"><Link href="/guides/whatsapp-round-robin-routing" className="text-[#25D366] underline">Read the routing guide</Link> · <Link href="/resources" className="text-[#25D366] underline">Browse setup guides and comparisons</Link></p></section><ToolSeo k="rotator" /></>;
}
