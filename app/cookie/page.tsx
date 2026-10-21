import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Learn how Wazap uses required authentication cookies, optional consent-based analytics, and browser local storage for private tool preferences.",
  alternates: { canonical: "https://wazap.lt/cookie" },
};

export default function CookiePage() {
  return (
    <>
      <div className="w-full min-w-0 max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-text mb-2">Cookie Policy</h1>
        <p className="text-muted text-sm mb-10">Last updated: July 2026</p>

        <div className="space-y-8 text-muted text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-text mb-2">1. What are cookies?</h2>
            <p>Cookies are small text files stored on your device by your browser. They help websites remember your preferences and keep you logged in between sessions.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">2. Cookies we use</h2>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 pr-4 text-text font-semibold">Cookie</th>
                    <th className="text-left py-2 pr-4 text-text font-semibold">Purpose</th>
                    <th className="text-left py-2 text-text font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-2 pr-4 font-mono text-muted">wazap_site_language</td>
                    <td className="py-2 pr-4">Remembers the website language you select, with a matching local browser preference for reliable reloads. Choosing Auto removes both preferences.</td>
                    <td className="py-2">Up to 1 year</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-muted">next-auth.session-token</td>
                    <td className="py-2 pr-4">Keeps you logged in to your account</td>
                    <td className="py-2">30 days</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-muted">next-auth.csrf-token</td>
                    <td className="py-2 pr-4">Security — prevents cross-site request forgery</td>
                    <td className="py-2">Session</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-mono text-muted">_ga, _ga_*</td>
                    <td className="py-2 pr-4">Optional Google Analytics measurement after you accept analytics</td>
                    <td className="py-2">Up to 2 years</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3">We do not use advertising cookies. Google Analytics loads only after you select <strong className="text-text">Accept analytics</strong>; rejecting it does not affect the free tools or your account.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">3. Local storage</h2>
            <p>In addition to cookies, Wazap uses your browser&apos;s local storage to save your recent phone number history. This data is stored <strong className="text-text">only on your device</strong> and is never sent to our servers. You can clear it at any time by removing entries in the tool or clearing your browser data.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">4. Managing cookies</h2>
            <p>You can accept or reject optional analytics in Wazap&apos;s consent notice. Your choice is saved in local storage under <span className="font-mono text-muted">wazap_analytics_consent</span>; clearing Wazap&apos;s site data resets the choice. Disabling required cookies will prevent you from staying logged in, but the free tools will still work.</p>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Chrome cookie settings</a></li>
              <li><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Firefox cookie settings</a></li>
              <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Safari cookie settings</a></li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">5. Contact</h2>
            <p>Questions about cookies or data: <a href="mailto:hello@wazap.lt" className="text-accent hover:underline">hello@wazap.lt</a></p>
          </section>
        </div>

      </div>
    </>
  );
}
