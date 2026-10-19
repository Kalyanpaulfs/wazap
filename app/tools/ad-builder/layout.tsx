import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import ToolSeo from "@/app/ToolSeo";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "WhatsApp Ad Link Builder with UTM Tracking",
  description: "Create UTM-tagged WhatsApp links for Facebook and Google ads. Track clicks in one dashboard and identify which campaigns start conversations.",
  keywords: ["click to whatsapp ads", "whatsapp utm link generator", "whatsapp ad tracking", "facebook click to whatsapp", "whatsapp campaign tracker", "google ads whatsapp"],
  alternates: { canonical: "https://wazap.lt/tools/ad-builder" },
  openGraph: { title: "WhatsApp Ad Link Builder with Click Tracking — Wazap", description: "Track every click on your WhatsApp ad links. UTM tagging, click dashboard, multiple campaigns.", url: "https://wazap.lt/tools/ad-builder" },
};

// UX-1 step 4: logged-in users get the new in-app create flow instead of the
// old app page below; logged-out visitors still get this public SEO page
// unchanged (same metadata/JSON-LD, via ToolSeo).
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/links/new/ad");
  return <>{children}<ToolSeo k="ad-builder" /></>;
}
