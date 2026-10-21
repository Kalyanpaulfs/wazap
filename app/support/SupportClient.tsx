"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  Link2,
  UserRound,
  Layers,
  MessageCircle,
  Ticket,
  Smartphone,
  Lock,
  Mail,
  Search,
  ChevronRight,
} from "lucide-react";

interface WhatsappInfo { available: boolean; url?: string; reason?: "plan" | "unavailable" }

type AnswerGroup = "Payment" | "Links" | "Account" | "Plans";

const GROUP_ICONS: Record<AnswerGroup, React.ComponentType<{ className?: string; size?: number }>> = {
  Payment: CreditCard,
  Links: Link2,
  Account: UserRound,
  Plans: Layers,
};

// Static, client-safe quick-answer content for the Help page. The richer,
// server-backed QUICK_ANSWERS list in lib/support-quick-answers.ts pulls in
// prisma/billing/entitlements, so it can't be imported here - this list is
// kept separately on purpose, grouped for the accordions below.
const QUICK_ANSWERS: { group: AnswerGroup; q: string; a: React.ReactNode }[] = [
  {
    group: "Links",
    q: "How do I create a lead routing link?",
    a: (
      <>
        Go to <Link href="/links/new/rotator" className="text-accent underline">Lead rotator</Link>, name your rotator, add at least two
        salespeople with their WhatsApp numbers, and share the generated link. Each click opens WhatsApp with the next
        person in rotation — you can also download a QR code from the rotator card.
      </>
    ),
  },
  {
    group: "Links",
    q: "How do I add or name a salesperson?",
    a: "On a rotator, each row is a salesperson: enter their name and WhatsApp number. The name is optional, but it shows up in your Results so it's easy to recognise who got which lead.",
  },
  {
    group: "Links",
    q: "Why is my link paused?",
    a: "Three reasons: your 3-day free trial ended, your plan expired, or you moved to a lower plan and went over its shared link total (lead rotators, WhatsApp links and ad links all count together — salespeople don't affect pausing). Choose a plan (or delete a link to free a slot) to resume — anything paused keeps its data.",
  },
  {
    group: "Links",
    q: "Where do I see my results?",
    a: (
      <>
        <Link href="/results" className="text-accent underline">Results</Link> shows live click and routing
        activity on the Overview tab for the free trial and every paid plan (the free plan sees a locked preview). <Link href="/results?tab=source" className="text-accent underline">By source &amp; campaign</Link> (Growth and
        above) adds fuller breakdowns by source, campaign, and date range.
      </>
    ),
  },
  {
    group: "Plans",
    q: "What does each plan include?",
    a: (
      <>
        <strong className="text-text">Free trial (3 days):</strong> everything in Solo — 5 links, 3 salespeople per rotator, 100 leads, website button, basic reports. After the trial, links pause until you choose a plan.{" "}
        <strong className="text-text">Solo ($9/mo):</strong> same, ongoing — no 3-day limit.{" "}
        <strong className="text-text">Growth ($19/mo):</strong> 20 links (incl. ad links), 10 salespeople per rotator,
        full reports.{" "}
        <strong className="text-text">Agency ($49/mo):</strong> 55 links (any type), 20 salespeople per rotator,
        full reports. See{" "}
        <Link href="/billing#plans" className="text-accent underline">Plans</Link> for the full comparison.
      </>
    ),
  },
  {
    group: "Plans",
    q: "How do I change plan or turn off auto-pay?",
    a: (
      <>
        Go to <Link href="/billing" className="text-accent underline">Billing</Link>. You can change your plan or
        turn auto-pay on or off — turning it off keeps your access until the current period ends.
      </>
    ),
  },
  {
    group: "Payment",
    q: "How do refunds work?",
    a: (
      <>
        New paid subscriptions can request a refund within 7 days of purchase. See our{" "}
        <Link href="/refund" className="text-accent underline">Refund policy</Link> for details, or just ask us and
        we&apos;ll help.
      </>
    ),
  },
  {
    group: "Account",
    q: "Is my data safe? How do I download or delete it?",
    a: (
      <>
        Yes. From <Link href="/account" className="text-accent underline">Account &amp; data</Link> you can download
        a full export of your data or close your account. Closure has a 7-day recovery window before anything is
        permanently removed.
      </>
    ),
  },
];

const GROUP_ORDER: AnswerGroup[] = ["Payment", "Links", "Account", "Plans"];

function openNewTicket() {
  window.dispatchEvent(new CustomEvent("wazap:open-chat", { detail: { newTicket: true } }));
}

export default function SupportClient({ loggedIn, whatsapp, openTicketCount }: { loggedIn: boolean; whatsapp: WhatsappInfo; openTicketCount: number | null }) {
  const [search, setSearch] = useState("");

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    return GROUP_ORDER.map(group => ({
      group,
      items: QUICK_ANSWERS.filter(item => item.group === group && (!term || item.q.toLowerCase().includes(term))),
    })).filter(g => g.items.length > 0);
  }, [search]);

  return (
    <div className="min-h-screen px-4 py-12 sm:py-16">
      <div className="mx-auto max-w-3xl">
        {/* Hero */}
        <div className="mb-8 text-center sm:text-left">
          <h1 className="text-3xl font-bold text-text sm:text-4xl">Help &amp; support</h1>
          <p className="mt-2.5 text-[15px] text-muted">Real people. We reply within 12 hours.</p>

          <div className="relative mt-6">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search quick answers…"
              aria-label="Search quick answers"
              className="w-full rounded-full border border-border bg-surface py-3 pl-11 pr-4 text-sm text-text placeholder:text-muted transition-colors focus:border-accent/50 focus:outline-none"
            />
          </div>
        </div>

        {/* Action cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={openNewTicket}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-accent/20 bg-surface-2 p-5 text-left shadow-sm transition-colors hover:border-accent/50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-text">Start a ticket</span>
            <span className="text-xs leading-5 text-muted">Tell us what&apos;s wrong — a real person replies within 12 hours.</span>
            <span className="mt-auto flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
              Open <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </button>

          {loggedIn && (
            <Link
              href="/support/tickets"
              className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5 text-left shadow-sm transition-colors hover:border-accent/40"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
                <Ticket className="h-5 w-5" />
              </span>
              <span className="flex items-center gap-2 text-sm font-semibold text-text">
                My tickets
                {openTicketCount !== null && openTicketCount > 0 && (
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-semibold text-accent">{openTicketCount} open</span>
                )}
              </span>
              <span className="text-xs leading-5 text-muted">See every ticket you&apos;ve raised, and their status.</span>
              <span className="mt-auto flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                View <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </Link>
          )}

          {whatsapp?.available && (
            <a
              href={whatsapp.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex flex-col items-start gap-3 rounded-2xl border border-accent/20 bg-surface-2 p-5 text-left shadow-sm transition-colors hover:border-accent/50"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Smartphone className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-text">WhatsApp</span>
              <span className="text-xs leading-5 text-muted">Chat with us directly on WhatsApp.</span>
              <span className="mt-auto flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
                Chat <ChevronRight className="h-3.5 w-3.5" />
              </span>
            </a>
          )}
          {whatsapp && !whatsapp.available && whatsapp.reason === "plan" && (
            <Link
              href="/billing#plans"
              className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5 text-left opacity-80 shadow-sm transition-colors hover:border-border-strong"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
                <Lock className="h-5 w-5" />
              </span>
              <span className="text-sm font-semibold text-muted">WhatsApp · Growth & Agency</span>
              <span className="text-xs leading-5 text-muted">Upgrade to Growth or Agency to chat with us on WhatsApp.</span>
            </Link>
          )}

          <Link
            href="/contact"
            className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5 text-left shadow-sm transition-colors hover:border-accent/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
              <Mail className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-text">Send us an email</span>
            <span className="text-xs leading-5 text-muted">Prefer email? Fill in a short form and we reply by email.</span>
            <span className="mt-auto flex items-center gap-1 text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
              Open form <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-2xl border border-accent/20 bg-accent-soft p-4 text-sm text-muted">
          <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>Raise a ticket any time. Our team replies within 12 hours.</span>
        </div>

        {/* Quick answers */}
        <h2 className="mt-12 mb-4 text-lg font-semibold text-text">Quick answers</h2>
        {filteredGroups.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
            No quick answers match &ldquo;{search}&rdquo;. Try{" "}
            <button type="button" onClick={openNewTicket} className="text-accent underline">starting a ticket</button> instead.
          </p>
        ) : (
          <div className="space-y-6">
            {filteredGroups.map(({ group, items }) => {
              const Icon = GROUP_ICONS[group];
              return (
                <div key={group}>
                  <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    <Icon className="h-3.5 w-3.5 text-accent" />
                    {group}
                  </div>
                  <div className="space-y-2">
                    {items.map(({ q, a }) => (
                      <details key={q} className="group rounded-xl border border-border bg-surface px-4 py-3 open:border-accent/30">
                        <summary className="cursor-pointer list-none text-sm font-medium text-text marker:content-none">
                          {q}
                        </summary>
                        <p className="mt-2 text-sm leading-6 text-muted">{a}</p>
                      </details>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-12 flex flex-wrap justify-center gap-4 border-t border-border pt-6 text-sm">
          <Link href="/refund" className="text-accent hover:underline">Refund policy</Link>
          <Link href="/terms" className="text-accent hover:underline">Terms</Link>
          <Link href="/privacy" className="text-accent hover:underline">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
