import { getServerSession } from "next-auth";
import { authOptions, PLAN_LIMITS } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Crown,
  MessageCircle,
  Inbox,
  QrCode,
  Wrench,
  Zap,
  BarChart3,
  MessageSquareText,
  Clock3,
} from "lucide-react";
import {
  IconWidget,
  IconBulk,
  IconChecker,
  IconAdBuilder,
  IconVCard,
  IconLinktree,
  IconRotator,
  IconTranscript,
} from "@/app/tools/ToolIcons";
import { TOOL_LIMITS } from "@/lib/tool-access";
import { getPlanDaysLeft, isPlanExpired } from "@/lib/billing";
import { notifySupportReplySeen } from "@/lib/support-notify";
import ToolShortcuts from "./ToolShortcuts";
import SetupGuide from "../product/SetupGuide";
import UpgradeSuccessBanner from "./UpgradeSuccessBanner";
import BillingManager from "./BillingManager";
import { currentSubscriptionRecord } from "@/lib/subscription-record";
import {
  effectivePlan,
  isProductTrialActive,
  trialDaysLeft,
} from "@/lib/entitlements";
import { getActiveWorkspace } from "@/lib/workspaces";

function today() {
  return new Date().toISOString().slice(0, 10);
}

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  basic: "Solo",
  pro: "Growth",
  ultimate: "Team",
  business: "Business",
};
const PLAN_COLORS: Record<string, string> = {
  free: "text-slate-400",
  basic: "text-blue-300",
  pro: "text-[#25D366]",
  ultimate: "text-yellow-300",
  business: "text-emerald-300",
};

function limitLabel(limit: number | undefined) {
  if (limit === -1) return "Unlimited";
  if (!limit) return "Locked";
  return `${limit}/day`;
}

function usagePercent(used: number, limit: number | null) {
  if (!limit) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; workspace?: string; plan?: string }>;
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
  const activeMembership = await getActiveWorkspace(userId);

  const [
    user,
    usage,
    supportMessages,
    adLinkCount,
    linktreeCount,
    rotatorCount,
    shortLinkCount,
    catalogCount,
    scheduledCount,
    leadCount,
    newToolEvents,
    firstToolSuccess,
    activeBillingPayment,
    activeChannelConnectionCount,
    routedLinkCount,
    savedLeadCount,
    followUpCount,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.dailyUsage.findUnique({
      where: { userId_date: { userId, date: today() } },
    }),
    Promise.resolve([] as import("@prisma/client").ContactMessage[]), // Guest enquiries need independently verified ownership.
    prisma.adLink.count({ where: { userId } }),
    prisma.linktreePage.count({ where: { userId } }),
    prisma.rotatorLink.count({ where: { userId } }),
    prisma.shortLink.count({ where: { userId } }),
    prisma.catalogPage.count({ where: { userId } }),
    prisma.scheduledSend.count({ where: { userId, status: "pending" } }),
    prisma.lead.count({
      where: { userId, status: { notIn: ["won", "lost"] } },
    }),
    prisma.funnelEvent.findMany({
      where: {
        userId,
        name: "tool_used",
        createdAt: { gte: new Date(`${today()}T00:00:00.000Z`) },
      },
      select: { metadata: true },
    }),
    prisma.funnelEvent.findFirst({
      where: { userId, name: "first_tool_success" },
      select: { id: true },
    }),
    currentSubscriptionRecord(userId),
    prisma.channelConnection.count({
      where: { workspaceId: activeMembership.workspaceId, status: "active" },
    }),
    prisma.rotatorLink.count({where:{userId,totalClicks:{gt:0}}}),
    prisma.lead.count({where:{userId}}),
    prisma.lead.count({where:{userId,nextFollowUpAt:{not:null}}}),
  ]);

  let plan = effectivePlan(user) || sessionPlan;
  if (user && isPlanExpired(plan, user.planExpiresAt)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { plan: "free", planExpiresAt: null },
    });
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

  const limits =
    PLAN_LIMITS[plan as keyof typeof PLAN_LIMITS] ?? PLAN_LIMITS.free;
  const opens = usage?.opens ?? 0;
  const qr = usage?.qrDownloads ?? 0;
  const opensLimit = limits.opens === Infinity ? null : limits.opens;
  const qrLimit = limits.qr === Infinity ? null : limits.qr;
  const opensPct = usagePercent(opens, opensLimit);
  const qrPct = usagePercent(qr, qrLimit);
  const daysLeft = getPlanDaysLeft(user?.planExpiresAt);
  const expiryWarning = plan !== "free" && daysLeft !== null && daysLeft <= 7;
  const inTrial = isProductTrialActive(user);
  const productTrialDaysLeft = trialDaysLeft(user);
  const atFreeLimit =
    plan === "free" &&
    Boolean((opensLimit && opens >= opensLimit) || (qrLimit && qr >= qrLimit));
  const savedWorkflowCount =
    adLinkCount +
    linktreeCount +
    rotatorCount +
    shortLinkCount +
    catalogCount +
    scheduledCount;
  const p = (
    plan === "business" ? "ultimate" : plan
  ) as keyof typeof TOOL_LIMITS.widget;
  const newToolCount = (tool: string) =>
    newToolEvents.filter(
      (event) => (event.metadata as { tool?: string } | null)?.tool === tool,
    ).length;
  const toolUsages = [
    {
      href: "/tools/bulk",
      Icon: IconBulk,
      name: "Bulk Send Queue",
      used: usage?.bulkSends ?? 0,
      limit: TOOL_LIMITS.bulk[p]?.uses,
      limitText: TOOL_LIMITS.bulk[p]?.label,
      value: `${usage?.bulkSends ?? 0} opened today`,
    },
    {
      href: "/tools/follow-up",
      Icon: CheckCircle2,
      name: "Lead Follow-Up",
      used: leadCount,
      limit: TOOL_LIMITS.leads[p]?.uses,
      value: `${leadCount} active`,
      limitText:
        TOOL_LIMITS.leads[p]?.uses === -1
          ? "∞"
          : `${TOOL_LIMITS.leads[p]?.uses} max`,
    },
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
      href: "/tools/checker",
      Icon: IconChecker,
      name: "Formatter",
      used: usage?.checkerUses ?? 0,
      limit: TOOL_LIMITS.checker[p]?.uses,
      limitText: TOOL_LIMITS.checker[p]?.label,
      value: "Clean lists",
    },
    {
      href: "/tools/ad-builder",
      Icon: IconAdBuilder,
      name: "Ad Builder",
      used: adLinkCount,
      limit: TOOL_LIMITS.adBuilder[p]?.uses,
      limitText: TOOL_LIMITS.adBuilder[p]?.label,
      value: `${adLinkCount} saved`,
    },
    {
      href: "/tools/vcard",
      Icon: IconVCard,
      name: "vCard + QR",
      used: usage?.vcardDownloads ?? 0,
      limit: TOOL_LIMITS.vcard[p]?.uses,
      limitText: TOOL_LIMITS.vcard[p]?.label,
      value: "Business card",
    },
    {
      href: "/tools/linktree",
      Icon: IconLinktree,
      name: "Link Pages",
      used: linktreeCount,
      limit: TOOL_LIMITS.linktree[p]?.uses,
      limitText: TOOL_LIMITS.linktree[p]?.label,
      value: `${linktreeCount} live`,
    },
    {
      href: "/tools/rotator",
      Icon: IconRotator,
      name: "Rotators",
      used: rotatorCount,
      limit: TOOL_LIMITS.rotator[p]?.uses,
      limitText: TOOL_LIMITS.rotator[p]?.label,
      value: `${rotatorCount} live`,
    },
    {
      href: "/tools/transcript",
      Icon: IconTranscript,
      name: "Transcript",
      used: usage?.transcriptExports ?? 0,
      limit: TOOL_LIMITS.transcript[p]?.uses,
      limitText: TOOL_LIMITS.transcript[p]?.label,
      value: "Export chats",
    },
    {
      href: "/tools/chat-insights",
      Icon: BarChart3,
      name: "Chat Insights",
      used: newToolCount("chatInsights"),
      limit: TOOL_LIMITS.chatInsights[p]?.uses,
      limitText: TOOL_LIMITS.chatInsights[p]?.label,
      value: `${newToolCount("chatInsights")} today`,
    },
    {
      href: "/tools/reply-generator",
      Icon: MessageSquareText,
      name: "Reply Generator",
      used: newToolCount("replyGenerator"),
      limit: TOOL_LIMITS.replyGenerator[p]?.uses,
      limitText: TOOL_LIMITS.replyGenerator[p]?.label,
      value: `${newToolCount("replyGenerator")} today`,
    },
    {
      href: "/tools/message-scheduler",
      Icon: Clock3,
      name: "Scheduler",
      used: newToolCount("messageScheduler"),
      limit: TOOL_LIMITS.messageScheduler[p]?.uses,
      limitText: TOOL_LIMITS.messageScheduler[p]?.label,
      value: `${newToolCount("messageScheduler")} today`,
    },
  ];

  const quickActions = [
    {
      href: "/tools/follow-up",
      icon: CheckCircle2,
      title: "Follow up leads",
      desc: "Save a lead and see who needs a reply today.",
    },
    {
      href: "/inbox",
      icon: Inbox,
      title: "Team inbox",
      desc: "Connect a channel when you are ready for team replies.",
    },
    {
      href: "/tools/rotator",
      icon: IconRotator,
      title: "Lead routing",
      desc: "Create one link and distribute enquiries across your team.",
    },
  ];

  return (
    <>
      <main className="wp-overview px-4 py-7 sm:px-7 sm:py-9">
        <div className="mx-auto max-w-7xl space-y-6">
          {justUpgraded && <UpgradeSuccessBanner plan={user?.plan || "free"} expiresAt={user?.planExpiresAt?.toISOString() || null} expectedPlan={params.plan} />}


          <header className="wp-overview-heading"><div><p className="wp-eyebrow">YOUR BUSINESS WORKSPACE</p><h1>Overview</h1><p>Keep your conversations moving. Start with what needs your attention.</p></div><Link prefetch={false} href="/tools/follow-up" className="wp-primary">Open leads <ArrowRight size={16}/></Link></header>
          <section className="wp-overview-summary" aria-label="Workspace summary">{[["Open leads",leadCount,"/tools/follow-up","Contacts still in your pipeline"],["Saved workflows",savedWorkflowCount,"/tools","Links, pages and saved work"],["Connected channels",activeChannelConnectionCount,"/channels","Active workspace connections"]].map(([label,count,href,description])=><Link prefetch={false} href={String(href)} key={String(label)}><span>{String(label)}<ArrowRight size={14}/></span><strong>{String(count)}</strong><small>{String(description)}</small></Link>)}</section>
          <section className="wp-overview-actions" aria-label="Next actions">{quickActions.map(({href,icon:Icon,title,desc})=><Link prefetch={false} key={href} href={href}><span className="wp-tool-icon"><Icon size={21}/></span><span><strong>{title}</strong><small>{desc}</small></span><ArrowRight size={17}/></Link>)}</section>

          {plan === "free" && (
            <Link
              href="/pricing"
              className={`block rounded-2xl border p-4 transition-colors ${atFreeLimit ? "border-red-500/40 bg-red-500/10 hover:bg-red-500/15" : "border-[#25D366]/30 bg-[#25D366]/10 hover:bg-[#25D366]/15"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-white">
                    {atFreeLimit
                      ? "You have hit today's free limit"
                      : "Free plan active"}
                  </p>
                  <p className="mt-0.5 text-sm text-slate-400">
                    {atFreeLimit
                      ? "Upgrade to keep working today."
                      : "Paid plans unlock higher limits, branded short links, Link Pages, rotators, catalogs, and support."}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[#25D366] px-5 py-2 text-sm font-semibold text-black">
                  See plans
                </span>
              </div>
            </Link>
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
                    Renew now to keep full access without interruption.
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
            {[
              {
                icon: Zap,
                title: "Chats opened today",
                used: opens,
                limit: opensLimit,
                pct: opensPct,
              },
              {
                icon: QrCode,
                title: "QR downloads today",
                used: qr,
                limit: qrLimit,
                pct: qrPct,
              },
              {
                icon: MessageCircle,
                title: "Tools used today",
                used: newToolEvents.length,
                limit: null,
                pct: 0,
              },
            ].map(({ icon: Icon, title, used, limit, pct }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-800 bg-[#111811] p-5"
              >
                <div className="mb-3 flex items-center gap-2">
                  <Icon className="h-4 w-4 text-[#25D366]" />
                  <span className="text-sm font-medium text-white">
                    {title}
                  </span>
                </div>
                <div className="text-3xl font-bold text-white">
                  {used}
                  {title !== "Tools used today" && <span className="text-lg font-normal text-slate-500"> / {limit ?? "Unlimited"}</span>}
                </div>
                {limit && (
                  <div className="mt-3 h-1.5 w-full rounded-full bg-slate-800">
                    <div
                      className={`h-1.5 rounded-full transition-all ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-yellow-400" : "bg-[#25D366]"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
                <p className="mt-2 text-xs text-slate-600">
                  {title === "Tools used today" ? "Recorded tool actions today" : "Daily usage · resets at midnight UTC"}
                </p>
              </div>
            ))}
          </section>

          <div className="wp-overview-body"><ToolShortcuts tools={toolUsages.map(({Icon,...tool})=>tool)}/><div className="wp-overview-side">            <aside id="billing" className="wp-overview-plan scroll-mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Current plan
              </p>
              <div className="mt-3 flex items-center gap-3">
                <Crown className="h-5 w-5 text-[#25d366]" />
                <span className="text-2xl font-bold text-white">
                  {inTrial ? `${PLAN_LABELS[plan]} trial` : PLAN_LABELS[plan]}
                </span>
                {inTrial && (
                  <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2.5 py-1 text-xs font-semibold text-[#25D366]">
                    {productTrialDaysLeft} day
                    {productTrialDaysLeft !== 1 ? "s" : ""} left · no card
                    required
                  </span>
                )}
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {session.user.email}
              </p>
              {plan !== "free" && daysLeft !== null && (
                <p className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-sm text-slate-300">
                  <span className="font-semibold text-white">
                    {daysLeft} day{daysLeft !== 1 ? "s" : ""}
                  </span>{" "}
                  left on this billing period
                </p>
              )}
              {plan !== "free" && user?.planExpiresAt && (
                <p className="mt-2 text-xs text-slate-600">
                  Renews or expires{" "}
                  {user.planExpiresAt.toLocaleDateString("en-GB")}
                </p>
              )}
              {plan !== "free" && !inTrial && (
                <BillingManager
                  method={activeBillingPayment?.method || null}
                  expiresAt={user?.planExpiresAt?.toISOString() || null}
                />
              )}
              {plan === "free" && (
                <p className="mt-4 text-sm leading-relaxed text-slate-400">
                  Free includes starter limits. Upgrade when you need branded
                  links, pages, rotators, and higher daily capacity.
                </p>
              )}
            </aside>          <SetupGuide userId={userId} progress={{rotators:rotatorCount,routedLinks:routedLinkCount,leads:savedLeadCount,followUps:followUpCount,toolSuccess:Boolean(firstToolSuccess),channels:activeChannelConnectionCount}} /></div></div>

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
