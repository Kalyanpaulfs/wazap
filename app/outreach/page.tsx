import { getServerSession } from "next-auth";
import BackLink from "@/app/links/BackLink";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, Check } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { linkPlan } from "@/lib/router-entitlements";
import { teamOutreachAvailable, teamOutreachContactLimit, teamOutreachMemberLimit } from "@/lib/plan-limits";
import { accountPlanLabel } from "@/lib/entitlements";
import { originBase } from "@/lib/my-links";
import { getTeamForOwner, OWNER_PLAN_SELECT } from "@/lib/outreach/team";
import { listMembers, activeMemberCount } from "@/lib/outreach/members";
import { listLists, teamContactTotal } from "@/lib/outreach/lists";
import StartTeamButton from "./StartTeamButton";
import OutreachClient from "./OutreachClient";
import type { OutreachListStatus } from "./types";

export const metadata = { title: "Team outreach", robots: { index: false, follow: false } };

const FEATURES = [
  "Upload a customer list",
  "Salespeople tap one shared link",
  "Each tap opens WhatsApp to the next free customer — no prefilled message",
  "No customer is ever given to two people",
  "A speed limit stops one person grabbing them all",
  "A salesperson can give a customer back if they can't reach them",
];

export default async function OutreachPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/outreach");
  const userId = (session.user as { id: string }).id;

  const owner = await prisma.user.findUnique({ where: { id: userId }, select: OWNER_PLAN_SELECT });
  const plan = linkPlan(owner);

  if (!teamOutreachAvailable(plan)) {
    return (
      <main className="px-4 py-7 sm:px-7 sm:py-9">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="text-left"><BackLink href="/tools" label="All tools" /></div>
          <header className="text-center">
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#25D366]">Team outreach</p>
            <h1 className="mt-2 flex items-center justify-center gap-2 text-2xl font-bold text-white sm:text-3xl">
              <Lock className="h-6 w-6 text-slate-500" /> Hand your team their next customer
            </h1>
            <p className="mt-2 text-slate-400">
              Upload a customer list. Each salesperson taps one shared link and WhatsApp opens to their next free
              customer  no prefilled message, no duplicate contacts.
            </p>
          </header>

          <article className="rounded-3xl border border-slate-800 bg-[#111811] p-6">
            <h2 className="font-bold text-white">Growth plan feature</h2>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 flex-none text-[#25D366]" /> {feature}
                </li>
              ))}
            </ul>
            <Link href="/billing#plans" className="mt-6 inline-flex rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black hover:bg-[#1fba58]">
              See plans
            </Link>
          </article>
        </div>
      </main>
    );
  }

  const team = await getTeamForOwner(userId);
  const planLabel = accountPlanLabel(owner);

  if (!team) {
    return (
      <main className="px-4 py-7 sm:px-7 sm:py-9">
        <div className="mx-auto max-w-2xl space-y-6 text-center">
          <div className="text-left"><BackLink href="/tools" label="All tools" /></div>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Team outreach</h1>
          <p className="text-slate-400">
            Upload a customer list. Each salesperson taps one shared link and gets WhatsApp opened to their next
            free customer no prefilled message.
          </p>
          <StartTeamButton />
        </div>
      </main>
    );
  }

  const contactLimit = teamOutreachContactLimit(plan);
  const memberLimit = teamOutreachMemberLimit(plan);
  const [members, lists, memberCount, contactTotal] = await Promise.all([
    listMembers(team.id),
    listLists(team.id),
    activeMemberCount(team.id),
    teamContactTotal(team.id),
  ]);

  const teamLink = `${originBase()}/team/${team.code}`;

  return (
    <OutreachClient
      team={{
        id: team.id,
        code: team.code,
        speedLimitSeconds: team.speedLimitSeconds,
        dailyCap: team.dailyCap,
        defaultCountry: team.defaultCountry,
      }}
      teamLink={teamLink}
      members={members.map((m) => ({
        id: m.id,
        name: m.name,
        phone: m.phone,
        email: m.email,
        active: m.active,
        removedAt: m.removedAt ? m.removedAt.toISOString() : null,
      }))}
      lists={lists.map((l) => ({
        id: l.id,
        name: l.name,
        position: l.position,
        status: l.status as OutreachListStatus,
        totalCount: l.totalCount,
        givenCount: l.givenCount,
      }))}
      memberCount={memberCount}
      contactTotal={contactTotal}
      contactLimit={contactLimit}
      memberLimit={memberLimit}
      planLabel={planLabel}
    />
  );
}
