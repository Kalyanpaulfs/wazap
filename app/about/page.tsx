import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  LifeBuoy,
  LockKeyhole,
  MessageCircle,
  Route,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";

export const metadata: Metadata = {
  title: "About Wazap — WhatsApp Business Workflow Software",
  description:
    "Learn how Wazap helps businesses create WhatsApp links, QR codes, lead-routing workflows and follow-ups.",
  alternates: { canonical: "https://wazap.lt/about" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "About Wazap — WhatsApp Business Workflow Software",
    description:
      "Practical WhatsApp workflow software for links, QR codes, lead routing and follow-ups.",
    url: "https://wazap.lt/about",
    type: "website",
  },
};

const aboutJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Wazap",
  url: "https://wazap.lt",
  logo: "https://wazap.lt/icon-512.png",
  email: "hello@wazap.lt",
  description:
    "Wazap builds WhatsApp productivity software for links, QR codes, lead routing and follow-ups.",
  sameAs: [],
};

const capabilities = [
  { icon: MessageCircle, title: "Start conversations", body: "Create click-to-chat links, QR codes and website widgets that make it easier for customers to reach the right WhatsApp number." },
  { icon: Route, title: "Route leads", body: "Distribute click-to-chat handoffs across configured WhatsApp numbers with link rotators and campaign links. Routing activity is separate from message delivery or agent availability." },
  { icon: Workflow, title: "Work the pipeline", body: "Track lead source, value, follow-up dates and outcomes instead of losing warm conversations in a busy inbox." },
  { icon: BarChart3, title: "Measure results", body: "Understand campaign activity, routing outcomes and buyer intent with reporting designed around business decisions." },
  { icon: Sparkles, title: "Create faster", body: "Build click-to-chat links, QR codes and reusable WhatsApp assets without installing extra software." },
];

const principles = [
  { icon: LockKeyhole, title: "Privacy by design", body: "Link routing does not read WhatsApp message content. Account, usage and billing records are handled as described in our privacy policy." },
  { icon: ShieldCheck, title: "Reliable by default", body: "Routing uses configured destinations and cached configuration to help keep public links useful. A handoff does not confirm that an agent is online or that the customer sends a message." },
  { icon: CheckCircle2, title: "Clear software value", body: "Paid plans purchase Wazap software access, higher limits and business controls. We do not offer commissions, referral payouts or earning schemes." },
];

export default function AboutPage() {
  return (
    <>
      <script id="wazap-about-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }} />

      <main>
        <section className="hero-bg border-b border-slate-800/70 px-4 py-16 sm:py-24">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#25D366]/30 bg-[#25D366]/15">
              <MessageCircle className="h-7 w-7 text-[#25D366]" />
            </div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#25D366]">About Wazap</p>
            <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-tight text-white sm:text-6xl">
              Turn WhatsApp interest into an <span className="gradient-text">accountable workflow</span>
            </h1>
            <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-slate-400 sm:text-lg">
              Wazap is business productivity software for teams that sell and support through WhatsApp. It brings links, QR codes, lead routing, follow-ups and reporting into one focused platform.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-[#1fba58]">
                Start free <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/tools" className="inline-flex items-center justify-center rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-[#25D366]">
                Explore the tools
              </Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20">
          <div className="mx-auto grid max-w-5xl gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">Why we built it</p>
              <h2 className="mt-3 text-3xl font-bold text-white">WhatsApp is where the customer replies. The workflow around it is usually fragmented.</h2>
            </div>
            <div className="space-y-5 text-base leading-8 text-slate-400">
              <p>Businesses often rely on separate QR generators, spreadsheets, short-link services, inbox notes and manual lead assignment. That makes simple work harder to measure and easy to lose.</p>
              <p>Wazap replaces that patchwork with one workspace. You can start with practical free tools and add campaign capacity, managed routing and stronger operational controls as you grow.</p>
              <p>Our aim is straightforward: the intelligent layer can evolve, but the customer&apos;s path to a valid WhatsApp conversation should stay simple and dependable.</p>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-800/70 bg-[#0d110d] px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">What Wazap helps you do</p>
              <h2 className="mt-3 text-3xl font-bold text-white">One platform for the work around the conversation</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, body }) => (
                <article key={title} className="rounded-2xl border border-slate-800 bg-[#111811] p-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#25D366]/10">
                    <Icon className="h-5 w-5 text-[#25D366]" />
                  </div>
                  <h3 className="font-bold text-white">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-500">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-16 sm:py-20">
          <div className="mx-auto max-w-5xl">
            <div className="grid gap-4 lg:grid-cols-3">
              {principles.map(({ icon: Icon, title, body }) => (
                <article key={title} className="rounded-2xl border border-slate-800 bg-[#111811] p-6">
                  <Icon className="mb-4 h-6 w-6 text-[#25D366]" />
                  <h2 className="text-lg font-bold text-white">{title}</h2>
                  <p className="mt-2 text-sm leading-7 text-slate-400">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 pb-20">
          <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-[#25D366]/30 bg-gradient-to-br from-[#25D366]/15 to-[#0d1a0d] p-7 sm:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">Built to grow with you</p>
                <h2 className="mt-3 text-3xl font-bold text-white">Start with free tools. Add structure when the volume arrives.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">Every new account gets a 3-day free trial with everything in Solo — unlimited routed leads while the trial lasts. Public paid plans are Solo ($9/month), Growth ($19/month) and Agency ($49/month). After the trial, choose a plan to keep your links routing leads.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link href="/pricing" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black hover:bg-[#1fba58]">
                  Compare plans <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/contact" className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-600 px-6 py-3 text-sm font-semibold text-white hover:border-[#25D366]">
                  <LifeBuoy className="h-4 w-4" /> Contact Wazap
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-800/70 px-4 py-10">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <p>Wazap.lt · Support: <a href="mailto:hello@wazap.lt" className="text-[#25D366] hover:underline">hello@wazap.lt</a></p>
            <div className="flex flex-wrap gap-4">
              <Link href="/privacy" className="hover:text-white">Privacy</Link>
              <Link href="/terms" className="hover:text-white">Terms</Link>
              <Link href="/refund" className="hover:text-white">Refunds</Link>
              <Link href="/acceptable-use" className="hover:text-white">Acceptable use</Link>
            </div>
            <p className="sm:text-right">Not affiliated with WhatsApp or Meta.</p>
          </div>
        </section>
      </main>
    </>
  );
}
