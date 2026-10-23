import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getTeamByCode, teamIsPaused } from "@/lib/outreach/team";
import { OUTREACH_DEVICE_COOKIE, checkDeviceStatus } from "@/lib/outreach/device";
import { utcDayStart, withinGiveBackWindow } from "@/lib/outreach/speed";
import { maskContactPhone } from "@/lib/outreach/phone";
import TeamLoginClient from "../TeamLoginClient";
import TeamHomeClient from "../TeamHomeClient";

// FEAT-QUEUE phase 3: the salesperson's landing/return page. Reached either
// directly (bookmarked / "add to home screen") or via a redirect from
// app/team/[code]/route.ts (the tap-to-claim link), which carries WHY it
// bounced here (blocked/retryAfterMs) when a signed-in device's claim was
// blocked. Every other state (team not found, paused, removed, signed out)
// is re-derived here independently, not trusted from query params.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0f0a] px-5 py-10">
      <div className="w-full max-w-sm text-center">{children}</div>
    </main>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <h1 className="text-xl font-bold text-white">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-400">{body}</p>
    </Shell>
  );
}

export default async function TeamHomePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ blocked?: string; retryAfterMs?: string }>;
}) {
  const { code } = await params;
  const sp = await searchParams;

  const found = await getTeamByCode(code);
  if (!found) {
    return <Message title="Link not found" body="This team link doesn't exist. Check the link your manager sent you." />;
  }
  if (teamIsPaused(found.owner)) {
    return <Message title="Not available right now" body="This team link isn't active right now. Ask your manager to check their plan." />;
  }

  const cookieStore = await cookies();
  const status = await checkDeviceStatus(cookieStore.get(OUTREACH_DEVICE_COOKIE)?.value);

  if (!status.ok && status.reason === "removed") {
    return <Message title="You're no longer on this team" body="If this is a mistake, contact your manager." />;
  }

  if (!status.ok) {
    return (
      <Shell>
        <h1 className="text-xl font-bold text-white">Sign in</h1>
        <p className="mt-2 text-sm text-slate-400">Enter your phone number to get your next customer.</p>
        <div className="mt-6 text-left">
          <TeamLoginClient code={code} defaultCountry={found.team.defaultCountry} />
        </div>
      </Shell>
    );
  }

  const now = new Date();
  const [member, todayCount, lastContactRow] = await Promise.all([
    prisma.outreachMember.findUniqueOrThrow({ where: { id: status.memberId }, select: { name: true } }),
    prisma.outreachContact.count({ where: { teamId: status.teamId, givenToMemberId: status.memberId, givenAt: { gte: utcDayStart(now) } } }),
    prisma.outreachContact.findFirst({ where: { givenToMemberId: status.memberId, givenBackAt: null }, orderBy: { givenAt: "desc" } }),
  ]);

  const lastContact =
    lastContactRow && lastContactRow.givenAt && withinGiveBackWindow(lastContactRow.givenAt, now)
      ? { name: lastContactRow.name, maskedPhone: maskContactPhone(lastContactRow.phone) }
      : null;

  return (
    <Shell>
      <TeamHomeClient
        code={code}
        memberName={member.name}
        todayCount={todayCount}
        lastContact={lastContact}
        blocked={sp.blocked ?? null}
        retryAfterMs={sp.retryAfterMs ? Number(sp.retryAfterMs) : null}
      />
    </Shell>
  );
}
