import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms governing Wazap accounts, WhatsApp workflow tools, subscriptions, APIs, AI assistance, and marketplace packages.",
  alternates: { canonical: "https://wazap.lt/terms" },
};

export default function TermsPage() {
  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-text mb-2">Terms of Use</h1>
        <p className="text-muted text-sm mb-10">Last updated: 16 October 2026</p>

        <div className="space-y-8 text-muted text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-text mb-2">1. Acceptance</h2>
            <p>By using Wazap (&quot;the Service&quot;), you agree to these terms. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">2. What Wazap does</h2>
            <p>Wazap provides business-conversation productivity software, including click-to-chat tools, lead tracking, signed inbound channel bridges, tasks, analytics, and governed AI-assistance controls. A message is only represented as transmitted when a supported channel provider confirms that action; manually recorded or approved drafts are labelled accordingly.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">3. Acceptable use</h2>
            <p>You agree to use Wazap only for lawful purposes. You must not use the Service to:</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Send spam, unsolicited messages, or harassment</li>
              <li>Violate WhatsApp&apos;s Terms of Service</li>
              <li>Engage in fraud, phishing, or any illegal activity</li>
              <li>Scrape or copy the Service&apos;s code, content, or design</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">4. Subscriptions & billing</h2>
            <ul className="list-disc ml-5 space-y-1">
              <li>Paid plans are monthly software subscriptions processed by PayPal or another listed checkout provider</li>
              <li>Subscriptions renew automatically until cancelled</li>
              <li>Cancellation stops future renewals while access continues through the paid period</li>
              <li>Refunds are handled under the refund policy published on the Service</li>
              <li>We reserve the right to change pricing with 30 days notice</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">5. Software-only purchase</h2>
            <p>Payments purchase access to Wazap productivity software and usage limits only. Wazap does not provide affiliate commissions, referral bonuses, cash rewards, payouts, investment products, cryptocurrency products, gambling, games, or income opportunities.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">6. AI-assisted features</h2>
            <p>AI outputs may be incomplete or incorrect and must be reviewed for the customer&apos;s context. Workspace owners are responsible for instructions, approved knowledge, and the lawful use of outputs. Wazap may require human approval or handoff and may prevent autonomous actions when delivery, safety, or provider requirements are not satisfied.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">7. API and integrations</h2>
            <p>You are responsible for protecting API keys and webhook secrets, granting least-privilege scopes, validating webhook signatures, securing destination systems, and complying with rate limits and applicable law. Wazap may revoke credentials or disable endpoints that threaten service reliability or security.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">8. Intellectual property</h2>
            <p>Wazap&apos;s code, design, branding and first-party content are owned by Wazap. Marketplace publishers retain responsibility for and rights to their submitted content, and grant Wazap permission to review, display, distribute, and operate it through the Service. Wazap may reject, suspend, or remove packages for safety, quality, legal, or reliability reasons.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">9. Marketplace and partner attribution</h2>
            <p>Marketplace packages declare requested access and require workspace approval before installation. Publishers must keep manifests accurate and may not conceal behavior or collect data beyond declared scopes. Partner profiles currently provide referral attribution only; no commission, reward, or payout is promised or enabled.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">10. Channel connections</h2>
            <p>Workspace administrators are responsible for protecting channel signing credentials, using fresh timestamps and unique event identifiers, supplying only authorized customer data, and following each channel provider&apos;s terms. A connection marked inbound-only cannot send messages. Verification confirms control of the signing secret, not approval or endorsement by the named channel provider.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">11. Analytics</h2>
            <p>Wazap provides reports and counters, such as chat and click counts, derived from recorded workspace activity. Analytics are provided for informational purposes and should not be treated as audited financial statements.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">12. Disclaimer</h2>
            <p>Wazap is not affiliated with, endorsed by, or connected to WhatsApp LLC or Meta Platforms, Inc. WhatsApp is a trademark of WhatsApp LLC.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">13. Limitation of liability</h2>
            <p>Wazap is provided &quot;as is&quot; without warranties of any kind. We are not liable for any damages arising from your use of the Service, including but not limited to loss of data, revenue, or WhatsApp account suspension.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">14. Contact</h2>
            <p>For legal or billing enquiries: <a href="mailto:hello@wazap.lt" className="text-accent hover:underline">hello@wazap.lt</a></p>
          </section>
        </div>

      </div>
    </>
  );
}
