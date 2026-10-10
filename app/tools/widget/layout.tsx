import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: "WhatsApp Widget Generator for Websites",
  description: "Generate a floating WhatsApp chat button for your website in seconds. Customise colour, position and label. Preview the button and copy embeddable HTML within your account allowance.",
  keywords: ["whatsapp widget", "whatsapp chat button website", "embed whatsapp button", "whatsapp website widget", "click to chat whatsapp", "free whatsapp button"],
  alternates: { canonical: "https://wazap.lt/tools/widget" },
  openGraph: { title: "Free WhatsApp Widget Generator — Wazap", description: "Add a floating WhatsApp button to any website with one line of code. Free, customisable, instant.", url: "https://wazap.lt/tools/widget" },
};


export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="widget" /></>;
}
