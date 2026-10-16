import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Acceptable Use Policy — Wazap",
  description: "Rules for lawful, consent-based use of Wazap WhatsApp tools, APIs, marketplace packages, AI assistance, and automations.",
  alternates: { canonical: "https://wazap.lt/acceptable-use" },
};

export default function AcceptableUsePage() {
  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-green-900/20 bg-[#0a0f0a]/90 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-[#25D366]" />
            <span className="text-lg font-bold text-[#25D366]">Wazap</span>
          </Link>
        </div>
      </nav>
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-white mb-2">Acceptable Use Policy</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: 16 October 2026</p>

        <div className="space-y-8 text-slate-400 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. Overview</h2>
            <p>This Acceptable Use Policy (&quot;AUP&quot;) sets out the rules for using Wazap&apos;s tools and services. By using Wazap, you agree to follow this policy. Violations may result in immediate account suspension without refund.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. Permitted use</h2>
            <p>You may use Wazap for:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Reaching out to existing customers, leads, or business contacts</li>
              <li>Generating WhatsApp links for your website, marketing materials, or social media</li>
              <li>Managing and distributing WhatsApp leads across your sales team</li>
              <li>Creating business cards, QR codes, and contact tools for your organisation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Prohibited use</h2>
            <p>You must not use Wazap to:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><strong className="text-white">Spam</strong> — sending unsolicited bulk messages to people who have not consented to receive them</li>
              <li><strong className="text-white">Harassment</strong> — contacting individuals who have asked not to be contacted</li>
              <li><strong className="text-white">Fraud or phishing</strong> — impersonating businesses or individuals to deceive recipients</li>
              <li><strong className="text-white">Illegal content</strong> — distributing content that is unlawful in your or the recipient&apos;s jurisdiction</li>
              <li><strong className="text-white">Scraping</strong> — using automated tools to extract data from Wazap</li>
              <li><strong className="text-white">Reverse engineering</strong> — copying, decompiling, or reproducing any part of Wazap&apos;s tools or code</li>
              <li><strong className="text-white">Credential misuse</strong> — sharing API keys publicly, bypassing scopes or rate limits, probing other workspaces, or using webhooks to target private networks</li>
              <li><strong className="text-white">Marketplace abuse</strong> — hiding package behavior, requesting unnecessary access, copying another publisher&apos;s work, distributing malicious code, or bypassing review</li>
              <li><strong className="text-white">Channel bridge abuse</strong> — forging provider events, replaying signed requests, importing customer data without authority, concealing the actual delivery state, or bypassing provider consent and messaging rules</li>
              <li><strong className="text-white">Automation abuse</strong> — using rules to evade human-review controls, conceal actions, manipulate records deceptively, or make prohibited high-impact decisions without appropriate human oversight</li>
              <li><strong className="text-white">Reselling access</strong> — sharing or reselling your account credentials to third parties</li>
              <li><strong className="text-white">Financial incentive schemes</strong> — using Wazap to operate referral commissions, affiliate payouts, cash rewards, investment promotions, or guaranteed-income offers</li>
              <li><strong className="text-white">Unsafe automated decisions</strong> — using AI-assisted features as the sole basis for legal, medical, employment, credit, insurance, housing, or other high-impact decisions</li>
              <li><strong className="text-white">Deceptive AI impersonation</strong> — representing an automated agent as a specific real person or concealing automation where disclosure is legally required</li>
              <li><strong className="text-white">Violating WhatsApp&apos;s policies</strong> — any use that breaches Meta or WhatsApp&apos;s own Terms of Service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. WhatsApp compliance</h2>
            <p>Wazap generates standard wa.me links. You are solely responsible for ensuring that your WhatsApp usage complies with WhatsApp&apos;s Terms of Service. Wazap has no affiliation with Meta or WhatsApp and cannot protect you from WhatsApp account bans resulting from policy violations.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. AI accountability</h2>
            <p>You must review AI-assisted outputs, maintain accurate approved knowledge, respect handoff and approval safeguards, and avoid instructions designed to bypass safety controls. You remain responsible for messages and decisions made using your workspace.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Enforcement</h2>
            <p>We reserve the right to suspend or terminate any account found to be in violation of this policy, without prior notice and without refund. Serious violations may be reported to relevant authorities.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Reporting abuse</h2>
            <p>If you believe someone is misusing Wazap, please report it to <a href="mailto:hello@wazap.lt" className="text-[#25D366] hover:underline">hello@wazap.lt</a>.</p>
          </section>
        </div>

      </div>
    </>
  );
}
