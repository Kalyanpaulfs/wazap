import BrandLogo from "./components/BrandLogo";
import Link from "next/link";

const groups = [
  { title: "Tools", links: [["/tools/rotator", "Lead rotator"], ["/pricing", "Pricing"], ["/tools", "Free tools"]] },
  {
    title: "Products",
    links: [
      ["/whatsapp-lead-routing", "Lead routing"],
      ["/whatsapp-ad-tracking", "Ad tracking"],
      ["/whatsapp-short-links", "WhatsApp links"],
      ["/whatsapp-website-widget", "Website button"],
    ],
  },
  { title: "Help & company", links: [["/resources", "Guides & comparisons"], ["/#faq", "FAQ"], ["/contact", "Contact"], ["/about", "About Wazap"], ["/languages", "Languages"]] },
];

const policies = [["/refund", "Refunds"], ["/cookie", "Cookies"], ["/acceptable-use", "Acceptable use"], ["/api-policy", "API policy"], ["/partner-terms", "Partner terms"]];

export default function Footer() {
  return (
    <footer className="mt-auto border-t border-white/10 px-6 pt-12 pb-7 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 pb-10 md:grid-cols-[minmax(0,1.1fr)_1fr_1fr_1fr] md:gap-12">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" aria-label="Wazap home" className="inline-flex"><BrandLogo /></Link>
            <p className="mt-4 max-w-xs text-sm leading-6 text-slate-400">One link. The right conversation.</p>
          </div>
          {groups.map(group => (
            <nav key={group.title} aria-label={`Footer ${group.title}`}>
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-300">{group.title}</h2>
              <ul className="space-y-3">
                {group.links.map(([href, label]) => (
                  <li key={href}><Link href={href} className="inline-block py-1 text-sm text-slate-400 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-400">{label}</Link></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <div className="flex flex-col gap-5 border-t border-white/10 pt-6 md:flex-row md:items-start md:justify-between">
          <div className="text-xs leading-5 text-slate-500">
            <p>© {new Date().getFullYear()} Wazap.lt</p>
            <p>Independent service. Not affiliated with WhatsApp or Meta.</p>
          </div>
          <nav aria-label="Footer legal" className="flex flex-wrap items-start gap-x-6 gap-y-3 text-xs text-slate-400">
            <Link href="/privacy" className="py-1 hover:text-white">Privacy</Link>
            <Link href="/terms" className="py-1 hover:text-white">Terms</Link>
            <details className="max-w-64">
              <summary className="cursor-pointer py-1 hover:text-white">More policies</summary>
              <ul className="mt-3 space-y-3 pb-2">
                {policies.map(([href, label]) => <li key={href}><Link href={href} className="inline-block py-1 hover:text-white">{label}</Link></li>)}
              </ul>
            </details>
          </nav>
        </div>
      </div>
    </footer>
  );
}
