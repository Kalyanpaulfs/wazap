import ToolSeo from "@/app/ToolSeo";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Free WhatsApp Chat Analyzer & Insights",
  description:
    "Analyze an exported WhatsApp chat privately in your browser. See busiest hours, message totals, word counts and participant message share.",
  alternates: { canonical: "https://wazap.lt/tools/chat-insights" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="chat-insights" /></>;
}
