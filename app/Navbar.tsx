"use client";

import { LanguageSelector } from "./localization/SiteLocale";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { MessageCircle, Menu } from "lucide-react";

const navigation = [
  { label: "Live demo", href: "/#demo" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
];

export default function Navbar() {
  const { data: session } = useSession();
  const accountHref = session?.user ? "/dashboard" : "/login";
  const accountLabel = session?.user ? "Dashboard" : "Log in";
  return (
    <nav aria-label="Main navigation" className="sticky top-0 z-50 border-b border-green-900/20 bg-[#0a0f0a]/92 backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <Link href="/" aria-label="Wazap home" className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6 text-[#25D366]" />
          <span className="text-lg font-bold gradient-text">Wazap</span>
        </Link>
        <div className="flex items-center gap-3 sm:gap-6">
        <div className="hidden sm:flex items-center gap-6 text-sm">
          {navigation.map(item => <Link key={item.href} href={item.href} className="text-slate-300 hover:text-[#25D366] transition-colors">{item.label}</Link>)}
        </div>
        <LanguageSelector />
        <Link href={accountHref} className="max-w-[90px] sm:max-w-none text-center leading-tight rounded-full bg-[#25D366] px-4 py-2 text-sm font-semibold text-black hover:bg-[#1fba58] transition-colors">{accountLabel}</Link>
        <details className="sm:hidden relative">
          <summary className="cursor-pointer rounded-full border border-green-900 p-2 text-sm text-slate-300" aria-label="Open navigation"><Menu size={19} /></summary>
          <div className="absolute right-0 top-12 w-48 rounded-2xl border border-green-900 bg-[#101810] p-4 flex flex-col gap-4 text-sm">
            {navigation.map(item => <Link key={item.href} href={item.href} className="text-slate-300 hover:text-[#25D366] transition-colors" onClick={event => event.currentTarget.closest("details")?.removeAttribute("open")}>{item.label}</Link>)}
          </div>
        </details>
        </div>
      </div>
    </nav>
  );
}
