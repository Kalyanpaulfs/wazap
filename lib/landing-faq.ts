// FAQ shown on the public landing page (app/page.tsx + app/design/HomeExperience.tsx)
// and used to build the page's FAQPage JSON-LD. This is the only FAQ on the site —
// keep it in sync with app/pricing/PricingPlans.tsx and lib/billing.ts for plan facts.
export interface LandingFaq {
  q: string;
  a: string;
}

export const landingFaqs: LandingFaq[] = [
  {
    q: "What is Wazap?",
    a: "Wazap is a set of free and paid WhatsApp tools built around one core job: routing WhatsApp leads fairly across your team. Add your team's WhatsApp numbers, share one link, and each click opens a chat with the next person in rotation.",
  },
  {
    q: "How does WhatsApp lead routing work?",
    a: "Add two or more WhatsApp numbers and share your routing link. Each click opens WhatsApp with the next number in your rotation. Wazap records the routing event; it does not read the resulting conversation.",
  },
  {
    q: "Do I need the WhatsApp Business API or a QR login scan?",
    a: "No. Wazap's tools use standard WhatsApp click-to-chat links and QR codes that work with any WhatsApp number — no Business API, no approval process, and no QR login scan required.",
  },
  {
    q: "What does the Ad Link Builder do?",
    a: "It creates WhatsApp links with UTM tracking parameters (source, medium, campaign) for paid ads, so you can compare recorded click activity per link in your dashboard. Received messages and sales still need separate verification.",
  },
  {
    q: "What plans are available?",
    a: "Free ($0), Solo ($9/month), Growth ($19/month) and Agency ($49/month). Free includes 25 routed leads as a lifetime allowance; paid plans unlock unlimited routed leads and more rotator links, with up to 25 rotators on Agency.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. New accounts get a 3-day free trial of Solo (the $9/month plan), no card required. The trial includes Solo's rotator, short-link and widget limits, and 100 routed leads. After the trial, the free allowance of 25 lifetime leads applies again, so choose a plan to keep routing, or continue on Free limits.",
  },
  {
    q: "What's included in the free allowance, and does it reset?",
    a: "Your first 25 routed leads are free, as a one-time lifetime allowance — it does not reset daily. Choose a paid plan from the pricing page to keep routing after that.",
  },
  {
    q: "Can I upgrade or change my team without replacing my link?",
    a: "Yes to both. Route your first 25 leads free, then upgrade anytime to keep your public routing link active with unlimited routed leads. You can also update the destination numbers behind an existing rotator at any time — the same link keeps reaching your current team.",
  },
  {
    q: "Does a tracked click mean a message was sent or a sale was made?",
    a: "No. A routing event or click only shows that a visitor was directed to a WhatsApp destination. It does not confirm that they sent a message, that they are a unique customer, or that a sale happened.",
  },
  {
    q: "Is Wazap affiliated with WhatsApp or Meta, and is my account safe?",
    a: "No, Wazap is independent and not affiliated with, endorsed by, or supported by WhatsApp Inc. or Meta Platforms. Its link and QR tools don't connect to your WhatsApp account or read your messages — a click just opens a normal WhatsApp chat. See our privacy policy for details.",
  },
];
