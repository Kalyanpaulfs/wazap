import Link from "next/link";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import PricingPlans from "./PricingPlans";
import PricingViewTracker from "./PricingViewTracker";

export const metadata: Metadata = {
  title: "Pricing — WhatsApp Lead Router Plans",
  description: "Choose a Wazap plan for round-robin WhatsApp lead routing, campaign links, team distribution and conversation-start analytics.",
  keywords: ["whatsapp lead router pricing", "whatsapp link rotator pricing", "whatsapp round robin software", "whatsapp lead distribution"],
  alternates: { canonical: "https://wazap.lt/pricing" },
  openGraph: {
    title: "Wazap Pricing — WhatsApp Lead Routing Plans",
    description: "Route 25 WhatsApp leads free, then scale routing across campaigns and teams from $9/month.",
    url: "https://wazap.lt/pricing",
  },
};

const pricingFaq = [
  { q: "Do I need an account?", a: "Yes for any paid plan. Create your Wazap account first, then pay from the signed-in pricing page." },
  { q: "Is this monthly?", a: "Yes. Solo, Growth, and Agency are monthly subscriptions that renew until cancelled." },
  { q: "How do I pay?", a: "While signed in, pick a plan and pay securely through the listed checkout provider. Your plan activates automatically after payment confirmation." },
  { q: "Why create an account first?", a: "Your Wazap account is where your paid access is stored. This avoids paid orders without a user to activate." },
  { q: "Can I upgrade later?", a: "Yes. Route your first 25 leads free, then upgrade to keep the public routing link active with unlimited routed leads." },
];

const pricingJsonLd = [
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Wazap",
    url: "https://wazap.lt/pricing",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    offers: [
      { "@type": "Offer", name: "Solo", price: "9", priceCurrency: "USD" },
      { "@type": "Offer", name: "Growth", price: "19", priceCurrency: "USD" },
      { "@type": "Offer", name: "Agency", price: "49", priceCurrency: "USD" },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: pricingFaq.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  },
];

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const requestedPlan = (await searchParams).plan;
  const selectedPlan = ["basic", "pro", "ultimate", "business"].includes(requestedPlan ?? "")
    ? requestedPlan ?? null
    : null;
  const isLoggedIn = !!session?.user;
  const userEmail = session?.user?.email ?? null;
  const cardCheckoutEnabled =
    process.env.DODO_ENVIRONMENT === "live_mode" &&
    process.env.DODO_CHECKOUT_ENABLED === "true";

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(pricingJsonLd).replace(/</g, "\\u003c") }} />
      <PricingViewTracker />
      <div className="hero-bg px-4 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-14">
            <h1 className="text-4xl font-bold text-white mb-3">Route Every WhatsApp Lead to the Right Team Member</h1>
            <p className="text-slate-400 text-lg">Route 25 leads free. Upgrade from $9/month to keep your public routing links active with unlimited routed leads.</p>
            <div className="mt-3 flex items-center justify-center gap-3 flex-wrap">
              <div className="inline-flex items-center gap-2 rounded-full bg-[#25D366]/10 border border-[#25D366]/30 px-4 py-1.5 text-sm text-[#25D366]">
                25 routed handoffs free per account · lifetime allowance · no card required
              </div>
              <div className="inline-flex items-center gap-2 rounded-full bg-green-500/10 border border-green-500/30 px-4 py-1.5 text-sm text-green-300">
                Secure monthly checkout
              </div>
            </div>
          </div>

          {/* Free plan strip */}
          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5 mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h3 className="text-white font-semibold">Free</h3>
              <p className="text-slate-500 text-sm mt-0.5">1 WhatsApp rotator · round-robin routing · click totals · no card required</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-white">$0</span>
              <Link href="/signup?redirect=/tools/rotator" className="rounded-full border border-slate-700 hover:border-[#25D366] px-5 py-2 text-sm font-semibold text-slate-300 hover:text-white transition-colors">
                Route 25 Leads Free
              </Link>
            </div>
          </div>

          <PricingPlans isLoggedIn={isLoggedIn} userEmail={userEmail} cardCheckoutEnabled={cardCheckoutEnabled} selectedPlan={selectedPlan} />

          <div className="mt-10 rounded-2xl border border-slate-800 bg-[#111811] p-6 text-center">
            <h2 className="text-xl font-semibold text-white">Paid plans keep your routing links active beyond the free allowance</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">Wazap does not read message content or require access to your WhatsApp account. Visitors are sent directly to the selected WhatsApp number.</p>
          </div>

          <div className="mt-8 rounded-2xl border border-slate-800 bg-[#111811] p-6 text-sm leading-relaxed text-slate-400">
            <h2 className="font-semibold text-white">Software access only</h2>
            <p className="mt-2">
              Payments purchase access to Wazap productivity software and higher usage limits. Wazap does not offer referral bonuses, commissions, affiliate payouts, financial rewards, or earnings opportunities.
            </p>
          </div>

          {/* FAQ */}
          <div className="mt-16 rounded-2xl border border-slate-800 bg-[#111811] p-8">
            <h3 className="text-lg font-semibold text-white mb-6 text-center">Frequently Asked Questions</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pricingFaq.map((faq) => (
                <div key={faq.q}>
                  <h4 className="font-medium text-white mb-1">{faq.q}</h4>
                  <p className="text-sm text-slate-500">{faq.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <footer className="border-t border-slate-800 px-4 py-8 text-center text-sm text-slate-600">
        <p>© 2026 Wazap.lt — Not affiliated with WhatsApp or Meta.</p>
      </footer>
    </>
  );
}
