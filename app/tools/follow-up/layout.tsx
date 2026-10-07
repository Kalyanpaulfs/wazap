import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "WhatsApp Lead Follow-Up Tracker — Never Miss a Lead",
  description: "Track WhatsApp leads, campaign sources, deal values and next follow-up dates in one focused daily sales queue so every prospect gets a timely reply.",
  alternates: { canonical: "https://wazap.lt/tools/follow-up" },
  openGraph: {
    title: "Wazap Follow-Up — WhatsApp Lead Tracker",
    description: "Know who needs a reply today and connect campaign clicks to won sales.",
    url: "https://wazap.lt/tools/follow-up",
  },
};

export default function FollowUpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="follow-up" /></>;
}
