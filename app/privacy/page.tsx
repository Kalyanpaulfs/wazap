import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy — Wazap",
  description: "How Wazap handles browser-only Open Chat inputs, accounts, billing, analytics, saved leads, shared inbox records, AI, APIs, and workspace data.",
  alternates: { canonical: "https://wazap.lt/privacy" },
};

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-slate-500 text-sm mb-10">Last updated: 16 October 2026</p>

        <div className="space-y-8 text-slate-400 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-2">1. What we collect</h2>
            <p>Wazap collects the minimum data necessary to operate the service:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Email address and name when you create an account</li>
              <li>Your name, email address, international phone number and messages when you request AI or live support. If you separately request newsletters, we record your subscription request, confirmed permission, opt-outs and email delivery events. Newsletter permission is separate from support enquiries. These details link your enquiry and conversation history to Wazap’s private CRM for support and follow-up; submitting an enquiry does not subscribe you to marketing.</li>
              <li>Billing status and payment identifiers supplied by PayPal or another checkout provider; Wazap never receives or stores your full card number</li>
              <li>Usage data (tool used, plan type) for billing and limits</li>
              <li>Lead and inquiry details that a business account saves in Wazap Flow, or that a customer knowingly submits through a Wazap-powered catalog form, such as name, contact number, email, source, requested item, and follow-up status</li>
              <li>Privacy-safe conversation-start events from Wazap links and pages, including the business asset, source, campaign, and time; these events do not contain WhatsApp message content or visitor IP addresses. For link clicks, Wazap also records the visitor's device type, operating system, and approximate country/city, worked out from the visitor's IP address at the time of the click, which is not itself stored.</li>
              <li>Shared inbox records intentionally entered by a business or submitted through a Wazap workflow, including conversation timelines, contact details, assignments, internal notes, tasks, statuses, and channel delivery state</li>
              <li>AI configuration and governance records, including agent instructions, approved knowledge, draft reviews, run status, token and cost metadata when available, errors, and human handoffs</li>
              <li>Developer-platform records, including hashed API-key identifiers, scopes, expiry and use times, request method/path/status/latency, webhook configuration, encrypted signing secrets, event payloads, and delivery results. Bearer tokens are not stored in request logs.</li>
              <li>Marketplace publisher, package, version, security-review, moderation, requested-scope, installation, suspension, uninstall, and abuse-report records; and partner attribution when a business signs up after a valid active partner touch. Partner attribution uses an HttpOnly first-touch token retained for up to 30 days and claimed once at new-workspace signup.</li>
              <li>Channel-connection metadata, encrypted signing credentials, declared capabilities, normalized contact/message fields, provider event identifiers, processing results, and connection health. Arbitrary raw bridge payloads are not retained.</li>
              <li>Automation configuration and audit records, including triggers, conditions, allowed actions, matched entity identifiers, dry-run or execution status, failures, and operational health snapshots. Message text is evaluated only when a rule requires it and is not copied into automation-run context.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">2. What we do NOT collect</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li><strong className="text-white">Numbers used only in the unsaved Open Chat tool</strong> — these remain in your browser and are not sent to Wazap</li>
              <li><strong className="text-white">Your personal WhatsApp app history</strong> — Wazap does not access conversations outside connected Wazap workflows</li>
              <li><strong className="text-white">Open Chat message text</strong> — text entered in the browser-only Open Chat tool is not sent to Wazap. Messages and contact records intentionally received, recorded, or sent through connected workspace channels are stored as described above.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">3. Local storage</h2>
            <p>The &quot;Recent&quot; numbers shown in the tool are stored in your browser&apos;s local storage. This data never leaves your device. You can clear it at any time by clicking the delete icon next to each entry or clearing your browser data.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">4. Cookies</h2>
            <p>We use a session cookie for authentication when you are logged in. If you choose a website language, a functional preference cookie and a matching local browser preference remember it for up to one year. The initial language is chosen from an approximate country lookup performed locally on our server, with browser language as a fallback; this lookup does not send your IP address to an external translation or location service. You can override the default or choose Auto to remove your saved language preference. Optional Google Analytics is loaded only after you explicitly accept analytics cookies; rejecting or making no choice prevents the Analytics script from loading. Advertising storage remains disabled. Wazap also records limited first-party product metrics such as country, language, page path, referral domain, signup, tool activation, and checkout status so we can improve reliability and localization. We do not store visitor IP addresses in this first-party analytics data.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">5. Third-party services</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li><strong className="text-white">PayPal or another listed checkout provider</strong> — used for subscription billing, receipts, refunds, and payment records</li>
              <li><strong className="text-white">WhatsApp / Meta</strong> — links open WhatsApp directly; we have no affiliation with Meta</li>
              <li><strong className="text-white">AI model provider, when explicitly enabled</strong> — the minimum relevant conversation context, workspace instructions, and approved knowledge may be processed to produce a draft. Wazap displays provider readiness and does not claim model execution while no verified provider is configured.</li>
              <li><strong className="text-white">Webhook destinations configured by a workspace</strong> — subscribed business events are delivered to the HTTPS endpoint selected by that workspace. Workspace owners are responsible for the destination&apos;s security and lawful handling.</li>
              <li><strong className="text-white">Channel bridges configured by a workspace</strong> — a workspace or its integration provider may send signed, normalized inbound events to Wazap. The workspace remains responsible for consent, provider terms, and the lawful transfer of customer data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">6. Data retention</h2>
            <p>Account, saved workflow, lead, inquiry, marketplace installation, and attribution data is retained while the relevant business account is active. Signed-in customers can download a portable JSON export covering account, billing, tools, workspace conversations, CRM, tasks, AI governance, automations, channel events, API and webhook evidence, Store activity, partner attribution, and support records. Passwords, reset tokens, authentication hashes, encrypted credentials, and secret URL parameters are excluded. Customers can also schedule account deletion from Account settings. Closure includes a seven-day recovery period and is blocked while an active subscription exists. After the recovery period, workspace, conversation, CRM, automation, and credential records are deleted. Limited pseudonymized transaction records and records held by payment providers may be retained where required for financial, fraud-prevention, or legal obligations. Customers who submitted an inquiry may contact the business they submitted it to or Wazap to request access or deletion.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-2">7. Contact</h2>
            <p>For any privacy questions: <a href="mailto:hello@wazap.lt" className="text-[#25D366] hover:underline">hello@wazap.lt</a></p>
          </section>
        </div>

      </div>
    </>
  );
}
