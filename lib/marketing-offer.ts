import { PLAN_PRICES } from "@/lib/billing";

// Public self-service offers. This module does not change billing or entitlements.
export const marketingPlans = [
  { name: "Solo", price: PLAN_PRICES.basic },
  { name: "Growth", price: PLAN_PRICES.pro },
  { name: "Agency", price: PLAN_PRICES.ultimate },
];
export const routingOfferText = "Every new account gets a 3-day free trial with unlimited routed handoffs across all rotators. Paid routing starts at $9/month after the trial.";
export const workspaceTrialText = "The 3-day free trial includes everything in Solo, with unlimited routed leads while it lasts.";
export const routerPrivacyText = "Link routing records handoff activity and destinations; it does not read the messages you send in WhatsApp. Connected inbox workflows can store messages and conversation records. See the privacy policy for those features.";
export const publicOffers = {
  "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: "0", highPrice: String(PLAN_PRICES.ultimate), offerCount: 4,
  offers: [
    { "@type": "Offer", name: "Free trial", price: "0", priceCurrency: "USD", description: "3-day free trial with everything in Solo, no card required", url: "https://wazap.lt/pricing" },
    ...marketingPlans.map(plan => ({ "@type": "Offer", name: `${plan.name} monthly`, price: String(plan.price), priceCurrency: "USD", url: "https://wazap.lt/pricing" })),
  ],
};
