"use client";

import Link from "next/link";
import { Clock, Mail, MessageCircle } from "lucide-react";

const quickAnswers: { q: string; a: React.ReactNode }[] = [
  {
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
    q: "How do I add or name a salesperson?",
    a: "On a rotator, each row is a salesperson: enter their name and WhatsApp number. The name is optional, but it shows up in your Results so it's easy to recognise who got which lead.",
  },
  {
    q: "Why is my link paused?",
    a: "Either your 3-day free trial has ended and your links are paused, or you moved to a lower plan and went over its shared link total (lead rotators, WhatsApp links and ad links all count together) or its salespeople-per-rotator limit. Choose a plan (or trim items) to resume — anything paused keeps its data.",
  },
  {
    q: "What does each plan include?",
    a: (
      <>
        <strong className="text-text">Free trial (3 days):</strong> everything in Solo — 5 links, 3 salespeople per rotator, 100 leads, website button, basic reports. After the trial, links pause until you choose a plan.{" "}
        <strong className="text-text">Solo ($9/mo):</strong> same, ongoing — no 3-day limit.{" "}
        <strong className="text-text">Growth ($19/mo):</strong> 20 links (incl. ad links), 10 salespeople per rotator,
        full reports.{" "}
        <strong className="text-text">Agency ($49/mo):</strong> 55 links (any type), 20 salespeople per rotator,
        full reports with shared exports. See{" "}
        <Link href="/billing#plans" className="text-accent underline">Plans</Link> for the full comparison.
      </>
    ),
  },
  {
    q: "How do I change plan or turn off auto-pay?",
    a: (
      <>
        Go to <Link href="/billing" className="text-accent underline">Billing</Link>. You can change your plan or
        turn auto-pay on or off — turning it off keeps your access until the current period ends.
      </>
    ),
  },
  {
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
    q: "Where do I see my results?",
    a: (
      <>
        <Link href="/results" className="text-accent underline">Results</Link> shows live click and routing
        activity for every plan, on the Overview tab. <Link href="/results?tab=source" className="text-accent underline">By source &amp; campaign</Link> (Solo and
        above) adds fuller breakdowns by source, campaign, and date range.
      </>
    ),
  },
  {
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

export default function SupportClient() {
  return (
    <div className="min-h-screen px-4 py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-text">Help &amp; support</h1>
          <p className="mt-2 text-muted">
            Our AI assistant answers right away. If it can&apos;t help, our team replies within 12 hours.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("wazap:open-chat"))}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover"
          >
            <MessageCircle className="h-4 w-4" />
            Ask our assistant
          </button>
          <Link
            href="/contact"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border-strong px-6 py-3 text-sm font-semibold text-muted transition-colors hover:border-accent/40 hover:text-text"
          >
            <Mail className="h-4 w-4" />
            Send a message
          </Link>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-2xl border border-accent/20 bg-accent-soft p-4 text-sm text-muted">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <span>Most questions are answered instantly by the AI assistant. Anything it can&apos;t resolve is handed to our team, who reply within 12 hours.</span>
        </div>

        <h2 className="mt-10 mb-3 text-lg font-semibold text-text">Quick answers</h2>
        <div className="space-y-2">
          {quickAnswers.map(({ q, a }) => (
            <details key={q} className="group rounded-xl border border-border bg-surface px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-text marker:content-none">
                {q}
              </summary>
              <p className="mt-2 text-sm leading-6 text-muted">{a}</p>
            </details>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-4 text-sm">
          <Link href="/refund" className="text-accent hover:underline">Refund policy</Link>
          <Link href="/terms" className="text-accent hover:underline">Terms</Link>
          <Link href="/privacy" className="text-accent hover:underline">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
