import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { growthArticles, growthPath } from "@/lib/growth-content";
import { Container, Section } from "../ui/marketing/Section";

const featured = [{ slug: "real-estate", title: "Real estate teams", type: "USE CASE" }, { slug: "agencies", title: "Marketing agencies", type: "USE CASE" }, { slug: "whatsapp-round-robin-routing", title: "Routing, explained", type: "QUICK GUIDE" }, { slug: "whatsapp-campaign-tracking", title: "Track your campaigns", type: "MEASUREMENT" }];

export default function GrowthResources() {
  return (
    <Section aria-labelledby="guide-preview-heading" className="ds-light border-t border-border bg-bg py-16 sm:py-20">
      <Container>
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="eyebrow">THE WAZAP GUIDE</p><h2 id="guide-preview-heading" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Built for your workflow.</h2></div>
          <Link className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent hover:underline" href="/resources">View all guides <ArrowUpRight size={17} aria-hidden /></Link>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          {featured.map((item, index) => {
            const article = growthArticles.find((a) => a.slug === item.slug);
            if (!article) return null;
            return (
              <Link key={item.slug} href={growthPath(article)} aria-label={article.title} className="surface-card group flex items-center gap-5 rounded-2xl p-6">
                <span className="text-sm font-semibold text-muted tabular">0{index + 1}</span>
                <div><small className="mb-1.5 block text-[10px] font-semibold tracking-widest text-muted">{item.type}</small><h3 className="text-lg font-semibold text-text">{item.title}</h3></div>
                <ArrowUpRight size={20} className="ms-auto shrink-0 text-accent transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-scale-x-100" aria-hidden />
              </Link>
            );
          })}
        </div>
      </Container>
    </Section>
  );
}
