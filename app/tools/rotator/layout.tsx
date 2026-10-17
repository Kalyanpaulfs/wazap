import type { Metadata } from "next";
import ToolSeo from "@/app/ToolSeo";
import Link from "next/link";
import { routingOfferText, workspaceTrialText, routerPrivacyText } from "@/lib/marketing-offer";

const description = "Create one WhatsApp link for multiple team numbers. Rotate handoffs, add a predefined message and track destinations. Start with a 3-day free trial — 100 handoffs.";
export const metadata: Metadata = {
  title: "WhatsApp Link Rotator — Round-Robin Lead Routing",
  description,
  alternates: { canonical: "https://wazap.lt/tools/rotator" },
  robots: { index: true, follow: true },
  openGraph: { title: "WhatsApp Link Rotator for Sales Teams | Wazap", description, url: "https://wazap.lt/tools/rotator" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}<ToolSeo k="rotator">
    <section className="mb-12 text-sm leading-7 text-slate-300" aria-labelledby="router-setup-guide">
      <h2 id="router-setup-guide" className="text-2xl font-bold text-white">One WhatsApp link for multiple team numbers</h2>
      <p className="mt-3">A normal click-to-chat link opens one number. A link rotator chooses the next number from your configured team, so you can share one public link on a campaign landing page, social profile or QR code.</p>
      <ol className="mt-5 space-y-4">
        <li className="rounded-2xl border border-slate-800 bg-[#111811] p-5"><h3 className="font-semibold text-white">1. Name the team and add its numbers</h3><p className="mt-2">Sign in, enter a name such as “Property enquiries”, and add at least two WhatsApp numbers. The creation form applies one selected country code to every number: enter the remaining digits without repeating that code. For teams across countries, edit the saved router’s number list using full international numbers, one per line.</p></li>
        <li className="rounded-2xl border border-slate-800 bg-[#111811] p-5"><h3 className="font-semibold text-white">2. Add an optional opening message</h3><p className="mt-2">For example: “Hi, I’d like to arrange a viewing for the property in this campaign.” It is prepared for every destination. The visitor can edit it and decides whether to send it. You can change the message, numbers and fallback number later without replacing the public link.</p></li>
        <li className="rounded-2xl border border-slate-800 bg-[#111811] p-5"><h3 className="font-semibold text-white">3. Check the handoff, then share the link</h3><p className="mt-2">Copy the generated routing URL and check its destination on a phone and desktop. Use a dedicated test link and numbers you control. Test handoffs count towards the account allowance. Never publish the dashboard address as your campaign link.</p></li>
      </ol>
      <p className="mt-4"><Link href="/guides/one-whatsapp-link-multiple-numbers#walkthrough" className="text-[#8be8ac] underline">Watch the actual product walkthrough</Link> · <Link href="/guides/whatsapp-round-robin-routing" className="text-[#8be8ac] underline">Read the round-robin routing checklist</Link></p>
      <h2 className="mt-8 text-xl font-bold text-white">What round-robin routing measures</h2>
      <p className="mt-3">Sequential handoffs take turns across configured numbers. Wazap does not check who is online or guarantee exact ordering during simultaneous requests. Total handoffs and the last 30 days by destination help you review distribution; repeated clicks and abandoned chats can appear in those counts.</p>
      <p className="mt-3">A handoff does not confirm a sent message, a unique lead or a sale. Record received enquiries and qualified appointments separately.</p>
      <h2 className="mt-8 text-xl font-bold text-white">Free trial and paid routing plans</h2>
      <p className="mt-3">{routingOfferText}</p><p className="mt-2">{workspaceTrialText}</p><p className="mt-2">{routerPrivacyText}</p>
      <aside className="mt-8 rounded-2xl border border-[#25D366]/25 bg-[#111811] p-5" aria-labelledby="router-workflow">
        <h2 id="router-workflow" className="text-lg font-semibold text-white">Build the workflow around your link</h2>
        <p className="mt-2">See a <Link href="/solutions/real-estate" className="text-[#8be8ac] underline">real-estate enquiry workflow</Link>, learn how <Link href="/solutions/agencies" className="text-[#8be8ac] underline">agencies manage campaign handoffs</Link>, or use the <Link href="/guides/whatsapp-campaign-tracking" className="text-[#8be8ac] underline">campaign measurement guide</Link>.</p>
        <p className="mt-4"><Link href="/pricing" className="inline-flex rounded-full bg-[#25D366] px-5 py-2 font-semibold text-black">Compare routing plans</Link></p>
      </aside>
    </section></ToolSeo>
  </>;
}
