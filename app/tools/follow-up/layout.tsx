import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "WhatsApp Lead Follow-Up Tracker & Sales Queue",
  description: "Track WhatsApp leads, campaign sources, deal values and next follow-up dates in one focused daily sales queue to organize your next sales actions.",
  alternates: { canonical: "https://wazap.lt/tools/follow-up" },
  openGraph: {
    title: "Wazap Follow-Up — WhatsApp Lead Tracker",
    description: "Know who needs a reply today and record lead sources and sales outcomes.",
    url: "https://wazap.lt/tools/follow-up",
  },
};

export default function FollowUpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="follow-up" /></>;
}
