import { publicOffers } from "@/lib/marketing-offer";
import { landingFaqs } from "@/lib/landing-faq";
import GrowthResources from "./components/GrowthResources";
import HomeExperience from "./design/HomeExperience";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, CheckCircle2, Clock3, ShieldCheck, Shuffle, Users, Zap } from "lucide-react";

export const metadata: Metadata = {
  title: "WhatsApp Lead Router & Link Rotator for Sales Teams",
  description: "Route WhatsApp leads fairly across your sales team with one trackable link. Start with round-robin distribution—no WhatsApp API or QR scan required.",
  keywords: ["WhatsApp lead router", "WhatsApp link rotator", "WhatsApp round robin", "WhatsApp lead distribution", "route WhatsApp leads"],
  alternates: { canonical: "https://wazap.lt" },
  openGraph: { title: "One WhatsApp link. Every lead routed fairly.", description: "Distribute click-to-WhatsApp leads across your team automatically and track routed handoff activity.", url: "https://wazap.lt" },
};

const jsonLd = {
  "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Wazap WhatsApp Lead Router", url: "https://wazap.lt",
  description: "A WhatsApp link rotator that distributes click-to-chat leads across sales and support teams in round-robin order.",
  applicationCategory: "BusinessApplication", operatingSystem: "Web", offers: publicOffers,
};

// The site's only FAQ: lives in the #faq section of this landing page (see HomeExperience).
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: landingFaqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function HomePage(){return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(jsonLd).replace(/</g,"\\u003c")}}/><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(faqJsonLd).replace(/</g,"\\u003c")}}/><HomeExperience/><GrowthResources/></>;}
