import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "WhatsApp Number Checker & Formatter — Free Tool",
  description: "Check and clean international phone-number formatting, then create direct wa.me links. Free WhatsApp number formatter with no account required.",
  keywords: ["whatsapp number checker", "validate whatsapp numbers", "check whatsapp number online", "whatsapp number validator", "wa.me link generator"],
  alternates: { canonical: "https://wazap.lt/tools/checker" },
  robots: { index: true, follow: true },
  openGraph: { title: "WhatsApp Number Formatter — Wazap", description: "Clean international number formats and generate direct wa.me links without claiming account verification.", url: "https://wazap.lt/tools/checker" },
};


export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="checker" /></>;
}
