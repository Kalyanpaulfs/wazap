"use client";

import { useState } from "react";
import Link from "next/link";
import ThemedImage from "../ui/ThemedImage";
import { ArrowRight, ArrowUpRight, BarChart3, Check, Globe2, Link2, MessageCircle, MousePointer2, Plus, QrCode, ShieldCheck, Shuffle, Users, Zap } from "lucide-react";
import { landingFaqs } from "@/lib/landing-faq";
import { Avatar, ButtonLink, Card, buttonClasses, cx } from "../ui";
import { nextTabIndex } from "../ui";
import { Container, Section, SectionHeader } from "../ui/marketing/Section";
import { HeadlineReveal } from "../ui/marketing/HeadlineReveal";
import { Marquee } from "../ui/marketing/Marquee";
import { ScrollReveal } from "../ui/marketing/ScrollReveal";
import { HeroParallax } from "../ui/marketing/HeroParallax";

const agents = ["Alex", "Sam", "Jordan"];
const industries = [
  { name: "Real estate", title: "More enquiries. A fairer split.", text: "Use one WhatsApp link across property campaigns and give every agent a turn at the next enquiry.", channels: ["Property portals", "Meta ads", "Listing QR codes"] },
  { name: "Agencies", title: "One destination for every campaign.", text: "Send campaign traffic to your client’s team with one routing link, then see where each handoff went.", channels: ["Paid campaigns", "Client websites", "Social profiles"] },
  { name: "Appointments", title: "Connect enquiries to your team.", text: "Share one link for your clinic, showroom, or admissions team and distribute incoming clicks across your staff.", channels: ["Google Ads", "Website enquiries", "Reception QR codes"] },
];
const marqueeItems = ["One campaign link", "Fair lead distribution", "Your existing numbers", "Handoff visibility", "Private conversations", "Built for your team"]
  .map((text, i) => ({ text, icon: i % 2 ? <Shuffle size={15} /> : <Link2 size={15} /> }));
const capabilities = [[Shuffle, "Round-robin routing"], [BarChart3, "Handoff tracking"], [Link2, "One shareable link"], [ShieldCheck, "Private by design"]] as const;
const steps = [
  { icon: Users, title: "Add your team", text: "Add the WhatsApp numbers that should receive your enquiries." },
  { icon: Link2, title: "Share one link", text: "Put your routing link in ads, social bios, landing pages, or QR codes." },
  { icon: Shuffle, title: "Let leads take turns", text: "Each click opens WhatsApp with the next team member in your rotation." },
];
const features = [
  { tag: "01 / CONNECT", title: <>Every channel.<br />One destination.</>, text: "Put your routing link in ads, social profiles, landing pages, or QR codes. Keep the same link when your team changes.", points: ["One shareable team link", "Your existing WhatsApp numbers"], link: "/tools/rotator", cta: "Create your team link", art: "/art/home/feature-connect.webp", alt: "Ads, a website and a QR code converging into one routing link" },
  { tag: "02 / DISTRIBUTE", title: <>Opportunity.<br />Shared fairly.</>, text: "Incoming clicks take turns across your team. See where each handoff went without manually forwarding every enquiry.", points: ["Round-robin lead distribution", "Visible routing events"], link: "/tools/rotator", cta: "Explore lead routing", art: "/art/home/feature-distribute.webp", alt: "Three equal team members taking turns in a rotation" },
  { tag: "03 / PROTECT", title: <>Your conversations.<br />Still yours.</>, text: "Wazap selects the destination and records the handoff. Your team keeps their conversations inside WhatsApp.", points: ["No WhatsApp account connection", "No access to private chat content"], link: "/privacy", cta: "Read our privacy policy", art: "/art/home/feature-protect.webp", alt: "A shield protecting conversations inside a glass sphere" },
];

function PrimaryCta({ children = "Start 3-day free trial", className, variant }: { children?: React.ReactNode; className?: string; variant?: "primary" | "inverse" }) {
  return <ButtonLink href="/signup?redirect=/tools/rotator" size="lg" variant={variant} className={className}>{children}<ArrowUpRight size={18} aria-hidden /></ButtonLink>;
}

function RoutingDemo() {
  const [clicks, setClicks] = useState(0);
  const [pulse, setPulse] = useState(0);
  const active = clicks ? (clicks - 1) % agents.length : -1;
  return (
    <Card className="p-0 shadow-float hover:shadow-float" variant="default">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3 text-xs font-medium text-muted">
        <span className="flex gap-1.5" aria-hidden><i className="size-2.5 rounded-full bg-border-strong" /><i className="size-2.5 rounded-full bg-border-strong" /><i className="size-2.5 rounded-full bg-border-strong" /></span>
        <span>Wazap / Lead rotator</span>
        <span className="rounded-full bg-highlight-soft px-2 py-0.5 text-[10px] font-semibold tracking-wider text-warning">DEMO</span>
      </div>
      <div className="space-y-5 p-5 sm:p-7">
        <div className="flex items-center gap-4 rounded-2xl bg-surface-2 p-4">
          <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-accent text-on-accent"><Link2 size={23} aria-hidden /></div>
          <div className="min-w-0 flex-1"><small className="block text-[10px] font-semibold tracking-widest text-muted">ONE LINK. YOUR WHOLE TEAM.</small><strong className="block truncate text-text">wazap.lt/r/your-team</strong></div>
          <QrCode size={25} className="shrink-0 text-muted" aria-hidden />
        </div>
        <div className="flex items-center gap-3 text-muted" aria-hidden><span className="h-px flex-1 bg-border-strong" /><Shuffle size={21} /><span className="h-px flex-1 bg-border-strong" /></div>
        <div className="grid grid-cols-3 gap-3">
          {agents.map((name, i) => (
            <div key={`${name}-${active === i ? pulse : 0}`} className={cx("flex flex-col items-center gap-1 rounded-2xl border p-4 text-center transition-colors duration-300", active === i ? "ring-pulse border-accent bg-accent-soft" : "border-border bg-surface")}>
              <Avatar name={name} className="size-11 text-base" />
              <strong className="text-text">{name}</strong>
              <small className="text-xs text-muted">{clicks ? Math.floor((clicks + 2 - i) / 3) : 0} routed</small>
            </div>
          ))}
        </div>
        <div className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-surface-2 px-4 py-3 text-center text-sm text-text" aria-live="polite">
          {clicks ? <><Check size={15} className="text-accent" /> Lead {clicks} routed to {agents[active]} <span className="text-muted">Next: {agents[clicks % 3]}</span></> : <><ShieldCheck size={15} className="text-accent" /> Fair distribution. Every click gets a turn.</>}
        </div>
        <button type="button" onClick={() => { setClicks((c) => c + 1); setPulse((p) => p + 1); }} className={buttonClasses("primary", "lg", "w-full")}>
          <MousePointer2 size={17} aria-hidden />{clicks ? "Simulate another lead" : "Simulate a lead"}<ArrowRight size={17} aria-hidden />
        </button>
        <p className="text-center text-xs text-muted">Interactive example · No messages sent</p>
      </div>
    </Card>
  );
}

export default function HomeExperience() {
  const [industry, setIndustry] = useState(0);
  return (
    <main className="ds-light overflow-x-clip bg-bg text-text">
      <ScrollReveal />

      <section className="relative overflow-hidden pb-16 pt-14 sm:pt-20 lg:pb-24">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px]" style={{ background: "var(--grad-hero)" }} />
        <Container className="relative grid items-center gap-12 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="eyebrow">ONE WHATSAPP LINK. YOUR WHOLE TEAM.</p>
            <HeadlineReveal className="mt-6" lines={["One link.", "Every lead.", "The right person."]} accentLine={1} />
            <p className="mt-6 max-w-xl text-lg leading-8 text-muted">Turn campaign clicks into team conversations. Share one WhatsApp link, distribute leads fairly, and see where every handoff goes.</p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <PrimaryCta />
              <ButtonLink href="#demo" variant="ghost" size="lg">Try the live demo <ArrowRight size={17} aria-hidden /></ButtonLink>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-accent" /> No API setup</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-accent" /> No QR scan</span>
              <span className="inline-flex items-center gap-1.5"><Check size={14} className="text-accent" /> 100 leads, 3-day trial</span>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-lg">
            <div aria-hidden className="absolute inset-8 rounded-full bg-jade-bright/15 blur-3xl" />
            <HeroParallax>
            <ThemedImage
              src="/art/home/hero-routing.webp"
              alt="Conceptual illustration of one conversation routing to three team destinations"
              width={1254} height={1254} priority fetchPriority="high"
              sizes="(max-width: 1024px) 90vw, 520px"
              className="float-soft relative [mask-image:radial-gradient(closest-side,#000_72%,transparent_100%)]"
            />
            </HeroParallax>
            <div className="glass absolute bottom-6 start-0 hidden items-center gap-3 rounded-2xl px-4 py-3 sm:flex">
              <span className="grid size-9 place-items-center rounded-full bg-accent text-on-accent"><Check size={19} aria-hidden /></span>
              <div><strong className="block text-sm text-text">One link. Balanced leads.</strong><small className="text-xs text-muted">Built for your whole team.</small></div>
            </div>
          </div>
        </Container>
        <Container className="relative mt-14 grid grid-cols-2 gap-3 sm:grid-cols-4" data-animate>
          {capabilities.map(([Icon, label]) => (
            <span key={label} className="surface-card flex items-center gap-2.5 rounded-2xl px-4 py-3.5 text-sm font-medium text-text"><Icon size={17} className="text-accent" aria-hidden />{label}</span>
          ))}
        </Container>
      </section>

      <Marquee items={marqueeItems} label={marqueeItems.map((i) => i.text).join(". ")} />

      <Section>
        <Container>
          <SectionHeader eyebrow="EVERY TOUCHPOINT. ONE TEAM." title="Your campaigns." highlight="Connected." />
          <div className="mt-14 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr]" aria-label="Ads, websites, QR codes, and social profiles connect to one Wazap team link">
            <div className="grid gap-4 sm:grid-cols-2 lg:order-1" data-animate>
              {[[BarChart3, "Paid campaigns"], [Globe2, "Your website"]].map(([Icon, label]) => { const I = Icon as typeof Globe2; return (
                <Card key={String(label)} className="flex items-center gap-4 p-5"><span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-hover"><I size={26} aria-hidden /></span><span className="font-medium text-text">{String(label)}</span></Card>); })}
            </div>
            <div className="mx-auto grid size-44 place-items-center rounded-full bg-ink text-center text-white shadow-float ring-8 ring-accent-soft lg:order-2" data-animate>
              <div><MessageCircle size={38} className="mx-auto text-jade-bright" aria-hidden /><strong className="mt-1 block text-xl">Wazap<span className="text-jade-bright">.</span></strong><small className="text-[10px] tracking-widest text-white/60">ONE TEAM LINK</small></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:order-3" data-animate>
              {[[QrCode, "Offline QR codes"], [Users, "Social profiles"]].map(([Icon, label]) => { const I = Icon as typeof Globe2; return (
                <Card key={String(label)} className="flex items-center gap-4 p-5"><span className="grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-hover"><I size={26} aria-hidden /></span><span className="font-medium text-text">{String(label)}</span></Card>); })}
            </div>
          </div>
          <p className="mt-8 text-center text-sm font-medium text-muted">Different channels. The same routing link.</p>
        </Container>
      </Section>

      <Section id="demo" tone="surface">
        <Container>
          <SectionHeader eyebrow="TRY IT BEFORE YOU SIGN UP" title="A click comes in." highlight="Your team gets a turn.">Click through the demo and watch the next lead move to the next person.</SectionHeader>
          <div className="mt-14 grid items-center gap-12 lg:grid-cols-2">
            <div data-animate>
              <span className="text-xs font-semibold tracking-widest text-accent-hover">01 / LEAD ROUTING</span>
              <h3 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">A fairer way to<br />share opportunity.</h3>
              <p className="mt-4 text-lg leading-8 text-muted">One overloaded inbox shouldn’t be your growth plan. Give every team member their turn, without manually forwarding every enquiry.</p>
              <ul className="mt-6 space-y-3 text-text">
                {["Keep using your existing WhatsApp numbers", "Share the same link across your campaigns", "Update your team behind the link"].map((p) => <li key={p} className="flex items-start gap-3"><Check size={18} className="mt-1 shrink-0 text-accent" aria-hidden /> {p}</li>)}
              </ul>
              <Link className="mt-7 inline-flex items-center gap-1.5 font-semibold text-accent underline-offset-4 hover:underline" href="/tools/rotator">Create your own lead router <ArrowUpRight size={18} aria-hidden /></Link>
            </div>
            <div data-animate><RoutingDemo /></div>
          </div>
        </Container>
      </Section>

      <Section id="how-it-works">
        <Container>
          <SectionHeader eyebrow="LESS SETUP. MORE CONVERSATIONS." title="From campaign to conversation." highlight="In three simple steps." />
          <div className="relative mt-14 grid gap-5 md:grid-cols-3">
            <div aria-hidden className="absolute inset-x-[16%] top-[3.1rem] hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent md:block" />
            {steps.map((s, i) => (
              <Card key={s.title} className="relative p-7" data-animate>
                <div className="flex items-center justify-between"><span className="grid size-14 place-items-center rounded-2xl bg-accent text-on-accent shadow-accent"><s.icon size={27} aria-hidden /></span><span className="text-4xl font-bold text-border-strong tabular">0{i + 1}</span></div>
                <h3 className="mt-6 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 leading-7 text-muted">{s.text}</p>
              </Card>
            ))}
          </div>
        </Container>
      </Section>

      <Section id="features">
        <Container>
          <SectionHeader eyebrow="SCROLL THROUGH THE WORKFLOW" title="Less guesswork." highlight="More flow." />
          <div className="mt-16 space-y-20 sm:space-y-28">
            {features.map((f, i) => (
              <article key={f.tag} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
                <div className={cx(i % 2 === 1 && "lg:order-2")} data-animate>
                  <span className="text-xs font-semibold tracking-widest text-accent-hover">{f.tag}</span>
                  <h3 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{f.title}</h3>
                  <p className="mt-4 text-lg leading-8 text-muted">{f.text}</p>
                  <ul className="mt-6 space-y-3">{f.points.map((p) => <li key={p} className="flex items-center gap-3"><Check size={17} className="shrink-0 text-accent" aria-hidden />{p}</li>)}</ul>
                  <ButtonLink href={f.link} className="mt-8">{f.cta}<ArrowUpRight size={18} aria-hidden /></ButtonLink>
                </div>
                <div className={cx("relative", i % 2 === 1 && "lg:order-1")} data-animate>
                  <div aria-hidden className="absolute inset-6 rounded-full bg-jade-bright/10 blur-3xl" />
                  <ThemedImage src={f.art} alt={f.alt} width={1536} height={1024} sizes="(max-width: 1024px) 92vw, 560px" className="relative w-full [mask-image:radial-gradient(closest-side,#000_74%,transparent_100%)]" />
                </div>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      <Section tone="surface">
        <Container className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]">
          <div data-animate>
            <p className="eyebrow">BUILT FOR TEAMS THAT LIVE ON ENQUIRIES</p>
            <h2 className="mt-4 text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">Your business.<br /><span className="text-gradient-brand">Your workflow.</span></h2>
            <div className="mt-8 flex flex-col gap-2" role="tablist" aria-label="Business use cases">
              {industries.map((item, i) => (
                <button
                  key={item.name} id={`industry-tab-${i}`} type="button" role="tab" aria-selected={industry === i} aria-controls="industry-panel" tabIndex={industry === i ? 0 : -1}
                  className={cx("btn-press flex min-h-12 items-center justify-between rounded-2xl border px-5 text-start text-[15px] font-semibold transition-colors duration-200", industry === i ? "border-accent bg-accent-soft text-accent-hover" : "border-border bg-surface text-text hover:border-border-strong")}
                  onKeyDown={(e) => {
                    const key = e.key === "ArrowDown" ? "ArrowRight" : e.key === "ArrowUp" ? "ArrowLeft" : e.key;
                    const next = nextTabIndex(key, i, industries.length);
                    if (next === null) return;
                    e.preventDefault(); setIndustry(next); document.getElementById(`industry-tab-${next}`)?.focus();
                  }}
                  onClick={() => setIndustry(i)}
                >{item.name}<ArrowUpRight size={16} aria-hidden /></button>
              ))}
            </div>
          </div>
          <Card key={industry} id="industry-panel" role="tabpanel" aria-labelledby={`industry-tab-${industry}`} className="p-7 shadow-raise sm:p-9" data-animate>
            <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-surface-2 p-5">
              <div className="flex flex-wrap gap-2">{industries[industry].channels.map((c) => <span key={c} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text"><Globe2 size={15} className="text-accent" aria-hidden />{c}</span>)}</div>
              <ArrowRight size={28} className="text-muted rtl:rotate-180" aria-hidden />
              <div className="flex items-center gap-2 rounded-2xl bg-ink px-4 py-3 text-white"><MessageCircle size={28} className="text-jade-bright" aria-hidden /><span className="font-medium">Your team</span></div>
            </div>
            <h3 className="mt-7 text-2xl font-bold tracking-tight">{industries[industry].title}</h3>
            <p className="mt-3 text-lg leading-8 text-muted">{industries[industry].text}</p>
            <PrimaryCta className="mt-7">Build your team link</PrimaryCta>
          </Card>
        </Container>
      </Section>

      <Section id="faq">
        <Container className="grid items-start gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div data-animate className="lg:sticky lg:top-28">
            <p className="eyebrow">THE DETAILS, SIMPLIFIED</p>
            <h2 className="mt-4 text-3xl font-bold leading-[1.1] tracking-tight sm:text-5xl">Good questions.<br /><span className="text-gradient-brand">Clear answers.</span></h2>
            <p className="mt-5 text-lg leading-8 text-muted">Everything you need to know before your first routed lead.</p>
            <Link className="mt-6 inline-flex items-center gap-1.5 font-semibold text-accent underline-offset-4 hover:underline" href="/contact">Talk to Wazap <ArrowUpRight size={17} aria-hidden /></Link>
          </div>
          <div className="space-y-3" data-animate>
            {landingFaqs.map(({ q, a }) => (
              <details key={q} className="group surface-card rounded-2xl px-6 py-1 open:shadow-raise">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 font-semibold text-text [&::-webkit-details-marker]:hidden">{q}<Plus size={20} className="shrink-0 text-accent transition-transform duration-200 group-open:rotate-45" aria-hidden /></summary>
                <p className="pb-5 leading-7 text-muted">{a}</p>
              </details>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="pb-12">
        <Container>
          <div className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-16 text-center text-white shadow-float sm:px-12 sm:py-20" data-animate>
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_70%_at_50%_110%,rgb(15_169_104/0.5),transparent_70%)]" />
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:44px_44px]" />
            <div className="relative">
              <p className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.15em] text-white/70"><Zap size={16} className="text-highlight" aria-hidden /> MAKE YOUR NEXT CAMPAIGN A TEAM EFFORT</p>
              <h2 className="mx-auto mt-5 max-w-2xl text-4xl font-bold leading-[1.1] tracking-tight sm:text-6xl">More opportunity.<br /><span className="text-jade-bright">Shared fairly.</span></h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-8 text-white/70">Your first 3 days are a free trial with 100 routed leads. Create one link and put your whole team behind it.</p>
              <div className="mt-8 flex flex-col items-center gap-4"><PrimaryCta variant="inverse" /><Link className="inline-flex items-center gap-1.5 text-sm text-white/70 hover:text-white" href="/pricing">Explore paid plans <ArrowRight size={15} aria-hidden /></Link></div>
            </div>
          </div>
          <p className="mt-8 text-center text-sm text-muted">Need a quick utility? <Link className="font-medium text-accent hover:underline" href="/tools">Explore our free WhatsApp tools <ArrowUpRight size={14} className="inline" aria-hidden /></Link></p>
        </Container>
      </Section>
    </main>
  );
}
