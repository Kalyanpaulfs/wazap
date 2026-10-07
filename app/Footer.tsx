import Link from "next/link";
import { MessageCircle } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-slate-800 px-4 py-10 mt-auto">
      <div className="mx-auto max-w-4xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-[#25D366]" />
          <span className="font-bold text-white">Wazap</span>
        </Link>
        <div className="flex gap-4 text-xs text-slate-500 flex-wrap justify-center">
          <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
          <Link href="/tools/rotator" className="hover:text-white transition-colors">WhatsApp Lead Router</Link>
          <Link href="/resources" className="hover:text-white transition-colors">Guides &amp; Comparisons</Link>
          <Link href="/solutions/real-estate" className="hover:text-white transition-colors">Real Estate Teams</Link>
          <Link href="/solutions/agencies" className="hover:text-white transition-colors">Marketing Agencies</Link>
          <Link href="/tools" className="hover:text-white transition-colors">Free Tools</Link>
          <Link href="/api-policy" className="hover:text-white transition-colors">API Policy</Link>
          <Link href="/partner-terms" className="hover:text-white transition-colors">Partner Terms</Link>
          <Link href="/tools/ad-builder" className="hover:text-white transition-colors">Ad Tracking</Link>
          <Link href="/tools/follow-up" className="hover:text-white transition-colors">Lead Follow-Up</Link>
          <Link href="/about" className="hover:text-white transition-colors">About</Link>
          <Link href="/faq" className="hover:text-white transition-colors">FAQ</Link>
          <Link href="/newsletter" className="hover:text-white transition-colors">Newsletter</Link>
          <Link href="/contact" className="hover:text-white transition-colors">Contact</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          <Link href="/refund" className="hover:text-white transition-colors">Refunds</Link>
          <Link href="/cookie" className="hover:text-white transition-colors">Cookies</Link>
          <Link href="/acceptable-use" className="hover:text-white transition-colors">Acceptable Use</Link>
        </div>
        <p className="text-xs text-slate-600 text-center sm:text-right">
          © 2026 Wazap.lt · Not affiliated with WhatsApp or Meta
        </p>
      </div>
    </footer>
  );
}
