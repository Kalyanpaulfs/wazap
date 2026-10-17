import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Link2, MessageCircle, Users, Zap } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPerformanceSnapshot } from "@/lib/performance";
import { reportsTier } from "@/lib/plan-limits";
import { routerQuota } from "@/lib/router-entitlements";
import { accountPlanLabel, isProductTrialActive, trialDaysLeft } from "@/lib/entitlements";
import CopyLinkButton from "./CopyLinkButton";

export const metadata = { title: "Performance — Wazap", robots: { index: false, follow: false } };

function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return "—";
  const diffMs = now.getTime() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

export default async function PerformancePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/performance");

  const userId = (session.user as { id: string }).id;
  const plan = (session.user as { plan?: string }).plan ?? "free";
  const tier = reportsTier(plan);

  const [data, routerUser, rotatorLeadsUsed] = await Promise.all([
    getPerformanceSnapshot(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true, createdAt: true },
    }),
    prisma.conversationStart.count({ where: { userId, assetType: "rotator" } }),
  ]);

  const { totals, daily, perLink } = data;
  const maxDaily = Math.max(1, ...daily.map((day) => day.count));
  const peakDay = daily.reduce((best, day) => (day.count > best.count ? day : best), daily[0]);
  const hasLinks = totals.linksLive > 0;
  const now = new Date();

  const planName = accountPlanLabel(routerUser, now);
  const quota = routerQuota(routerUser, rotatorLeadsUsed, now);
  const onActiveTrial = isProductTrialActive(routerUser, now);
  const routingBlocked = !quota.allowed;

  const statCards = [
    { label: "Chats today", value: totals.chatsToday, icon: Zap, detail: "Since midnight UTC" },
    { label: "Last 7 days", value: totals.chats7d, icon: MessageCircle, detail: "Rolling 7-day window" },
    { label: "Last 30 days", value: totals.chats30d, icon: Users, detail: "Rolling 30-day window" },
    { label: "Links live", value: totals.linksLive, icon: Link2, detail: `${totals.rotators} rotators · ${totals.shortLinks} short links · ${totals.adLinks} ad links` },
  ];

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">Performance</h1>
              <span className="rounded-full border border-slate-700 px-2.5 py-0.5 text-xs font-semibold text-slate-300">{planName} plan</span>
            </div>
            <p className="mt-1 text-slate-400">Live view of your links.</p>
          </div>
          {tier !== "none" && (
            <Link href="/reports" className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-white hover:border-[#25D366]">
              Open reports <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </header>

        {onActiveTrial && (
          <section className="rounded-2xl border border-slate-800 bg-[#111811] p-5" aria-label="Trial status">
            <p className="text-sm font-semibold text-white">
              Free trial · {trialDaysLeft(routerUser, now)} day{trialDaysLeft(routerUser, now) !== 1 ? "s" : ""} left · unlimited leads
            </p>
          </section>
        )}

        {routingBlocked && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5" aria-label="Links paused">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-white">Your free trial has ended — links paused. Choose a plan to resume.</p>
              <Link href="/plans" className="text-sm font-semibold text-[#25D366] hover:underline">
                Choose a plan →
              </Link>
            </div>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Performance summary">
          {statCards.map(({ label, value, icon: Icon, detail }) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <div className="mb-3 flex items-center gap-2">
                <Icon className="h-4 w-4 text-[#25D366]" />
                <span className="text-sm font-medium text-white">{label}</span>
              </div>
              <div className="text-3xl font-bold text-white">{value.toLocaleString()}</div>
              <p className="mt-2 text-xs text-slate-600">{detail}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-bold text-white">30-day trend</h2>
            <span className="text-xs text-slate-600">Times in UTC</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Chats started per day across all your links and rotators. Peak: {peakDay.count} on {peakDay.label}.
          </p>
          <div className="mt-6 flex h-48 items-end gap-1" role="img" aria-label={`Daily chats over the last 30 days, totalling ${totals.chats30d}`}>
            {daily.map((day) => (
              <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                <div className="text-[10px] text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">{day.count}</div>
                <div
                  className="w-full rounded-t-md bg-[#25D366] transition-all"
                  style={{ height: `${Math.max(day.count ? 6 : 2, (day.count / maxDaily) * 150)}px`, opacity: day.count ? 0.85 : 0.12 }}
                  title={`${day.label}: ${day.count} chat${day.count === 1 ? "" : "s"}`}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-600">
            <span>{daily[0]?.label}</span>
            <span>{daily[Math.floor(daily.length / 2)]?.label}</span>
            <span>{daily[daily.length - 1]?.label}</span>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7" aria-label="Your links">
          <h2 className="font-bold text-white">Your links</h2>
          {!hasLinks ? (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-700 p-10 text-center text-slate-500">
              <p>You haven&apos;t created any trackable links yet.</p>
              <Link href="/tools/rotator" className="mt-4 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
                Create your first link
              </Link>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="mt-5 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Type</th>
                      <th className="py-3 pr-4">Status</th>
                      <th className="py-3 pr-4">Chats · 30d</th>
                      <th className="py-3 pr-4">Total chats</th>
                      <th className="py-3 pr-4">Last chat</th>
                      <th className="py-3 pr-4">Link</th>
                      <th className="py-3 pr-4" />
                    </tr>
                  </thead>
                  <tbody>
                    {perLink.map((link) => (
                      <tr key={`${link.type}-${link.id}`} className="border-t border-slate-800/70">
                        <td className="py-4 pr-4 font-semibold text-white">{link.name}</td>
                        <td className="py-4 pr-4">
                          <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">{link.typeLabel}</span>
                        </td>
                        <td className="py-4 pr-4">
                          {link.paused ? (
                            <span title="Paused: over your plan limit" className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                              Paused
                            </span>
                          ) : (
                            <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-1 text-xs font-semibold text-[#25D366]">Live</span>
                          )}
                        </td>
                        <td className="py-4 pr-4 text-slate-300">{link.chats30d}</td>
                        <td className="py-4 pr-4 text-slate-300">{link.totalChats}</td>
                        <td className="py-4 pr-4 text-slate-400" title={link.lastChatAt ? undefined : "No chats in 30 days"}>
                          {relativeTime(link.lastChatAt, now)}
                        </td>
                        <td className="py-4 pr-4 font-mono text-xs text-slate-500">{link.publicUrl}</td>
                        <td className="py-4 pr-4">
                          <CopyLinkButton url={link.publicUrl} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="mt-5 space-y-3 sm:hidden">
                {perLink.map((link) => (
                  <div key={`${link.type}-${link.id}`} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-white">{link.name}</p>
                        <span className="mt-1 inline-block rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-300">{link.typeLabel}</span>
                      </div>
                      {link.paused ? (
                        <span title="Paused: over your plan limit" className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-semibold text-amber-300">
                          Paused
                        </span>
                      ) : (
                        <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-0.5 text-xs font-semibold text-[#25D366]">Live</span>
                      )}
                    </div>
                    <p className="mt-3 text-xs text-slate-500">
                      {link.chats30d} chats · 30d · {link.totalChats} total · {relativeTime(link.lastChatAt, now)}
                    </p>
                    <div className="mt-2 break-all rounded-xl bg-slate-900 px-3 py-2 font-mono text-xs text-slate-400">{link.publicUrl}</div>
                    <div className="mt-3">
                      <CopyLinkButton url={link.publicUrl} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-[#111811] p-5 text-sm">
          {tier === "none" ? (
            <p className="text-slate-300">
              Want chats per day, per link and per salesperson? Reports are included in your free trial and on every paid plan.{" "}
              <Link href="/plans" className="font-semibold text-[#25D366] hover:underline">See plans →</Link>
            </p>
          ) : (
            <p className="text-slate-300">
              Chats per salesperson and per day are in{" "}
              <Link href="/reports" className="font-semibold text-[#25D366] hover:underline">Reports →</Link>
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
