import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, Users, Fingerprint, Megaphone, Globe2, QrCode, MessageCircle, Copy, BarChart3, Sparkles } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { adLinksAvailable, numbersPerRotatorLimit } from "@/lib/plan-limits";
import { getMyLinks, formatUsageLine, poolFullMessage } from "@/lib/my-links";
import BackLink from "@/app/links/BackLink";

export const metadata = { title: "Create a link — Wazap", robots: { index: false, follow: false } };

export default async function NewLinkPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/links/new");
  const userId = (session.user as { id: string }).id;

  const entitlementUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
  });
  const plan = linkPlan(entitlementUser);
  const planLabel = accountPlanLabel(entitlementUser);
  const { used, limit } = await getMyLinks(userId, plan);

  const poolFull = used >= limit;
  const canCreate = !poolFull;
  const adsAvailable = adLinksAvailable(plan);
  const numbersLimit = numbersPerRotatorLimit(plan);

  // Group 1: the four link types that count against the shared pool. Kept
  // on /links/new/<type> in-app forms (UX-1 step 3/4) instead of sending
  // people to app/tools/* for creation. "WhatsApp link" (UX-1 step 4) is a
  // ShortLink too (same model as Brand link) - it's the Brand form with the
  // custom-address field hidden by default, not a free tool, since it still
  // creates a tracked link that counts toward the pool.
  const linkCards = [
    {
      question: "Share chats across my team",
      name: "Lead rotator",
      desc: `Each new chat goes to the next salesperson. Up to ${numbersLimit} salespeople on your plan.`,
      href: "/links/new/rotator",
      Icon: Users,
      locked: false,
    },
    {
      question: "A WhatsApp link for one number",
      name: "WhatsApp link",
      desc: "A short tracked link that opens your WhatsApp with a ready message. Gets a QR code too.",
      href: "/links/new/brand?simple=1",
      Icon: MessageCircle,
      locked: false,
    },
    {
      question: "One link with my brand name",
      name: "Brand link",
      desc: "wazap.lt/w/yourcompany opens your WhatsApp.",
      href: "/links/new/brand",
      Icon: Fingerprint,
      locked: false,
    },
    {
      question: "Track which ad brings chats",
      name: "Ad link",
      desc: adsAvailable ? "See exactly how many clicks each campaign brings." : "Available on Growth",
      href: adsAvailable ? "/links/new/ad" : "/billing#plans",
      Icon: Megaphone,
      locked: !adsAvailable,
    },
  ];

  // Group 2: free tools. These never count toward the link pool and stay
  // usable even when the pool above is full - and, unlike the Links group,
  // "free" has to be spelled out plainly here since it's the whole point of
  // this group (owner feedback, UX-1 step 4).
  const freeCards = [
    {
      question: "Need a QR code for any number?",
      name: "WhatsApp QR code",
      desc: "A QR code for any WhatsApp number with a ready message. Print it on flyers, cards or your desk.",
      note: "Your links also get their own QR code automatically.",
      href: "/qr",
      Icon: QrCode,
      locked: false,
      badge: "Free · unlimited",
    },
    {
      question: "Add WhatsApp to my website",
      name: "Website button",
      desc: "Add a WhatsApp button to any website. As many as you like, free for every plan.",
      href: "/tools/widget",
      Icon: Globe2,
      locked: false,
      badge: "Free · unlimited",
    },
  ];

  const includedChips = [
    { Icon: QrCode, label: "Free QR code" },
    { Icon: Copy, label: "Copy & share" },
    { Icon: BarChart3, label: "Click tracking" },
  ];

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-5xl space-y-8">
        <BackLink href="/links" label="My links" />
        <header>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Create a link</h1>
          <p className="mt-1 text-slate-400">What do you want to do?</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="mr-1 text-slate-400">Every link includes:</span>
            {includedChips.map(({ Icon, label }) => (
              <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-[#111811] px-3 py-1">
                <Icon className="h-3.5 w-3.5 text-[#25D366]" />
                {label}
              </span>
            ))}
          </div>
        </header>

        {!canCreate && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5" aria-label="Pool full">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">{poolFullMessage(plan, used, limit)}</p>
              <Link href="/billing#plans" className="rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#1fba58]">
                See plans
              </Link>
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Links</h2>
            <p className="text-sm text-slate-400">{formatUsageLine(planLabel, used, limit)}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {linkCards.map(({ question, name, desc, href, Icon, locked }) => {
              const disabled = locked || !canCreate;
              const target = disabled ? "/billing#plans" : href;
              return (
                <Link
                  key={name}
                  href={target}
                  aria-disabled={disabled ? "true" : undefined}
                  className={`flex flex-col gap-3 rounded-2xl border p-5 ${
                    disabled ? "border-slate-800 bg-[#0d130e] opacity-70" : "border-slate-800 bg-[#111811] hover:border-[#25D366]"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-[#25D366]">
                    {locked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </span>
                  <div>
                    <p className="text-sm text-slate-400">{question}</p>
                    <p className="mt-1 font-bold text-white">{name}</p>
                  </div>
                  <p className="text-xs text-slate-500">{!canCreate && !locked ? poolFullMessage(plan, used, limit) : desc}</p>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-white">Free tools</h2>
            <p className="text-sm text-slate-400">Never counted against your plan.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {freeCards.map(({ question, name, desc, href, Icon, locked, badge, note }) => (
              <Link
                key={name}
                href={locked ? "/billing#plans" : href}
                aria-disabled={locked ? "true" : undefined}
                className={`flex flex-col gap-3 rounded-2xl border p-5 ${
                  locked ? "border-slate-800 bg-[#0d130e] opacity-70" : "border-slate-800 bg-[#111811] hover:border-[#25D366]"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-[#25D366]">
                    {locked ? <Lock className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </span>
                  {!locked && (
                    <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-1 text-xs font-semibold text-[#25D366]">
                      {badge}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-sm text-slate-400">{question}</p>
                  <p className="mt-1 font-bold text-white">{name}</p>
                </div>
                <p className="text-xs text-slate-500">{desc}</p>
                {!locked && note && <p className="text-xs text-slate-600">{note}</p>}
              </Link>
            ))}
            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-800 bg-[#0d130e] p-5 opacity-70">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-slate-500">
                <Sparkles className="h-5 w-5" />
              </span>
              <div>
                <p className="mt-1 font-bold text-slate-400">More free tools coming soon</p>
              </div>
              <p className="text-xs text-slate-500">We&apos;re building more. Nothing to do here yet.</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
