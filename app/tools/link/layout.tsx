import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";

export const metadata: Metadata = {
  title: 'WhatsApp Click-to-Chat Link & Button Builder',
  description: 'Turn any number into a wa.me link with a pre-filled message, plus a ready-made Chat-on-WhatsApp button (HTML + Markdown) for your site, email or bio.',
  keywords: ['whatsapp link generator', 'wa.me link', 'click to chat whatsapp', 'whatsapp chat link', 'whatsapp button generator', 'pre-filled whatsapp message'],
  alternates: { canonical: 'https://wazap.lt/tools/link' },
  openGraph: { title: 'WhatsApp Click-to-Chat Link & Button Builder — Wazap', description: 'Turn any number into a wa.me link with a pre-filled message, plus a ready-made Chat-on-WhatsApp button (HTML + Markdown) for your site, email or bio.', url: 'https://wazap.lt/tools/link' },
};


export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="link" /></>;
}
