import { NextResponse } from "next/server";
import { requireOwnerTeam } from "@/lib/outreach/owner-request";
import { prisma } from "@/lib/prisma";
import { memberTotals, hasBurst, hasManyGiveBacks, contactReportCsv, type ContactReportRow } from "@/lib/outreach/report";

export const dynamic = "force-dynamic";

// GET ?list=<id>&member=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&export=csv
// Report = every given contact (customer -> salesperson -> time), per-member
// totals today/7d/all, and a "many customers in a few minutes" flag.
export async function GET(req: Request) {
  const ctx = await requireOwnerTeam();
  if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const url = new URL(req.url);
  const listId = url.searchParams.get("list") || undefined;
  const memberId = url.searchParams.get("member") || undefined;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const givenAt: { gte?: Date; lte?: Date } = {};
  if (from) givenAt.gte = new Date(from);
  if (to) givenAt.lte = new Date(to);

  const [contacts, members, lists] = await Promise.all([
    prisma.outreachContact.findMany({
      where: {
        teamId: ctx.ctx.team.id,
        givenToMemberId: { not: null },
        ...(listId ? { listId } : {}),
        ...(memberId ? { givenToMemberId: memberId } : {}),
        ...(Object.keys(givenAt).length ? { givenAt } : {}),
      },
      select: { phone: true, name: true, listId: true, givenToMemberId: true, givenAt: true, givenBackAt: true },
      orderBy: { givenAt: "desc" },
      take: 5000,
    }),
    prisma.outreachMember.findMany({ where: { teamId: ctx.ctx.team.id }, select: { id: true, name: true, giveBackCount: true } }),
    prisma.outreachList.findMany({ where: { teamId: ctx.ctx.team.id }, select: { id: true, name: true } }),
  ]);
  const memberNames = new Map(members.map((m) => [m.id, m.name]));
  const listNames = new Map(lists.map((l) => [l.id, l.name]));

  const rows: ContactReportRow[] = contacts.map((c) => ({
    contactPhone: c.phone,
    contactName: c.name,
    listName: listNames.get(c.listId) || "Unknown",
    memberName: c.givenToMemberId ? memberNames.get(c.givenToMemberId) || null : null,
    givenAt: c.givenAt,
    givenBackAt: c.givenBackAt,
  }));

  if (url.searchParams.get("export") === "csv") {
    return new Response(contactReportCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="wazap-team-outreach-report.csv"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  }

  const now = new Date();
  const giveBackCounts = new Map(members.map((m) => [m.id, m.giveBackCount]));
  const totals = memberTotals(
    contacts.filter((c): c is typeof c & { givenToMemberId: string; givenAt: Date } => !!c.givenToMemberId && !!c.givenAt)
      .map((c) => ({ memberId: c.givenToMemberId, memberName: memberNames.get(c.givenToMemberId) || "Unknown", givenAt: c.givenAt })),
    now,
    giveBackCounts
  );
  const burstByMember = new Map<string, boolean>();
  for (const member of members) {
    const timestamps = contacts.filter((c) => c.givenToMemberId === member.id && c.givenAt).map((c) => c.givenAt!.getTime());
    burstByMember.set(member.id, hasBurst(timestamps, 5, 8));
  }

  return NextResponse.json({
    rows,
    totals: totals.map((t) => ({
      ...t,
      burst: burstByMember.get(t.memberId) ?? false,
      manyGiveBacks: hasManyGiveBacks(t.giveBackCount, t.allTime),
    })),
  });
}
