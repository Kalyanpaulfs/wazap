import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Crown, MessageCircle, Plus } from "lucide-react";
import { linkPlan, routerQuota, TRIAL_ROUTED_LEADS } from "@/lib/router-entitlements";
import { getPlanDaysLeft, isPlanExpired } from "@/lib/billing";
import { downgradeIfExpired } from "@/lib/billing-expiry";
import { notifySupportReplySeen } from "@/lib/support-notify";
import UpgradeSuccessBanner from "./UpgradeSuccessBanner";
import DashboardConsentBanner from "./DashboardConsentBanner";
import { shouldShowConsentBanner } from "@/lib/marketing-consent";
import { getBillingSummary } from "@/lib/billing-summary";
import { billingStatusSentence } from "@/lib/billing-status-sentence";
import { getPerformanceSnapshot } from "@/lib/performance";
import { getMyLinks, LINK_KIND_NAME } from "@/lib/my-links";
import LinkRowActions from "../links/LinkRowActions";
import { effectivePlan, isProductTrialActive, trialDaysLeft } from "@/lib/entitlements";

const PLAN_LABELS: Record<string, string> = {
  free: "Free trial ended",
  basic: "Solo",
  pro: "Growth",
  ultimate: "Agency",
  business: "Business",
};

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

  const [user, supportMessages, billingSummary, marketingLead, rotatorLeadsUsed] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    Promise.resolve([] as import("@prisma/client").ContactMessage[]), // Guest enquiries need independently verified ownership.
    getBillingSummary(userId),
    prisma.crmLead.findUnique({ where: { email: userEmail }, select: { marketingStatus: true, doNotContact: true, emailSuppressedAt: true } }),
    prisma.conversationStart.count({ where: { userId, assetType: "rotator" } }),
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
  const routerQuotaInfo = routerQuota(user, rotatorLeadsUsed);
  // Trial still active by date, but the 100 routed leads are used up -
  // distinct from a trial that has actually ended (trialEnded above).
  const trialCapHit = inTrial && !routerQuotaInfo.allowed;

  // Usage + last links: same source as /links (lib/router-entitlements
  // linkPlan + lib/my-links getMyLinks) so the numbers here never disagree
  // with My links.
  const usagePlan = linkPlan(user);
  const { rows, used, limit } = await getMyLinks(userId, usagePlan);
  const lastLinks = rows.slice(0, 3);
  const hasAnyLinks = rows.length > 0;

  // Clicks today / last 7 days: same numbers as Results (Overview tab).
  const { totals } = await getPerformanceSnapshot(userId);

  const nextStep = !hasAnyLinks
    ? { label: "Create your first link", href: "/links/new" }
    : { label: "See your results", href: "/results" };

  return (
    <>
      <main className="wp-overview px-4 py-7 sm:px-7 sm:py-9">
        <div className="mx-auto max-w-7xl space-y-6">
          {justUpgraded && <UpgradeSuccessBanner plan={user?.plan || "free"} expiresAt={user?.planExpiresAt?.toISOString() || null} expectedPlan={params.plan} change={params.change} />}
          <DashboardConsentBanner initialShow={showConsentBanner} />

          <header className="wp-overview-heading">
            <div>
              <p className="wp-eyebrow">YOUR BUSINESS WORKSPACE</p>
              <h1>{session.user.name ? `Hi, ${session.user.name}` : "Hi there"}</h1>
              <p>Keep your conversations moving. Start with what needs your attention.</p>
            </div>
            <Link prefetch={false} href="/links/new" className="wp-primary">
              <Plus size={16} /> Create link
            </Link>
          </header>

          {(inTrial || trialEnded) && (
            <div
              className={`rounded-2xl border p-4 ${trialEnded || trialCapHit ? "border-danger/40 bg-danger/10" : "border-warning/30 bg-highlight-soft"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${trialEnded || trialCapHit ? "text-danger" : "text-warning"}`} />
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${trialEnded || trialCapHit ? "text-danger" : "text-warning"}`}>
                    {trialEnded
                      ? "Your free trial has ended — your links are paused"
                      : trialCapHit
                      ? `You've used your ${TRIAL_ROUTED_LEADS} trial leads`
                      : `Your free trial ends in ${productTrialDaysLeft} day${productTrialDaysLeft !== 1 ? "s" : ""} · ${routerQuotaInfo.used} of ${TRIAL_ROUTED_LEADS} trial leads used`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {trialEnded
                      ? "Choose a plan and your lead rotators, WhatsApp links and ad links start working again."
                      : trialCapHit
                      ? `You've used the ${TRIAL_ROUTED_LEADS} leads in your free trial. Choose a plan to keep routing.`
                      : "After that, your lead rotators, WhatsApp links and ad links stop working until you choose a plan."}
                  </p>
                </div>
                <Link
                  href="/billing"
                  className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover"
                >
                  Choose a plan
                </Link>
              </div>
            </div>
          )}

          {expiryWarning && (
            <div
              className={`rounded-2xl border p-4 ${daysLeft === 0 ? "border-danger/40 bg-danger/10" : "border-warning/30 bg-highlight-soft"}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <AlertTriangle
                  className={`h-5 w-5 shrink-0 ${daysLeft === 0 ? "text-danger" : "text-warning"}`}
                />
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold ${daysLeft === 0 ? "text-danger" : "text-warning"}`}
                  >
                    {daysLeft === 0
                      ? "Your plan has expired"
                      : `Your ${PLAN_LABELS[plan]} plan expires in ${daysLeft} day${daysLeft !== 1 ? "s" : ""}`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    When it ends, your lead rotators, WhatsApp links and ad links stop working. Renew to keep them running.
                  </p>
                </div>
                <Link
                  href="/billing"
                  className="rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-on-accent transition-colors hover:bg-accent-hover"
                >
                  Renew
                </Link>
              </div>
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-3">
            <div id="billing" className="rounded-2xl border border-border bg-surface p-5 scroll-mt-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Current plan</p>
              <div className="mt-3 flex items-center gap-2">
                <Crown className="h-5 w-5 text-accent" />
                <span className="text-xl font-bold text-text">{inTrial ? "Free trial" : PLAN_LABELS[plan]}</span>
              </div>
              {inTrial && (
                <span className="mt-2 inline-flex rounded-full border border-accent/30 bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
                  {productTrialDaysLeft} day{productTrialDaysLeft !== 1 ? "s" : ""} left · no card required
                </span>
              )}
              <p className="mt-2 text-xs leading-relaxed text-muted">
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
              <Link href="/billing" className="mt-3 inline-block text-xs font-semibold text-accent hover:underline">
                {trialEnded ? "Choose a plan →" : "Manage billing →"}
              </Link>
            </div>

            <Link href="/links" className="rounded-2xl border border-border bg-surface p-5 hover:border-accent">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Links</p>
              <div className="mt-3 text-xl font-bold text-text">{used} of {limit} used</div>
              <span className="mt-3 inline-block text-xs font-semibold text-accent">Open My links →</span>
            </Link>

            <Link href="/results" className="rounded-2xl border border-border bg-surface p-5 hover:border-accent">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Clicks</p>
              <div className="mt-3 text-xl font-bold text-text">{totals.chatsToday} today · {totals.chats7d} / 7 days</div>
              <span className="mt-3 inline-block text-xs font-semibold text-accent">See results →</span>
            </Link>
          </section>

          <Link
            href={nextStep.href}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-5"
          >
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-accent">Next step</p>
              <p className="mt-1 text-lg font-bold text-text">{nextStep.label}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-accent" />
          </Link>

          <section className="rounded-3xl border border-border bg-surface p-5 sm:p-7" aria-label="Your latest links">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-bold text-text">Your latest links</h2>
              <Link href="/links" className="text-sm font-semibold text-accent hover:underline">
                See all links →
              </Link>
            </div>
            {!hasAnyLinks ? (
              <div className="mt-5 rounded-2xl border border-dashed border-border-strong p-10 text-center text-muted">
                <p className="text-text font-semibold">No links yet</p>
                <p className="mt-1 text-sm">Create your first link in 1 minute.</p>
                <Link href="/links/new" className="mt-4 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-on-accent hover:bg-accent-hover">
                  Create link
                </Link>
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                {lastLinks.map((row) => (
                  <div key={`${row.kind}-${row.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg/40 p-4">
                    <div>
                      <Link href={row.editHref} className="font-semibold text-text hover:text-accent hover:underline">
                        {row.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                        <span className="rounded-full border border-border-strong px-2 py-0.5 text-muted">{LINK_KIND_NAME[row.kind]}</span>
                        <span>{row.metric.toLocaleString()} clicks</span>
                      </div>
                    </div>
                    <LinkRowActions id={row.id} kind={row.kind} name={row.name} publicUrl={row.publicUrl} editHref={row.editHref} manuallyPaused={row.manuallyPaused} />
                  </div>
                ))}
              </div>
            )}
          </section>

          {supportMessages.length > 0 && (
            <section className="rounded-2xl border border-accent/20 bg-surface p-5 sm:p-6">
              <div className="mb-4 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-accent" />
                <h2 className="font-semibold text-text">
                  Latest Support Replies
                </h2>
              </div>
              <div className="space-y-3">
                {supportMessages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-border bg-bg/50 p-4"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text">
                          {m.subject}
                        </p>
                        <p className="text-xs text-muted">
                          Your message from{" "}
                          {new Date(m.createdAt).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                      </div>
                      {m.repliedAt && (
                        <span className="shrink-0 rounded-full border border-accent/30 bg-accent-soft px-2 py-1 text-[11px] font-medium text-accent">
                          Replied
                        </span>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
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
