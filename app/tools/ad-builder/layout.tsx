import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "WhatsApp Ad Link Builder with UTM Tracking",
  description: "Create UTM-tagged WhatsApp links for Facebook and Google ads. Track clicks in one dashboard and identify which campaigns start conversations.",
  keywords: ["click to whatsapp ads", "whatsapp utm link generator", "whatsapp ad tracking", "facebook click to whatsapp", "whatsapp campaign tracker", "google ads whatsapp"],
  alternates: { canonical: "https://wazap.lt/tools/ad-builder" },
  openGraph: { title: "WhatsApp Ad Link Builder with Click Tracking — Wazap", description: "Track every click on your WhatsApp ad links. UTM tagging, click dashboard, multiple campaigns.", url: "https://wazap.lt/tools/ad-builder" },
};


export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="ad-builder" /></>;
}
