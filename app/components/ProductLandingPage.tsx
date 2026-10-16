import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  PLAN_DISPLAY_NAME,
  ROTATOR_LIMITS,
  NUMBERS_PER_ROTATOR_LIMITS,
  SHORT_LINK_LIMITS,
  AD_LINK_LIMITS,
  WIDGET_AVAILABLE,
  REPORTS_TIER,
  type PlanKey,
} from "@/lib/plan-limits";
import { PLAN_PRICES } from "@/lib/billing";

export type PlanHighlight = "rotator" | "adLinks" | "shortLinks" | "widget";

export type ProductLandingSection = { title: string; text: string };
export type ProductLandingQa = { q: string; a: string };
export type ProductLandingCrossLink = { href: string; title: string; text: string };

export type ProductLandingContent = {
  icon: LucideIcon;
  eyebrow: string;
  h1: string;
  h1Highlight: string;
  intro: string;
  toolHref: string;
  toolLabel: string;
  whoFor: ProductLandingSection[];
  steps: ProductLandingSection[];
  benefits: string[];
  highlight: PlanHighlight;
  qa: ProductLandingQa[];
  crossLinks: ProductLandingCrossLink[];
};

const PLAN_ORDER: PlanKey[] = ["free", "basic", "pro", "ultimate"];

function planPrice(plan: PlanKey): string {
  if (plan === "free") return "$0";
  return `$${PLAN_PRICES[plan]}`;
}

function planRow(plan: PlanKey) {
  const reportsTier = REPORTS_TIER[plan];
  const reportsLabel = reportsTier === "none" ? "No reports" : reportsTier === "basic" ? "Basic reports" : "Full reports";
  return {
    plan,
    name: PLAN_DISPLAY_NAME[plan],
    price: planPrice(plan),
    rotators: ROTATOR_LIMITS[plan],
    numbersPerRotator: NUMBERS_PER_ROTATOR_LIMITS[plan],
    shortLinks: SHORT_LINK_LIMITS[plan],
    adLinks: AD_LINK_LIMITS[plan],
    widget: WIDGET_AVAILABLE[plan],
    reports: reportsLabel,
  };
}

export default function ProductLandingPage({ content }: { content: ProductLandingContent }) {
  const { icon: Icon, eyebrow, h1, h1Highlight, intro, toolHref, toolLabel, whoFor, steps, benefits, highlight, qa, crossLinks } = content;
  const rows = PLAN_ORDER.map(planRow);
  const signupHref = `/signup?redirect=${encodeURIComponent(toolHref)}`;

  return (
    <main>
      <section className="hero-bg border-b border-slate-800/70 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#25D366]/30 bg-[#25D366]/15">
            <Icon className="h-7 w-7 text-[#25D366]" />
          </div>
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-[#25D366]">{eyebrow}</p>
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight text-white sm:text-5xl">
            {h1} <span className="gradient-text">{h1Highlight}</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-slate-400 sm:text-lg">{intro}</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={signupHref} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black transition-colors hover:bg-[#1fba58]">
              Start free trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/pricing" className="inline-flex items-center justify-center rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-[#25D366]">
              See plans
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Try it in the <Link href={toolHref} className="text-[#25D366] hover:underline">{toolLabel}</Link> tool.
          </p>
        </div>
      </section>

      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">Who it&apos;s for</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Built for teams that chat on WhatsApp every day</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {whoFor.map((item) => (
              <article key={item.title} className="rounded-2xl border border-slate-800 bg-[#111811] p-6">
                <h3 className="font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-800/70 bg-[#0d110d] px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">How it works</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Three steps to get going</h2>
          </div>
          <ol className="grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-slate-800 bg-[#111811] p-6">
                <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-[#25D366]/10 text-sm font-bold text-[#25D366]">{index + 1}</div>
                <h3 className="font-semibold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">Key benefits</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Why teams use it</h2>
          </div>
          <ul className="grid gap-3 md:grid-cols-2">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 rounded-xl border border-slate-800 bg-[#111811] p-4 text-sm leading-6 text-slate-300">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#25D366]" />
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="border-y border-slate-800/70 bg-[#0d110d] px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">Which plan includes it</p>
            <h2 className="mt-3 text-3xl font-bold text-white">Plan limits at a glance</h2>
            <p className="mt-3 text-sm text-slate-400">New accounts get a 3-day free trial of Solo ($9/month), including 100 routed leads, with no card required.</p>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-slate-800">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-[#111811] text-slate-400">
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Price</th>
                  <th className="px-4 py-3 font-semibold">Rotators</th>
                  <th className="px-4 py-3 font-semibold">Salespeople / rotator</th>
                  <th className="px-4 py-3 font-semibold">Short links</th>
                  <th className="px-4 py-3 font-semibold">Ad links</th>
                  <th className="px-4 py-3 font-semibold">Widget</th>
                  <th className="px-4 py-3 font-semibold">Reports</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.plan} className={`border-b border-slate-800/60 last:border-0 ${row.plan === "basic" ? "bg-[#25D366]/5" : ""}`}>
                    <td className="px-4 py-3 font-semibold text-white">{row.name}</td>
                    <td className="px-4 py-3 text-slate-300">{row.price}/mo</td>
                    <td className={`px-4 py-3 text-slate-300 ${highlight === "rotator" ? "font-semibold text-[#25D366]" : ""}`}>{row.rotators}</td>
                    <td className={`px-4 py-3 text-slate-300 ${highlight === "rotator" ? "font-semibold text-[#25D366]" : ""}`}>{row.numbersPerRotator}</td>
                    <td className={`px-4 py-3 text-slate-300 ${highlight === "shortLinks" ? "font-semibold text-[#25D366]" : ""}`}>{row.shortLinks || "—"}</td>
                    <td className={`px-4 py-3 text-slate-300 ${highlight === "adLinks" ? "font-semibold text-[#25D366]" : ""}`}>{row.adLinks || "—"}</td>
                    <td className={`px-4 py-3 text-slate-300 ${highlight === "widget" ? "font-semibold text-[#25D366]" : ""}`}>{row.widget ? "Yes" : "—"}</td>
                    <td className="px-4 py-3 text-slate-300">{row.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-slate-500">Free includes 25 routed leads lifetime. Paid plans include unlimited routed leads. Location and device tracking is coming soon on Growth and Agency.</p>
        </div>
      </section>

      <section className="px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-4xl">
          <p className="mb-6 text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">Questions</p>
          <div className="space-y-6">
            {qa.map((item) => (
              <div key={item.q}>
                <p className="font-semibold text-white">{item.q}</p>
                <p className="mt-1.5 text-sm leading-6 text-slate-400">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-slate-800/70 px-4 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 text-center text-2xl font-bold text-white">Related tools</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {crossLinks.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-2xl border border-slate-800 bg-[#111811] p-5 transition-colors hover:border-[#25D366]/50">
                <h3 className="font-semibold text-white">{link.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">{link.text}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-20">
        <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-[#25D366]/30 bg-gradient-to-br from-[#25D366]/15 to-[#0d1a0d] p-7 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">Ready to try it?</p>
              <h2 className="mt-3 text-3xl font-bold text-white">Start free. Add structure when the volume arrives.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-400">No card required for the 3-day Solo trial. Wazap does not read WhatsApp messages and is not affiliated with WhatsApp or Meta.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
              <Link href={signupHref} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black hover:bg-[#1fba58]">
                Start free trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pricing" className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-600 px-6 py-3 text-sm font-semibold text-white hover:border-[#25D366]">
                See plans
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
