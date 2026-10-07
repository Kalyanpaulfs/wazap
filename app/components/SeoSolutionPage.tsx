import LandingVisual from "./LandingVisual";
import Link from "next/link";
import { publicOffers } from "@/lib/marketing-offer";
import { ArrowRight, CheckCircle2, MessageCircle, ShieldCheck } from "lucide-react";

type Feature = { title: string; body: string };
type Question = { question: string; answer: string };

export default function SeoSolutionPage({
  eyebrow,
  title,
  intro,
  outcome,
  features,
  steps,
  questions,
  schemaName,
  canonical,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  outcome: string;
  features: Feature[];
  steps: string[];
  questions: Question[];
  schemaName: string;
  canonical: string;
}) {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: schemaName,
      url: canonical,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: intro,
      provider: { "@type": "Organization", name: "Wazap", url: "https://wazap.lt" },
      offers: publicOffers,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: questions.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ];

  return (
    <main className="hero-bg min-h-screen px-4 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="mx-auto max-w-6xl">
        <section className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-bold uppercase tracking-[.24em] text-[#25D366]">{eyebrow}</p>
          <h1 className="mt-5 text-4xl font-black leading-tight text-white sm:text-6xl">{title}</h1>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-slate-400">{intro}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-7 py-3 font-bold text-black">
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className="rounded-full border border-slate-700 px-7 py-3 font-semibold text-white">Compare plans</Link>
          </div>
          <p className="mt-4 text-xs text-slate-500">14-day Growth workspace trial · Separate 25-handoff router allowance · No card required</p>
        </section>

        <LandingVisual scene={canonical.endsWith("/whatsapp-crm") ? "crm" : canonical.endsWith("/whatsapp-team-inbox") ? "inbox" : "ai"} />
        <section className="mt-16 grid gap-4 md:grid-cols-3">
          {features.map((feature) => (
            <article key={feature.title} className="rounded-2xl border border-slate-800 bg-[#111811] p-6">
              <MessageCircle className="h-6 w-6 text-[#25D366]" />
              <h2 className="mt-4 text-xl font-bold text-white">{feature.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{feature.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-8 grid gap-6 rounded-3xl border border-[#25D366]/20 bg-[#25D366]/5 p-7 lg:grid-cols-2 lg:p-10">
          <div>
            <ShieldCheck className="h-7 w-7 text-[#25D366]" />
            <h2 className="mt-4 text-3xl font-bold text-white">Built for responsible business workflows</h2>
            <p className="mt-3 leading-7 text-slate-400">{outcome}</p>
          </div>
          <ol className="space-y-3">
            {steps.map((step, index) => (
              <li key={step} className="flex gap-3 rounded-xl bg-black/25 p-4 text-sm text-slate-300">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-xs font-black text-black">{index + 1}</span>
                {step}
              </li>
            ))}
          </ol>
        </section>

        <section className="mx-auto mt-16 max-w-4xl">
          <h2 className="text-center text-3xl font-bold text-white">Frequently asked questions</h2>
          <div className="mt-7 space-y-3">
            {questions.map((item) => (
              <article key={item.question} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
                <h3 className="flex items-start gap-2 font-bold text-white"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#25D366]" />{item.question}</h3>
                <p className="mt-2 pl-6 text-sm leading-6 text-slate-400">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-3xl border border-slate-800 bg-[#111811] p-8 text-center">
          <h2 className="text-3xl font-black text-white">Turn WhatsApp conversations into an accountable workflow.</h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">Start with free tools, then bring your team, leads and customer follow-ups into one Wazap workspace.</p>
          <Link href="/signup" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#25D366] px-7 py-3 font-bold text-black">Create my workspace <ArrowRight className="h-4 w-4" /></Link>
        </section>
      </div>
    </main>
  );
}
