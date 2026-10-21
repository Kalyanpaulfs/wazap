import { publicOffers } from "@/lib/marketing-offer";
import Link from "next/link";
import { TOOL_GUIDES } from "@/lib/tool-guides";
import { TOOL_SEO } from "@/lib/tool-seo";
import ToolGuideSection from "@/app/components/ToolGuideSection";

// Per-tool setup guide and matching structured data. Rich-result display is not guaranteed.
export default function ToolSeo({ k, children }: { k: string; children?: React.ReactNode }) {
  const d = TOOL_SEO[k];
  if (!d) return null;
  const guide = TOOL_GUIDES[k];
  const appLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: d.name,
    url: `https://wazap.lt${d.href}`,
    description: d.appDesc,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: ["link", "qr", "formatter"].includes(k) ? { "@type": "Offer", price: "0", priceCurrency: "USD" } : publicOffers,
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Wazap", item: "https://wazap.lt" },
      { "@type": "ListItem", position: 2, name: "WhatsApp Business Tools", item: "https://wazap.lt/tools" },
      { "@type": "ListItem", position: 3, name: d.name, item: `https://wazap.lt${d.href}` },
    ],
  };
  const ld = <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
  </>;
  // Nothing to explain (e.g. the text formatter): keep the search data, skip the empty "How it works" box.
  if (!guide && !children) return ld;
  return (
    <section className="border-t border-border py-10">
      {ld}
      <ToolGuideSection>
        {children}
        {guide && <div className="mb-12">
          <h2 className="text-2xl font-bold text-text">{guide.title}</h2>
          <ol className="mt-5 space-y-3">
            {guide.steps.map((step, i) => <li key={step} className="flex gap-3 rounded-2xl border border-border bg-surface p-5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent">{i + 1}</span>
              <p className="text-sm leading-6 text-muted">{step}</p>
            </li>)}
          </ol>
          <p className="mt-5 text-sm leading-6 text-muted">{guide.note}</p>
          <nav aria-label="Related WhatsApp tools" className="mt-5 flex flex-wrap gap-2">
            {guide.related.map(key => { const tool = TOOL_SEO[key]; return tool ? <Link key={key} href={tool.href} className="inline-flex min-h-11 items-center rounded-full border border-border-strong px-4 py-2 text-sm text-accent hover:border-accent">{tool.name}</Link> : null; })}
          </nav>
        </div>}
      </ToolGuideSection>
    </section>
  );
}
