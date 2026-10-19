import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import ToolSeo from "@/app/ToolSeo";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: 'WhatsApp Click-to-Chat Link & Button Builder',
  description: 'Turn any number into a wa.me link with a pre-filled message, plus a ready-made Chat-on-WhatsApp button (HTML + Markdown) for your site, email or bio.',
  keywords: ['whatsapp link generator', 'wa.me link', 'click to chat whatsapp', 'whatsapp chat link', 'whatsapp button generator', 'pre-filled whatsapp message'],
  alternates: { canonical: 'https://wazap.lt/tools/link' },
  openGraph: { title: 'WhatsApp Click-to-Chat Link & Button Builder — Wazap', description: 'Turn any number into a wa.me link with a pre-filled message, plus a ready-made Chat-on-WhatsApp button (HTML + Markdown) for your site, email or bio.', url: 'https://wazap.lt/tools/link' },
};

// UX-1 step 5: a WhatsApp link is now a counted, tracked link type - logged-in
// users get the new in-app create flow instead of this untracked wa.me
// builder. Logged-out visitors still get this public SEO page unchanged
// (same metadata/JSON-LD, via ToolSeo).
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/links/new/brand?simple=1");
  return <>{children}<ToolSeo k="link" /></>;
}
