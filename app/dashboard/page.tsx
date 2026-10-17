import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Crown,
  MessageCircle,
  Link2,
  Megaphone,
  BarChart3,
} from "lucide-react";
import {
  IconWidget,
  IconAdBuilder,
  IconRotator,
} from "@/app/tools/ToolIcons";
import { TOOL_LIMITS } from "@/lib/tool-access";
import { rotatorLimit, shortLinkLimit, adLinkLimit } from "@/lib/plan-limits";
import { getPlanDaysLeft, isPlanExpired } from "@/lib/billing";
import { downgradeIfExpired } from "@/lib/billing-expiry";
import { notifySupportReplySeen } from "@/lib/support-notify";
import ToolShortcuts from "./ToolShortcuts";
import SetupGuide from "../product/SetupGuide";
import UpgradeSuccessBanner from "./UpgradeSuccessBanner";
import DashboardConsentBanner from "./DashboardConsentBanner";
import { shouldShowConsentBanner } from "@/lib/marketing-consent";
import { getBillingSummary } from "@/lib/billing-summary";
import { billingStatusSentence } from "@/lib/billing-status-sentence";
import {
  effectivePlan,
  isProductTrialActive,
  trialDaysLeft,
} from "@/lib/entitlements";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free trial ended",
  basic: "Solo",
  pro: "Growth",
  ultimate: "Agency",
  business: "Business",
};
const PLAN_COLORS: Record<string, string> = {
  free: "text-slate-400",
  basic: "text-blue-300",
  pro: "text-[#25D366]",
  ultimate: "text-yellow-300",
  business: "text-emerald-300",
};

function usagePercent(used: number, limit: number | null) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; workspace?: string; plan?: string; change?: string }>;
}) {
  const params = await searchParams;
  const justUpgraded = params?.upgraded === "1";
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const sessionUser = session.user as {
    id: string;
    plan?: string;
    isAdmin?: boolean;
  };
  if (sessionUser.isAdmin && params?.workspace !== "1" && !justUpgraded) redirect("/admin/crm/overview");
  const userId = sessionUser.id;
  const sessionPlan = sessionUser.plan ?? "free";
  const userEmail = (session.user.email ?? "").toLowerCase();

  const [
    user,
    usage,
    supportMessages,
    adLinkCount,
    rotatorCount,
    shortLinkCount,
    scheduledCount,
    firstToolSuccess,
    routedLinkCount,
    chatStarts30d,
    billingSummary,
    marketingLead,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.dailyUsage.findUnique({
      where: { userId_date: { userId, date: today() } },
    }),
    Promise.resolve([] as import("@prisma/client").ContactMessage[]), // Guest enquiries need independently verified ownership.
    prisma.adLink.count({ where: { userId } }),
    prisma.rotatorLink.count({ where: { userId } }),
    prisma.shortLink.count({ where: { userId } }),
    prisma.scheduledSend.count({ where: { userId, status: "pending" } }),
    prisma.funnelEvent.findFirst({
      where: { userId, name: "first_tool_success" },
      select: { id: true },
    }),
    prisma.rotatorLink.count({where:{userId,totalClicks:{gt:0}}}),
    prisma.conversationStart.count({where:{userId,createdAt:{gte:new Date(new Date().getTime()-30*24*60*60*1000)}}}),
    getBillingSummary(userId),
    prisma.crmLead.findUnique({ where: { email: userEmail }, select: { marketingStatus: true, doNotContact: true, emailSuppressedAt: true } }),
  ]);

  const showConsentBanner = shouldShowConsentBanner({ isAdmin: sessionUser.isAdmin, marketingOptOutAt: user?.marketingOptOutAt ?? null, lead: marketingLead });

  let plan = effectivePlan(user) || sessionPlan;
  if (user && isPlanExpired(plan, user.planExpiresAt)) {
    await downgradeIfExpired(user);
    plan = effectivePlan({ ...user, plan: "free" });
    user.planExpiresAt = null;
  }

  const unseenSupportReplyIds = supportMessages
    .filter((m) => m.adminReply && !m.adminReplySeenAt)
    .map((m) => m.id);
  if (unseenSupportReplyIds.length > 0) {
    const seenAt = new Date();
    const updateResult = await prisma.contactMessage.updateMany({
      where: { id: { in: unseenSupportReplyIds } },
      data: { adminReplySeenAt: seenAt },
    });
    if (updateResult.count > 0) {
      await Promise.allSettled(
        supportMessages
          .filter((m) => unseenSupportReplyIds.includes(m.id))
          .map((m) =>
            notifySupportReplySeen({
              name: m.name,
              email: m.email,
              subject: m.subject,
              seenAt,
            }),
          ),
      );
    }
  }

  const daysLeft = getPlanDaysLeft(user?.planExpiresAt);
  // Auto-renewing plans don't need a stop warning; manual / auto-pay-off ones do.
  const expiryWarning = plan !== "free" && daysLeft !== null && daysLeft <= 7 && billingSummary?.autoRenew !== true;
  const inTrial = isProductTrialActive(user);
  const productTrialDaysLeft = trialDaysLeft(user);
  const trialEnded = plan === "free" && !inTrial;
  const rotatorMax = rotatorLimit(plan);
  const shortLinkMax = shortLinkLimit(plan);
  const adLinkMax = adLinkLimit(plan);
  const savedWorkflowCount =
    adLinkCount +
    rotatorCount +
    shortLinkCount +
    scheduledCount;
  const linksLiveCount = rotatorCount + shortLinkCount + adLinkCount;
  const p = (
    plan === "business" ? "ultimate" : plan
  ) as keyof typeof TOOL_LIMITS.widget;
  const toolUsages = [
    {
      href: "/tools/widget",
      Icon: IconWidget,
      name: "Widget",
      used: usage?.widgetCopies ?? 0,
      limit: TOOL_LIMITS.widget[p]?.uses,
      limitText: TOOL_LIMITS.widget[p]?.label,
      value: "Embed chat",
    },
    {
      href: "/tools/ad-builder",
      Icon: IconAdBuilder,
      name: "Ad Builder",
      used: adLinkCount,
      limit: adLinkMax,
      limitText: adLinkMax === 0 ? "Not in your plan" : `${adLinkMax} link${adLinkMax === 1 ? "" : "s"}`,
      value: `${adLinkCount} saved`,
    },
    {
      href: "/tools/rotator",
      Icon: IconRotator,
      name: "Rotators",
      used: rotatorCount,
      limit: rotatorMax,
      limitText: `${rotatorMax} rotator${rotatorMax === 1 ? "" : "s"}`,
      value: `${rotatorCount} live`,
    },
  ];

  // Plan-usage cards shown at the top of the dashboard (FEAT-PLAN-LIMITS):
  // rotators / short links / ad links, each against the current plan's
  // limit, with an upgrade hint when a feature isn't in the plan at all.
  const planUsageCards = [
    { title: "Rotators", used: rotatorCount, limit: rotatorMax, href: "/tools/rotator", cta: "Open rotators" },
    { title: "Short links", used: shortLinkCount, limit: shortLinkMax, href: "/tools/shortlink", cta: "Open short links" },
    { title: "Ad links", used: adLinkCount, limit: adLinkMax, href: "/tools/ad-builder", cta: "Open ad builder" },
  ];

  const quickActions = [
    {
      href: "/tools/rotator",
      icon: IconRotator,
      title: "Lead routing",
      desc: "Create one link and distribute enquiries across your team.",
    },
    {
      href: "/performance",
      icon: BarChart3,
      title: "Performance",
      desc: "See chats started today, this week and this month.",
    },
  ];

  return (
    <>
      <main className="wp-overview px-4 py-7 sm:px-7 sm:py-9">
        <div className="mx-auto max-w-7xl space-y-6">
          {justUpgraded && <UpgradeSuccessBanner plan={user?.plan || "free"} expiresAt={user?.planExpiresAt?.toISOString() || null} expectedPlan={params.plan} change={params.change} />}
          <DashboardConsentBanner initialShow={showConsentBanner} />


          <header className="wp-overview-heading"><div><p className="wp-eyebrow">YOUR BUSINESS WORKSPACE</p><h1>Overview</h1><p>Keep your conversations moving. Start with what needs your attention.</p></div><Link prefetch={false} href="/performance" className="wp-primary">View performance <ArrowRight size={16}/></Link></header>
          <section className="wp-overview-summary" aria-label="Workspace summary">{[["Chats · 30 days",chatStarts30d,"/performance","Chat starts across your links and rotators"],["Saved workflows",savedWorkflowCount,"/tools","Links, pages and saved work"],["Links live",linksLiveCount,"/performance","Rotators, short links and ad links"]].map(([label,count,href,description])=><Link prefetch={false} href={String(href)} key={String(label)}><span>{String(label)}<ArrowRight size={14}/></span><strong>{String(count)}</strong><small>{String(description)}</small></Link>)}</section>
          <section className="wp-overview-actions" aria-label="Next actions">{quickActions.map(({href,icon:Icon,title,desc})=><Link prefetch={false} key={href} href={href}><span className="wp-tool-icon"><Icon size={21}/></span><span><strong>{title}</strong><small>{desc}</small></span><ArrowRight size={17}/></Link>)}</section>

          {plan === "free" && (
            <Link
              href="/pricing"
              className="block rounded-2xl border border-red-500/40 bg-red-500/10 p-4 transition-colors hover:bg-red-500/15"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">Your free trial has ended — links paused</p>
                  <p className="mt-0.5 text-sm text-slate-400">Choose a plan to resume routing, add rotators and salespeople.</p>
                </div>
                <span className="shrink-0 rounded-full bg-[#25D366] px-5 py-2 text-sm font-semibold text-black">
                  See plans
                </span>
              </div>
            </Link>
          )}

          {(inTrial || trialEnded) && (
            <div
              className={`rounded-2xl border p-4 ${trialEnded ? "border-red-500/40 bg-red-500/10" : "border-yellow-500/30 bg-yellow-500/5"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${trialEnded ? "text-red-400" : "text-yellow-400"}`} />
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${trialEnded ? "text-red-300" : "text-yellow-300"}`}>
                    {trialEnded
                      ? "Your free trial has ended — your links are paused"
                      : `Your free trial ends in ${productTrialDaysLeft} day${productTrialDaysLeft !== 1 ? "s" : ""}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {trialEnded
                      ? "Choose a plan and your rotators, short links and ad links start working again."
                      : "After that, your rotators, short links and ad links stop working until you choose a plan."}
                  </p>
                </div>
                <Link
                  href="/plans"
                  className="rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#1fba58]"
                >
                  Choose a plan
                </Link>
              </div>
            </div>
          )}

          {expiryWarning && (
            <div
              className={`rounded-2xl border p-4 ${daysLeft === 0 ? "border-red-500/40 bg-red-500/10" : "border-yellow-500/30 bg-yellow-500/5"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <AlertTriangle
                  className={`h-5 w-5 shrink-0 ${daysLeft === 0 ? "text-red-400" : "text-yellow-400"}`}
                />
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold ${daysLeft === 0 ? "text-red-300" : "text-yellow-300"}`}
                  >
                    {daysLeft === 0
                      ? "Your plan has expired"
                      : `Your ${PLAN_LABELS[plan]} plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    When it ends, your rotators, short links and ad links stop working. Renew to keep them running.
                  </p>
                </div>
                <Link
                  href="/pricing"
                  className="rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-[#1fba58]"
                >
                  Renew
                </Link>
              </div>
            </div>
          )}

          <section className="grid gap-4 md:grid-cols-3">
            {planUsageCards.map(({ title, used, limit, href, cta }) => {
              const notInPlan = limit === 0;
              const pct = usagePercent(used, notInPlan ? null : limit);
              const Icon = title === "Rotators" ? IconRotator : title === "Short links" ? Link2 : Megaphone;
              return (
                <div key={title} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-[#25D366]" />
                    <span className="text-sm font-medium text-white">{title}</span>
                  </div>
                  {notInPlan ? (
                    <div className="text-xl font-bold text-slate-500">Not in your plan</div>
                  ) : (
                    <div className="text-3xl font-bold text-white">
                      {used}
                      <span className="text-lg font-normal text-slate-500"> / {limit}</span>
                    </div>
                  )}
                  {used > limit && (
                    <p className="mt-2 text-xs text-yellow-300">
                      {notInPlan ? `You have ${used} from before. ` : "Over your plan limit. "}They keep working, but you can&apos;t add more.
                    </p>
                  )}
                  {!notInPlan && (
                    <div className="mt-3 h-1.5 w-full rounded-full bg-slate-800">
                      <div
                        className={`h-1.5 rounded-full transition-all ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-400" : "bg-[#25D366]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  )}
                  <Link href={notInPlan ? "/pricing" : href} className="mt-3 inline-block text-xs font-semibold text-[#25D366] hover:underline">
                    {notInPlan ? "Upgrade plan →" : `${cta} →`}
                  </Link>
                </div>
              );
            })}
          </section>

          <div className="wp-overview-body"><ToolShortcuts tools={toolUsages.map(({Icon,...tool})=>tool)}/><div className="wp-overview-side">            <aside id="billing" className="wp-overview-plan scroll-mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Current plan
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Crown className="h-5 w-5 text-[#25d366]" />
                <span className="text-2xl font-bold text-white">
                  {inTrial ? "Free trial" : PLAN_LABELS[plan]}
                </span>
                {inTrial && (
                  <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-1 text-xs font-semibold text-[#25D366]">
                    {productTrialDaysLeft} day
                    {productTrialDaysLeft !== 1 ? "s" : ""} left · no card
                    required
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {billingStatusSentence({
                  plan: billingSummary?.plan ?? plan,
                  inTrial,
                  trialPlan: user?.trialPlan,
                  trialEndsAt: user?.trialEndsAt,
                  autoRenew: billingSummary?.autoRenew ?? true,
                  renewsOrExpiresAt: billingSummary?.renewsOrExpiresAt ?? null,
                  provider: billingSummary?.provider ?? null,
                  pendingChange: billingSummary?.pendingChange ?? null,
                })}
              </p>
              <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold">
                <Link href="/billing" className="text-[#25D366] hover:underline">
                  Manage billing →
                </Link>
                <Link href="/plans" className="text-[#25D366] hover:underline">
                  See plans →
                </Link>
              </div>
            </aside>          <SetupGuide userId={userId} progress={{rotators:rotatorCount,routedLinks:routedLinkCount,toolSuccess:Boolean(firstToolSuccess)}} /></div></div>

          {supportMessages.length > 0 && (
            <section className="rounded-2xl border border-[#25D366]/20 bg-[#111811] p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-[#25D366]" />
                <h2 className="font-semibold text-white">
                  Latest Support Replies
                </h2>
              </div>
              <div className="space-y-3">
                {supportMessages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/50 p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-white">
                          {m.subject}
                        </p>
                        <p className="text-xs text-slate-500">
                          Your message from{" "}
                          {new Date(m.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      </div>
                      {m.repliedAt && (
                        <span className="shrink-0 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2 py-1 text-[11px] font-medium text-[#25D366]">
                          Replied
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                      {m.adminReply}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
