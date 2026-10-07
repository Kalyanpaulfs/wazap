import { PLAN_PRICES } from "@/lib/billing";

// Public self-service offers. This module does not change billing or entitlements.
export const marketingPlans = [
  { name: "Solo", price: PLAN_PRICES.basic },
  { name: "Growth", price: PLAN_PRICES.pro },
  { name: "Agency", price: PLAN_PRICES.ultimate },
];
export const routingOfferText = "25 routed handoffs free per account, across all rotators. This is a lifetime allowance, not a daily reset. Paid routing starts at $9/month.";
export const workspaceTrialText = "The 14-day Growth workspace trial is separate from the free router allowance. It does not make routing unlimited.";
export const routerPrivacyText = "Link routing records handoff activity and destinations; it does not read the messages you send in WhatsApp. Connected inbox workflows can store messages and conversation records. See the privacy policy for those features.";
export const publicOffers = {
  "@type": "AggregateOffer", priceCurrency: "USD", lowPrice: "0", highPrice: String(PLAN_PRICES.ultimate), offerCount: 4,
  offers: [
    { "@type": "Offer", name: "Free router allowance", price: "0", priceCurrency: "USD", description: "25 routed handoffs per account, lifetime allowance", url: "https://wazap.lt/pricing" },
    ...marketingPlans.map(plan => ({ "@type": "Offer", name: `${plan.name} monthly`, price: String(plan.price), priceCurrency: "USD", url: "https://wazap.lt/pricing" })),
  ],
};
