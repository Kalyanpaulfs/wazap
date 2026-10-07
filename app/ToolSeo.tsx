import { publicOffers } from "@/lib/marketing-offer";
import { TOOL_SEO } from "@/lib/tool-seo";

// Visible answers and matching structured data. Rich-result display is not guaranteed.
export default function ToolSeo({ k }: { k: string }) {
  const d = TOOL_SEO[k];
  if (!d) return null;
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: d.faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  const appLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: d.name,
    url: `https://wazap.lt${d.href}`,
    description: d.appDesc,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: k === "rotator" ? publicOffers : { "@type": "Offer", price: "0", priceCurrency: "USD" },
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
  return (
    <section className="border-t border-slate-800/60 px-4 py-14">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(appLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <div className="mx-auto max-w-3xl">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">Frequently asked questions</h2>
        <div className="space-y-3">
          {d.faqs.map((f) => (
            <div key={f.q} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <h3 className="font-semibold text-white mb-1.5">{f.q}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{f.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
