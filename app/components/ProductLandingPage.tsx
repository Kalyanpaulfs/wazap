import Link from "next/link";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import {
  PLAN_DISPLAY_NAME,
  LINK_LIMITS,
  NUMBERS_PER_ROTATOR_LIMITS,
  AD_LINKS_AVAILABLE,
  WIDGET_AVAILABLE,
  REPORTS_TIER,
  type PlanKey,
} from "@/lib/plan-limits";
import { PLAN_PRICES } from "@/lib/billing";
import { ButtonLink, Card, cx } from "../ui";
import { Container, Section, SectionHeader } from "../ui/marketing/Section";
import { ScrollReveal } from "../ui/marketing/ScrollReveal";

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
  /** Optional hero illustration (generated art in public/art/products). */
  art?: { src: string; alt: string };
};

const PLAN_ORDER: PlanKey[] = ["free", "basic", "pro", "ultimate"];

function planPrice(plan: PlanKey): string {
  if (plan === "free") return "$0";
  return `$${PLAN_PRICES[plan]}`;
}

// The "free" column represents the 3-day Free trial every new account gets,
// not a standing free plan (owner rule: never show "Free" as a plan name).
// The trial is exactly Solo's limits plus 100 routed leads, so it
// borrows Solo's numbers here rather than reading the free=0 entitlement
// columns (which describe the POST-trial/no-trial "everything stopped"
// state, not what a prospect sees when they sign up).
function planRow(plan: PlanKey) {
  const limitsPlan = plan === "free" ? "basic" : plan;
  const reportsTier = REPORTS_TIER[limitsPlan];
  const reportsLabel = reportsTier === "none" ? "No reports" : reportsTier === "basic" ? "Basic reports" : "Full reports";
  return {
    plan,
    name: plan === "free" ? "Free trial" : PLAN_DISPLAY_NAME[plan],
    price: planPrice(plan),
    links: LINK_LIMITS[limitsPlan],
    numbersPerRotator: NUMBERS_PER_ROTATOR_LIMITS[limitsPlan],
    adLinks: AD_LINKS_AVAILABLE[limitsPlan],
    widget: WIDGET_AVAILABLE[limitsPlan],
    reports: reportsLabel,
  };
}

export default function ProductLandingPage({ content }: { content: ProductLandingContent }) {
  const { icon: Icon, eyebrow, h1, h1Highlight, intro, toolHref, toolLabel, whoFor, steps, benefits, highlight, qa, crossLinks, art } = content;
  const rows = PLAN_ORDER.map(planRow);
  const signupHref = `/signup?redirect=${encodeURIComponent(toolHref)}`;
  const hl = (on: boolean) => (on ? "font-semibold text-accent" : "text-muted");

  return (
    <main className="ds-light bg-bg text-text">
      <ScrollReveal />
      <section className="relative overflow-hidden border-b border-border py-16 sm:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[460px]" style={{ background: "var(--grad-hero)" }} />
        <Container className={cx("relative grid items-center gap-12", art ? "lg:grid-cols-[1.1fr_1fr]" : "")}>
          <div className={art ? "" : "mx-auto max-w-4xl text-center"}>
            <div className={cx("mb-6 flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent", !art && "mx-auto")}>
              <Icon className="size-7" aria-hidden />
            </div>
            <p className="eyebrow">{eyebrow}</p>
            <h1 className={cx("mt-4 text-4xl font-bold leading-[1.08] tracking-tight text-text sm:text-5xl", !art && "mx-auto max-w-3xl")}>
              {h1} <span className="text-gradient-brand">{h1Highlight}</span>
            </h1>
            <p className={cx("mt-6 max-w-2xl text-lg leading-8 text-muted", !art && "mx-auto")}>{intro}</p>
            <div className={cx("mt-8 flex flex-col gap-3 sm:flex-row", !art && "justify-center")}>
              <ButtonLink href={signupHref} size="lg">Start free trial <ArrowRight className="size-4" aria-hidden /></ButtonLink>
              <ButtonLink href="/pricing" variant="outline" size="lg">See plans</ButtonLink>
            </div>
            <p className="mt-4 text-sm text-muted">
              Try it in the <Link href={toolHref} className="font-medium text-accent hover:underline">{toolLabel}</Link> tool.
            </p>
          </div>
          {art && (
            <div className="relative mx-auto w-full max-w-xl">
              <div aria-hidden className="absolute inset-8 rounded-full bg-jade-bright/15 blur-3xl" />
              <Image src={art.src} alt={art.alt} width={1536} height={1024} priority sizes="(max-width: 1024px) 92vw, 540px" className="float-soft relative w-full mix-blend-multiply [mask-image:radial-gradient(closest-side,#000_74%,transparent_100%)]" />
            </div>
          )}
        </Container>
      </section>

      <Section>
        <Container>
          <SectionHeader eyebrow="Who it's for" title="Built for teams that chat on WhatsApp every day" />
          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {whoFor.map((item) => (
              <Card as="article" key={item.title} data-animate>
                <h3 className="font-bold text-text">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{item.text}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="surface">
        <Container>
          <SectionHeader eyebrow="How it works" title="Three steps to get going" />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-3xl border border-border bg-bg p-6" data-animate>
                <div className="mb-4 flex size-10 items-center justify-center rounded-full bg-accent text-sm font-bold text-on-accent shadow-accent">{index + 1}</div>
                <h3 className="font-semibold text-text">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </Section>

      <Section>
        <Container>
          <SectionHeader eyebrow="Key benefits" title="Why teams use it" />
          <ul className="mt-12 grid gap-3 md:grid-cols-2">
            {benefits.map((benefit) => (
              <li key={benefit} className="surface-card flex items-start gap-3 rounded-2xl p-4 text-sm leading-6 text-text" data-animate>
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                {benefit}
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      <Section tone="surface">
        <Container>
          <SectionHeader eyebrow="Which plan includes it" title="Plan limits at a glance">New accounts get a 3-day free trial with everything in Solo ($9/month), including 100 routed leads, with no card required.</SectionHeader>
          <div className="mt-10 overflow-x-auto rounded-3xl border border-border bg-bg" data-animate>
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-2 text-muted">
                  {["Plan", "Price", "Links", "Salespeople / rotator", "Ad links", "Website button", "Reports"].map((h) => <th key={h} className="px-4 py-3 text-start font-semibold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.plan} className={cx("border-b border-border last:border-0", row.plan === "basic" && "bg-accent-soft/50")}>
                    <td className="px-4 py-3 font-semibold text-text">{row.name}</td>
                    <td className="px-4 py-3 text-muted">{row.price}/mo</td>
                    <td className={cx("px-4 py-3", hl(highlight === "rotator" || highlight === "shortLinks"))}>{row.links}</td>
                    <td className={cx("px-4 py-3", hl(highlight === "rotator"))}>{row.numbersPerRotator}</td>
                    <td className={cx("px-4 py-3", hl(highlight === "adLinks"))}>{row.adLinks ? "Yes" : "—"}</td>
                    <td className={cx("px-4 py-3", hl(highlight === "widget"))}>{row.widget ? "Yes" : "—"}</td>
                    <td className="px-4 py-3 text-muted">{row.reports}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-muted">New accounts get a 3-day free trial with 100 routed leads. After the trial, a paid plan is required to keep routing. Location and device tracking is coming soon on Growth and Agency.</p>
        </Container>
      </Section>

      <Section>
        <Container className="max-w-4xl">
          <p className="eyebrow mb-8">Questions</p>
          <div className="space-y-3">
            {qa.map((item) => (
              <details key={item.q} className="group surface-card rounded-2xl px-6 py-1 open:shadow-raise" data-animate>
                <summary className="flex min-h-14 list-none items-center justify-between gap-4 py-3 font-semibold text-text [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span aria-hidden className="shrink-0 text-xl text-accent transition-transform duration-200 group-open:rotate-45">+</span>
                </summary>
                <p className="pb-5 text-sm leading-7 text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="surface" className="py-16 sm:py-20">
        <Container>
          <h2 className="mb-8 text-center text-2xl font-bold text-text">Related tools</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {crossLinks.map((link) => (
              <Link key={link.href} href={link.href} className="surface-card block rounded-2xl bg-bg p-5" data-animate>
                <h3 className="font-semibold text-text">{link.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{link.text}</p>
              </Link>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pb-20 pt-16 sm:pt-20">
        <Container>
          <div className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-12 text-white shadow-float sm:px-12" data-animate>
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_90%_at_85%_120%,rgb(15_169_104/0.5),transparent_70%)]" />
            <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-[11px] font-semibold tracking-[0.15em] text-white/70 uppercase">Ready to try it?</p>
                <h2 className="mt-3 text-3xl font-bold tracking-tight">Start free. Add structure when the volume arrives.</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/70">No card required for the 3-day free trial. Wazap does not read WhatsApp messages and is not affiliated with WhatsApp or Meta.</p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <ButtonLink href={signupHref} variant="inverse" size="lg">Start free trial <ArrowRight className="size-4" aria-hidden /></ButtonLink>
                <ButtonLink href="/pricing" variant="inverseOutline" size="lg">See plans</ButtonLink>
              </div>
            </div>
          </div>
        </Container>
      </Section>
    </main>
  );
}
