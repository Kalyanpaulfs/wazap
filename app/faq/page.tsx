import type { Metadata } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

export const metadata: Metadata = {
  title: "FAQ — WhatsApp Business Tools, Plans and Security",
  description: "Get answers about Wazap WhatsApp Business tools, account setup, pricing, usage limits, privacy, security, integrations and customer support.",
  alternates: { canonical: "https://wazap.lt/faq" },
  openGraph: {
    title: "FAQ — Wazap WhatsApp Tools",
    description: "Common questions about Wazap tools, plans, limits, and WhatsApp connections.",
    url: "https://wazap.lt/faq",
  },
};

const FAQS = [
  {
    section: "General",
    items: [
      {
        q: "What is Wazap?",
        a: "Wazap is a business-conversation platform. Its free WhatsApp tools help businesses start conversations, while Wazap Flow helps teams share leads, attribution, follow-ups, and sales outcomes in one workspace.",
      },
      {
        q: "Do I need the WhatsApp Business API?",
        a: "No. Wazap's tools are click-to-chat link and QR generators that work with any WhatsApp number — no Business API, no approvals, nothing to install.",
      },
      {
        q: "Is Wazap affiliated with WhatsApp or Meta?",
        a: "No. Wazap is an independent productivity tool for creating WhatsApp click-to-chat links, QR codes, contact pages, and printable records. It is not affiliated with, endorsed by, or supported by WhatsApp Inc. or Meta Platforms.",
      },
    ],
  },
  {
    section: "Tools",
    items: [
      {
        q: "How does the Number Checker work?",
        a: "Paste a list of phone numbers (any format — with spaces, dashes, country codes). The checker cleans and validates each number and generates a direct wa.me link for every valid one.",
      },
      {
        q: "What is the Linktree tool?",
        a: "It creates a public page (e.g. wazap.lt/l/yourslug) showing multiple WhatsApp numbers for your team. Customers pick who to message. Useful for businesses with departments (Sales, Support, Billing).",
      },
      {
        q: "What is the Link Rotator?",
        a: "It gives you one public link that rotates click-to-chat handoffs across your configured WhatsApp numbers. A recorded handoff is not proof of a sent message, a unique customer, or an available agent.",
      },
      {
        q: "What does the Ad Builder do?",
        a: "It creates WhatsApp links with UTM tracking parameters (source, medium, campaign). Use them in paid ads to track how many clicks come from each campaign, and see totals per link in your dashboard.",
      },
      {
        q: "Can I export WhatsApp chats to PDF?",
        a: "Yes — the Transcript Exporter converts the .txt file WhatsApp exports into a clean, readable PDF. Open WhatsApp → chat → Export Chat → Without Media, then upload the .txt file to Wazap.",
      },
    ],
  },
  {
    section: "Teams & Workspaces",
    items: [
      {
        q: "Can my team share Wazap Flow?",
        a: "Agency includes a shared workspace for up to 5 members. Members can use shared leads, assignments, notes, tasks and follow-ups within their permissions. Check the pricing page for the current public plans and limits.",
      },
      {
        q: "Does recording a reply in the shared inbox send it?",
        a: "Not unless a supported messaging provider is connected and confirms delivery. The current manual reply action opens WhatsApp for sending and records the reply in Wazap for team context; Wazap labels it as manually recorded rather than delivered.",
      },
      {
        q: "How are workspace invitations protected?",
        a: "Invitations expire after seven days and can only be accepted by an account signed in with the invited email address. Workspace owners and admins can cancel invitations and remove members; only owners can promote admins.",
      },
    ],
  },
  {
    section: "AI Employees",
    items: [
      {
        q: "What is a Wazap AI employee?",
        a: "It is a governed role profile—such as Sales Rep, Receptionist, or Support Agent—with approved knowledge, instructions, draft or approval mode, escalation rules, run history, and human handoff controls.",
      },
      {
        q: "Can an AI employee send messages autonomously?",
        a: "Not by default. Autonomous mode remains locked until a verified messaging provider, delivery receipts, workspace approval policy, and model-provider verification are active. Approved drafts are not labelled as sent unless the channel confirms transmission.",
      },
      {
        q: "What happens when the AI is unsure?",
        a: "The workspace can define prohibited topics, escalation keywords, and situations that require a human. Handoffs are persisted, assigned, prioritized, and resolved inside the shared inbox.",
      },
    ],
  },
  {
    section: "API & Webhooks",
    items: [
      { q: "How are Wazap API keys protected?", a: "A key is displayed only once and Wazap stores only its SHA-256 hash. Keys are workspace-bound, scope-limited, rate-limited, expiring, and revocable. Request logs never store bearer tokens or request payloads." },
      { q: "How do I verify a Wazap webhook?", a: "Use the raw request body and the x-wazap-timestamp header to compute HMAC-SHA256 with your signing secret. Compare it with the v1 hexadecimal signature in x-wazap-signature and reject stale timestamps." },
      { q: "What happens when a webhook fails?", a: "Delivery is retried asynchronously with exponential backoff. Wazap records attempts, HTTP status, and a bounded error message, and disables an endpoint after eight failed attempts." },
    ],
  },
  {
    section: "Plans & Billing",
    items: [
      {
        q: "What plans are available?",
        a: "Free ($0), Solo ($9/month), Growth ($19/month), and Agency ($49/month). Agency includes unlimited rotators and a shared workspace for up to 5 members.",
      },
      {
        q: "How do I pay?",
        a: "Create or sign in to your Wazap account, choose a plan, and complete the secure checkout. Paid software access activates after successful payment confirmation.",
      },
      {
        q: "Can I cancel anytime?",
        a: "Yes. Paid plans renew monthly until cancelled. Cancellation stops future renewals while access continues through the paid billing period.",
      },
      {
        q: "Does Wazap have referrals, commissions, or financial rewards?",
        a: "No. Wazap sells access to productivity software only. It does not operate a referral, affiliate, commission, payout, or financial rewards program.",
      },
      {
        q: "Do daily limits reset?",
        a: "Daily tool limits reset at midnight UTC. The free router allowance is different: 25 routed handoffs per account across all rotators, for the lifetime of the allowance. It does not reset daily. The 14-day Growth workspace trial is separate and does not make routing unlimited.",
      },
    ],
  },
  {
    section: "Account & Security",
    items: [
      {
        q: "I forgot my password. What do I do?",
        a: "Open the Forgot password page and enter your account email. If an account exists, Wazap queues a single-use link that expires after 30 minutes. Completing the reset signs out existing sessions.",
      },
      {
        q: "Is my WhatsApp session secure?",
        a: "Link routing does not read WhatsApp messages. Connected inbox workflows can store messages and conversation records, and transcript tools process the files you provide. See our privacy policy before connecting a channel or uploading chat data.",
      },
    ],
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.flatMap(section =>
    section.items.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    }))
  ),
};

export default function FAQPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold text-white mb-3">Frequently Asked Questions</h1>
        <p className="text-slate-400">Can&apos;t find your answer? <Link href="/contact" className="text-[#25D366] hover:underline">Contact us</Link> and we&apos;ll get back to you.</p>
      </div>

      <div className="space-y-10">
        {FAQS.map(section => (
          <div key={section.section}>
            <h2 className="text-xs font-bold uppercase tracking-widest text-[#25D366] mb-4">{section.section}</h2>
            <div className="space-y-3">
              {section.items.map(({ q, a }) => (
                <details key={q} className="group rounded-2xl border border-slate-800 bg-[#111811] overflow-hidden">
                  <summary className="flex items-center justify-between gap-4 px-6 py-4 cursor-pointer list-none select-none">
                    <span className="text-sm font-semibold text-white">{q}</span>
                    <ChevronDown className="h-4 w-4 text-slate-500 shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="px-6 pb-5">
                    <p className="text-sm text-slate-400 leading-relaxed">{a}</p>
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-[#25D366]/20 bg-[#25D366]/5 p-6 text-center">
        <p className="text-white font-semibold mb-1">Still have questions?</p>
        <p className="text-slate-400 text-sm mb-4">Send your question and the relevant page or error. Response times vary; we do not promise a fixed response window.</p>
        <Link href="/contact" className="inline-flex rounded-full bg-[#25D366] hover:bg-[#1fba58] px-6 py-2.5 text-sm font-semibold text-black transition-colors">
          Contact Support
        </Link>
      </div>
    </div>
  );
}
