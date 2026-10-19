import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import ToolSeo from "@/app/ToolSeo";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: 'WhatsApp Branded Short Links + Click Analytics',
  description: 'Create branded wazap.lt/w/ links that open a WhatsApp chat and track every click. Custom slug, pre-filled message, live analytics.',
  keywords: ['whatsapp short link', 'branded whatsapp link', 'whatsapp link with tracking', 'whatsapp link analytics', 'custom wa.me link', 'whatsapp bio link'],
  alternates: { canonical: 'https://wazap.lt/tools/shortlink' },
  openGraph: { title: 'WhatsApp Branded Short Links + Click Analytics — Wazap', description: 'Create branded wazap.lt/w/ links that open a WhatsApp chat and track every click. Custom slug, pre-filled message, live analytics.', url: 'https://wazap.lt/tools/shortlink' },
};

// UX-1 step 4: logged-in users get the new in-app create flow instead of the
// old app page below; logged-out visitors still get this public SEO page
// unchanged (same metadata/JSON-LD, via ToolSeo).
export default async function Layout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/links/new/brand");
  return <>{children}<ToolSeo k="shortlink" /></>;
}
