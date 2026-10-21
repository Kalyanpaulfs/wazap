"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";
import BrandLogo from "./components/BrandLogo";
import { LanguageSelector } from "./localization/SiteLocale";
import { buttonClasses } from "./ui/Button";
import ThemeToggle from "./theme/ThemeToggle";

const navigation = [
  { label: "Live demo", href: "/#demo" },
  { label: "How it works", href: "/#how-it-works" },
  { label: "Features", href: "/#features" },
  { label: "Pricing", href: "/pricing" },
];

/** Light site header. Keeps the shared LanguageSelector and the same links as the legacy Navbar. */
export default function Navbar() {
  const { data: session } = useSession();
  const accountHref = session?.user ? "/dashboard" : "/login";
  const accountLabel = session?.user ? "Dashboard" : "Log in";

  return (
    <nav aria-label="Main navigation" className="ds-light sticky top-0 z-50 border-b border-border bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Wazap home" className="flex items-center max-[360px]:w-[104px]">
          <BrandLogo tone="onLight" />
        </Link>
        <div className="flex items-center gap-2 sm:gap-6">
          <div className="hidden items-center gap-7 text-[15px] sm:flex">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="font-medium text-muted transition-colors hover:text-text">
                {item.label}
              </Link>
            ))}
          </div>
          <LanguageSelector />
          <ThemeToggle className="hidden min-[420px]:inline-flex" />
          <Link href={accountHref} className={buttonClasses("primary", "sm", "max-w-[96px] text-center leading-tight sm:max-w-none")}>
            {accountLabel}
          </Link>
          <details className="relative sm:hidden">
            <summary
              className="grid size-11 cursor-pointer list-none place-items-center rounded-full border border-border-strong text-text [&::-webkit-details-marker]:hidden"
              aria-label="Open navigation"
            >
              <Menu size={19} />
            </summary>
            <div className="absolute end-0 top-14 flex w-52 flex-col gap-1 rounded-2xl border border-border bg-surface p-2 shadow-float">
              {navigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-xl px-3 py-3 text-[15px] font-medium text-text hover:bg-surface-2"
                  onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
                >
                  {item.label}
                </Link>
              ))}
              <div className="flex items-center justify-between px-3 pb-1 pt-2 min-[420px]:hidden">
                <span className="text-sm text-muted">Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </details>
        </div>
      </div>
    </nav>
  );
}
