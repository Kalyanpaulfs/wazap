import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bot, Cable, Inbox, KanbanSquare, LineChart, MessageCircle, ShieldCheck, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "Wazap Flow — WhatsApp CRM, Shared Inbox and Automation",
  description: "Manage official WhatsApp conversations, customer profiles, lead stages, follow-ups, team ownership and AI-assisted replies in one Wazap workspace.",
  alternates: { canonical: "https://wazap.lt/flow" },
};

const capabilities = [
  [Inbox, "Shared team inbox", "Receive official WhatsApp messages, assign owners and reply through Meta from one conversation history."],
  [KanbanSquare, "Customer pipeline", "Move every lead through new, contacted, qualified, proposal, won or lost stages with follow-up dates."],
  [Users, "Team accountability", "Assign conversations, add private notes, create tasks and keep the next action visible."],
  [Bot, "Governed AI assistance", "Generate reply drafts and hand conversations to people while preserving human review."],
  [ShieldCheck, "Consent and templates", "Track opt-in evidence and use Meta-approved templates for business-initiated conversations."],
  [LineChart, "Conversation analytics", "Measure response times, lead outcomes, delivery status and channel reliability."],
] as const;

export default function FlowPage() {
  return <main className="hero-bg min-h-screen px-4 py-14"><div className="mx-auto max-w-6xl">
    <section className="rounded-[2rem] border border-[#25D366]/25 bg-[#0d1a0d]/80 p-7 sm:p-12">
      <p className="text-xs font-bold uppercase tracking-[.24em] text-[#25D366]">New · Wazap Flow beta</p>
      <h1 className="mt-4 max-w-4xl text-4xl font-bold leading-tight text-white sm:text-6xl">The CRM built around business conversations</h1>
      <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-400">Connect a customer-owned WhatsApp Business Account, turn every incoming conversation into a CRM lead, reply from a shared inbox, and keep the pipeline moving without losing context.</p>
      <div className="mt-8 flex flex-wrap gap-3"><Link href="/inbox" className="rounded-full bg-[#25D366] px-6 py-3 font-bold text-black">Open Wazap Flow <ArrowRight className="ml-2 inline h-4 w-4"/></Link><Link href="/whatsapp" className="rounded-full border border-slate-700 px-6 py-3 font-semibold text-white"><Cable className="mr-2 inline h-4 w-4"/>Connect WhatsApp</Link></div>
      <p className="mt-4 text-xs text-slate-500">WhatsApp sending is live for connected Meta Cloud API accounts. Instagram and Messenger are the next Meta channels and require their respective Meta permissions before activation.</p>
    </section>
    <section className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{capabilities.map(([Icon,title,body])=><article key={title} className="rounded-2xl border border-slate-800 bg-[#111811] p-6"><Icon className="h-6 w-6 text-[#25D366]"/><h2 className="mt-4 text-lg font-bold text-white">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-500">{body}</p></article>)}</section>
    <section className="mt-8 rounded-3xl border border-slate-800 bg-[#111811] p-7"><div className="flex flex-wrap items-center justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-wider text-[#25D366]">One operating loop</p><h2 className="mt-2 text-2xl font-bold text-white">Message → customer → owner → follow-up → outcome</h2><p className="mt-2 text-sm text-slate-500">The inbox and pipeline share the same customer record, so teams can act without copying data between tools.</p></div><Link href="/signup?redirect=/flow" className="rounded-full border border-[#25D366]/40 px-5 py-3 font-semibold text-[#25D366]"><MessageCircle className="mr-2 inline h-4 w-4"/>Start free</Link></div></section>
  </div></main>;
}
