import Link from "next/link";
import BrandLogo from "./components/BrandLogo";

type FooterLink = [href: string, label: string];

const groups: { title: string; links: FooterLink[] }[] = [
  {
    title: "Product",
    links: [
      ["/whatsapp-lead-routing", "Lead routing"],
      ["/whatsapp-ad-tracking", "Ad tracking"],
      ["/whatsapp-short-links", "WhatsApp links"],
      ["/whatsapp-website-widget", "Website button"],
      ["/tools", "Free tools"],
      ["/pricing", "Pricing"],
    ],
  },
  {
    title: "Workspace",
    links: [["/dashboard", "Home"], ["/links", "My links"], ["/results", "Results"], ["/billing", "Plan & billing"], ["/account", "Account & data"]],
  },
  {
    title: "Support & company",
    links: [["/support", "Help & support"], ["/contact", "Contact us"], ["/resources", "Guides & comparisons"], ["/#faq", "FAQ"], ["/about", "About Wazap"], ["/languages", "Languages"]],
  },
  {
    title: "Legal",
    links: [["/privacy", "Privacy"], ["/terms", "Terms"], ["/refund", "Refunds"], ["/cookie", "Cookies"], ["/acceptable-use", "Acceptable use"], ["/api-policy", "API policy"], ["/partner-terms", "Partner terms"]],
  },
];

/**
 * The one footer for the whole site. "site" (landing and public pages) centres
 * its content; "app" (signed-in workspace) left-aligns with the page gutter.
 * Bottom padding keeps the last row clear of the floating support bubble.
 */
export default function Footer({ variant = "site" }: { variant?: "site" | "app" }) {
  return (
    <footer className={`wp-footer ${variant === "site" ? "is-site ds-light" : ""}`}>
      <div className="wp-footer-grid">
        <div className="wp-footer-brand">
          <Link href="/" aria-label="Wazap home" className="inline-flex"><BrandLogo tone="onLight" width={104} /></Link>
          <p>Route WhatsApp leads, track every click and keep your team organised.</p>
          <a href="mailto:hello@wazap.lt">hello@wazap.lt</a>
        </div>
        {groups.map((group) => (
          <nav key={group.title} aria-label={`Footer ${group.title}`}>
            <h2>{group.title}</h2>
            <ul>
              {group.links.map(([href, label]) => <li key={href}><Link href={href}>{label}</Link></li>)}
            </ul>
          </nav>
        ))}
      </div>
      <div className="wp-footer-bar">
        <span>© {new Date().getFullYear()} Wazap.lt · Independent service. Not affiliated with WhatsApp or Meta.</span>
        <span>Business conversations, organised.</span>
      </div>
    </footer>
  );
}
