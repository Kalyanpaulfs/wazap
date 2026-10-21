import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "Understand Wazap subscription cancellations, renewal timing, refund eligibility, provider processing, and how to request billing support.",
  alternates: { canonical: "https://wazap.lt/refund" },
};

export default function RefundPage() {
  return (
    <>
      <div className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-text mb-2">Refund Policy</h1>
        <p className="text-muted text-sm mb-10">Last updated: July 2026</p>

        <div className="space-y-8 text-muted text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-text mb-2">1. Free trial</h2>
            <p>New accounts get a one-time 3-day free trial. It costs nothing and needs no payment details, so no refunds apply. When the trial ends, your links pause until you choose a paid plan.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">2. Paid monthly access</h2>
            <p>Paid plans unlock 30 days of access from the payment date unless otherwise agreed in writing.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">3. 7-day refund window</h2>
            <p>New paid subscriptions are eligible for a refund request within <strong className="text-text">7 days</strong> of the initial purchase. Email <a href="mailto:hello@wazap.lt" className="text-accent hover:underline">hello@wazap.lt</a> with your account email, purchase date, and reason. We normally respond within one business day.</p>
            <p className="mt-2 text-muted">Refunds may be declined for abuse, excessive paid-feature usage, chargeback fraud, repeated refund requests, or violations of our terms. This policy does not limit mandatory consumer rights.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">4. After the refund window</h2>
            <p>After 7 days, payments are generally non-refundable unless required by law. Contact support if a billing error or duplicate charge occurs.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">5. Cancellation</h2>
            <p>You may cancel through the billing portal or support. Cancellation stops future renewals; access continues through the paid billing period.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">6. Card payments</h2>
            <p>Subscriptions are processed securely by PayPal or another listed checkout provider. Wazap never stores full card numbers.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">7. Service disruptions</h2>
            <p>In the unlikely event of extended service downtime (more than 72 consecutive hours) caused by Wazap, affected users may be eligible for a pro-rated credit on their next billing cycle. This is at our sole discretion.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-text mb-2">8. Contact</h2>
            <p>For refund requests or billing questions: <a href="mailto:hello@wazap.lt" className="text-accent hover:underline">hello@wazap.lt</a></p>
          </section>
        </div>

      </div>
    </>
  );
}
