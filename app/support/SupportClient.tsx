"use client";

import Link from "next/link";
import { Clock, Mail, MessageCircle } from "lucide-react";

const quickAnswers: { q: string; a: React.ReactNode }[] = [
  {
    q: "How do I create a lead routing link?",
    a: (
      <>
        Go to <Link href="/tools/rotator" className="text-[#25D366] underline">Link Rotator</Link>, name your rotator, add at least two
        salespeople with their WhatsApp numbers, and share the generated link. Each click opens WhatsApp with the next
        person in rotation — you can also download a QR code from the rotator card.
      </>
    ),
  },
  {
    q: "How do I add or name a salesperson?",
    a: "On a rotator, each row is a salesperson: enter their name and WhatsApp number. The name is optional, but it shows up in your Reports so it's easy to recognise who got which lead.",
  },
  {
    q: "Why is my link paused?",
    a: "Either you've used your free 25 lifetime leads (a new 3-day trial gives 100), or you moved to a lower plan and went over its rotator, number, or short-link limit. Upgrade or trim items on the plan to resume — anything paused keeps its data.",
  },
  {
    q: "What does each plan include?",
    a: (
      <>
        <strong className="text-white">Free:</strong> 1 rotator, 2 numbers per rotator, 25 lifetime routed leads.{" "}
        <strong className="text-white">Solo ($9/mo):</strong> 3 rotators, 3 numbers each, unlimited leads, 2 short links,
        website widget, basic reports.{" "}
        <strong className="text-white">Growth ($19/mo):</strong> 10 rotators, 10 numbers each, 5 short links, 5 ad
        links, full reports.{" "}
        <strong className="text-white">Agency ($49/mo):</strong> 25 rotators, 20 numbers each, 15 short links, 15 ad
        links, full reports with shared exports. See{" "}
        <Link href="/plans" className="text-[#25D366] underline">Plans</Link> for the full comparison.
      </>
    ),
  },
  {
    q: "How do I change plan or turn off auto-pay?",
    a: (
      <>
        Go to <Link href="/billing" className="text-[#25D366] underline">Billing</Link>. You can change your plan or
        turn auto-pay on or off — turning it off keeps your access until the current period ends.
      </>
    ),
  },
  {
    q: "How do refunds work?",
    a: (
      <>
        New paid subscriptions can request a refund within 7 days of purchase. See our{" "}
        <Link href="/refund" className="text-[#25D366] underline">Refund policy</Link> for details, or just ask us and
        we&apos;ll help.
      </>
    ),
  },
  {
    q: "Where do I see my results?",
    a: (
      <>
        <Link href="/performance" className="text-[#25D366] underline">Performance</Link> shows live click and routing
        activity for every plan. <Link href="/reports" className="text-[#25D366] underline">Reports</Link> (Solo and
        above) adds fuller breakdowns by source, campaign, and date range.
      </>
    ),
  },
  {
    q: "Is my data safe? How do I download or delete it?",
    a: (
      <>
        Yes. From <Link href="/account" className="text-[#25D366] underline">Account &amp; data</Link> you can download
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
          <h1 className="text-3xl font-bold text-white">Help &amp; support</h1>
          <p className="mt-2 text-slate-400">
            Our AI assistant answers right away. If it can&apos;t help, our team replies within 12 hours.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event("wazap:open-chat"))}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-[#1fba58]"
          >
            <MessageCircle className="h-4 w-4" />
            Ask our assistant
          </button>
          <Link
            href="/contact"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-300 transition-colors hover:border-[#25D366]/40 hover:text-white"
          >
            <Mail className="h-4 w-4" />
            Send a message
          </Link>
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-2xl border border-[#25D366]/20 bg-[#25D366]/5 p-4 text-sm text-slate-400">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-[#25D366]" />
          <span>Most questions are answered instantly by the AI assistant. Anything it can&apos;t resolve is handed to our team, who reply within 12 hours.</span>
        </div>

        <h2 className="mt-10 mb-3 text-lg font-semibold text-white">Quick answers</h2>
        <div className="space-y-2">
          {quickAnswers.map(({ q, a }) => (
            <details key={q} className="group rounded-xl border border-slate-800 bg-[#111811] px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-medium text-white marker:content-none">
                {q}
              </summary>
              <p className="mt-2 text-sm leading-6 text-slate-400">{a}</p>
            </details>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap justify-center gap-4 text-sm">
          <Link href="/refund" className="text-[#25D366] hover:underline">Refund policy</Link>
          <Link href="/terms" className="text-[#25D366] hover:underline">Terms</Link>
          <Link href="/privacy" className="text-[#25D366] hover:underline">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
