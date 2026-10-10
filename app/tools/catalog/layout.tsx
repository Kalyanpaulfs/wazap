import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: 'WhatsApp Catalog & Order Page Builder',
  description: 'Publish a shareable WhatsApp catalog / order page. Every product has an Order-on-WhatsApp button with a pre-filled order.',
  keywords: ['whatsapp catalog', 'whatsapp order page', 'sell on whatsapp', 'whatsapp store page', 'whatsapp product catalog', 'order via whatsapp'],
  alternates: { canonical: 'https://wazap.lt/tools/catalog' },
  openGraph: { title: 'WhatsApp Catalog & Order Page Builder — Wazap', description: 'Publish a shareable WhatsApp catalog / order page. Every product has an Order-on-WhatsApp button with a pre-filled order.', url: 'https://wazap.lt/tools/catalog' },
};


export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="catalog" /></>;
}
