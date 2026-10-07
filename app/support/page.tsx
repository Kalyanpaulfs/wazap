import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, HelpCircle, Mail, MessageCircle, ShieldCheck, Upload, Wrench } from "lucide-react";

export const metadata: Metadata = {
  title: "Customer Support — Accounts, Billing and Integrations",
  description: "Get help with Wazap account access, billing, business conversation workflows, contact migration, integrations, and product issues.",
  alternates: { canonical: "https://wazap.lt/support" },
};

const topics = [
  { icon: MessageCircle, title: "Using Wazap tools", body: "Help with click-to-chat links, QR codes, link pages, templates, rotators, widgets, and contact utilities." },
  { icon: CreditCard, title: "Billing and invoices", body: "Paid plans are software access only. Subscription billing, receipts, and payment records are handled through the listed checkout provider." },
  { icon: ShieldCheck, title: "Account access", body: "Get help with login, paid-plan activation, subscription access, or account email issues." },
  { icon: Upload, title: "Contact migration", body: "Get help preparing a plan-safe contact import. Wazap can validate CRM contact files, but cannot manufacture consent or migrate unsupported message history." },
  { icon: Wrench, title: "Bug reports", body: "Tell us the page, browser, device, and steps so we can reproduce and fix the issue quickly." },
];

export default function SupportPage() {
  return (
    <div className="hero-bg min-h-screen px-4 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full border border-[#25D366]/20 bg-[#25D366]/10">
            <HelpCircle className="h-7 w-7 text-[#25D366]" />
          </div>
          <h1 className="text-3xl font-bold text-white">Wazap Support</h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-400">Need help with your account, migration, integrations, billing, or business conversation workflow? Choose the closest topic below or send us a message.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {topics.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <Icon className="mb-3 h-5 w-5 text-[#25D366]" />
              <h2 className="font-semibold text-white">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">{body}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-[#25D366]/20 bg-[#25D366]/10 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-white">Contact support</h2>
              <p className="mt-1 text-sm text-slate-400">Use the contact form for billing, refund, account, migration, integration, or product questions. Include your Wazap account email when relevant.</p>
            </div>
            <Link href="/contact" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#1fba58]">
              <Mail className="h-4 w-4" />
              Contact us
            </Link>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/50 p-5 text-sm leading-6 text-slate-400">
          Support requests are reviewed and prioritized by account, safety, billing, and service impact. Response time varies with demand; Wazap does not currently promise staffed live support seven days a week or a guaranteed response window.
          <Link href="/contact?subject=migration" className="ml-1 font-semibold text-[#25D366]">Request migration help →</Link>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm">
          <Link href="/faq" className="text-[#25D366] hover:underline">FAQ</Link>
          <Link href="/refund" className="text-[#25D366] hover:underline">Refund policy</Link>
          <Link href="/terms" className="text-[#25D366] hover:underline">Terms</Link>
          <Link href="/privacy" className="text-[#25D366] hover:underline">Privacy</Link>
        </div>
      </div>
    </div>
  );
}
