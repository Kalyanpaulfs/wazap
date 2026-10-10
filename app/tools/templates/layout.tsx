import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: 'WhatsApp Message Templates — Free Copy-Paste',
  description: 'Ready-to-use WhatsApp message templates for sales, support, real estate and e-commerce. Fill the blanks, copy, and paste into WhatsApp.',
  keywords: ['whatsapp message templates', 'whatsapp templates free', 'whatsapp sales messages', 'whatsapp follow up message', 'whatsapp business message examples'],
  alternates: { canonical: 'https://wazap.lt/tools/templates' },
  openGraph: { title: 'WhatsApp Message Templates — Free Copy-Paste — Wazap', description: 'Ready-to-use WhatsApp message templates for sales, support, real estate and e-commerce. Fill the blanks, copy, and paste into WhatsApp.', url: 'https://wazap.lt/tools/templates' },
};


export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="templates" /></>;
}
