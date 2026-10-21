import BrandLogo from "./BrandLogo";
import { LanguageSelector } from "../localization/SiteLocale";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Layers, ShieldCheck, Users } from "lucide-react";
import { buttonClasses } from "../ui/Button";
import ThemeToggle from "../theme/ThemeToggle";
import "./auth.css";

export default function AuthShell({ mode, nextHref, children }: { mode: "login" | "signup"; nextHref: string; children: React.ReactNode }) {
  const signup = mode === "signup";
  return (
    <main className="wp-auth-page ds-light relative flex min-h-dvh flex-col bg-bg px-4 pb-10 pt-6 text-text sm:px-6">
      <header className="mx-auto mb-8 flex w-full max-w-6xl items-center justify-between gap-4 sm:mb-10">
        <Link href="/" aria-label="Wazap home"><BrandLogo tone="onLight" /></Link>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <ThemeToggle />
          <Link href="/" className={buttonClasses("outline", "sm")}><ArrowLeft size={16} aria-hidden />Back to Wazap</Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-3xl border border-border bg-surface shadow-float lg:grid-cols-[1.05fr_1fr]">
        <section className="min-w-0 px-6 py-10 sm:px-12 sm:py-14">
          <p className="eyebrow">{signup ? "YOUR NEXT CHAPTER" : "YOUR BUSINESS WORKSPACE"}</p>
          <h1 className="mb-4 mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl">
            {signup ? "Create your" : "Welcome"}
            <br />
            <span className="text-gradient-brand">{signup ? "workspace." : "back."}</span>
          </h1>
          <p className="mb-8 max-w-sm text-[15px] leading-7 text-muted">
            {signup
              ? "Start your 3-day free trial — everything in Solo ($9 plan), 100 routed leads. No card required."
              : "Sign in to keep your conversations and next actions moving."}
          </p>
          {children}
          <p className="mt-7 text-xs leading-6 text-muted">
            {signup ? "By creating an account, you agree to our " : "Learn how we handle your information in our "}
            <Link href="/terms" className="font-medium text-text underline underline-offset-4">Terms</Link> and{" "}
            <Link href="/privacy" className="font-medium text-text underline underline-offset-4">Privacy Policy</Link>.
          </p>
        </section>

        <aside className="relative flex min-w-0 flex-col overflow-hidden bg-ink px-8 pb-6 pt-12 text-white sm:px-11">
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_85%,rgb(15_169_104/0.45),transparent_70%)]" />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[size:42px_42px]" />
          <div className="relative z-10">
            <span className="text-[11px] font-semibold tracking-[0.15em] text-white/60">ONE WORKSPACE. YOUR BUSINESS.</span>
            <h2 className="mb-3 mt-4 text-3xl font-semibold tracking-tight">{signup ? "Already with us?" : "New to Wazap?"}</h2>
            <p className="max-w-xs text-sm leading-7 text-white/70">
              {signup ? "Welcome back. Your work is right where you left it." : "Give every enquiry a destination and every lead a next step."}
            </p>
            <Link href={nextHref} className="btn-press mt-6 inline-flex min-h-11 items-center gap-6 rounded-full border border-white/25 bg-white/10 px-6 text-sm font-semibold backdrop-blur transition-colors hover:bg-white/20">
              {signup ? "Sign in" : "Create an account"}<ArrowRight size={16} aria-hidden />
            </Link>
          </div>

          <div className="relative z-10 mt-6 hidden min-h-[300px] flex-1 items-center justify-center sm:flex" aria-hidden="true">
            <div className="absolute size-[310px] rounded-full border border-white/10" />
            <div className="absolute size-[380px] rounded-full border border-white/10" />
            <div className="absolute start-0 top-2 flex -rotate-[5deg] items-center gap-2 rounded-xl border border-white/15 bg-white/10 p-3 text-[11px] text-white/80 backdrop-blur"><Layers size={16} className="text-jade-bright" />Your own workspace</div>
            <svg viewBox="0 0 400 330" className="relative w-full max-w-[360px] -rotate-[9deg] drop-shadow-[0_25px_25px_rgba(0,0,0,0.35)]">
              <defs>
                <linearGradient id={`lock-body-${mode}`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#2bd98a" /><stop offset=".5" stopColor="#0fa968" /><stop offset="1" stopColor="#0b3d2e" /></linearGradient>
                <linearGradient id={`lock-metal-${mode}`}><stop stopColor="#c5f7de" /><stop offset=".5" stopColor="#2bd98a" /><stop offset="1" stopColor="#0b5a3c" /></linearGradient>
              </defs>
              <ellipse cx="204" cy="294" rx="115" ry="19" fill="#02060c" opacity=".55" />
              <path d="M139 143v-37c0-86 131-86 131 0v37" fill="none" stroke="#06241a" strokeWidth="34" />
              <path d="M139 139v-37c0-81 131-81 131 0v37" fill="none" stroke={`url(#lock-metal-${mode})`} strokeWidth="23" />
              <rect x="103" y="132" width="204" height="151" rx="35" fill={`url(#lock-body-${mode})`} stroke="#7df0b9" strokeWidth="2" />
              <rect x="115" y="142" width="180" height="128" rx="26" fill="none" stroke="#c5f7de" strokeOpacity=".3" />
              <circle cx="205" cy="196" r="16" fill="#06180f" />
              <path d="M199 208h12l6 29h-24z" fill="#06180f" />
              <circle cx="300" cy="250" r="43" fill="#0e1726" stroke="#2bd98a" strokeWidth="3" />
              <path d="m281 250 13 12 24-26" fill="none" stroke="#2bd98a" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="m77 119 4-12 4 12 12 4-12 4-4 12-4-12-12-4z" fill="#f4b860" />
              <path d="m320 80 3-9 3 9 9 3-9 3-3 9-3-9-9-3z" fill="#c5f7de" />
            </svg>
            <div className="absolute bottom-3 end-0 flex rotate-[4deg] items-center gap-2.5 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-[11px] backdrop-blur">
              <Check size={17} className="text-jade-bright" /><span>Your team.<strong className="mt-1 block font-medium text-white/75">Your conversations.</strong></span>
            </div>
          </div>

          <div className="relative z-10 mt-6 flex items-center justify-center gap-2 text-[11px] text-white/60"><Users size={16} />Built for a clear next action.</div>
        </aside>
      </div>

      <footer className="mx-auto mt-8 flex flex-wrap justify-center gap-x-8 gap-y-2 text-xs text-muted">
        <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-accent" />A dedicated business workspace</span>
        <span className="flex items-center gap-2"><Check size={15} className="text-accent" />3-day free trial</span>
        <span className="flex items-center gap-2"><Check size={15} className="text-accent" />No card required</span>
      </footer>
    </main>
  );
}
