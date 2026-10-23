// FEAT-QUEUE: the core safety-critical function - handing a salesperson the
// next free customer. "Two members can never get the same contact" is
// guaranteed by a single `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP
// LOCKED LIMIT 1)` statement (Postgres' standard atomic queue-claim idiom),
// run inside a transaction alongside the speed-limit/daily-cap/plan checks
// and list bookkeeping.
//
// List advancement (marking an exhausted list "finished" and starting the
// next "waiting" one) is additionally serialized with a per-team Postgres
// advisory transaction lock (`pg_advisory_xact_lock(hashtext(teamId))`) -
// without it, two concurrent claimers who both see the same list exhausted
// could each advance past a DIFFERENT next list, skipping one out of order.
// Taking the lock up front (before touching any list) means claims for the
// SAME team are fully serialized here; different teams never block each
// other. Given the per-member speed limit (default 20s) this costs no real
// throughput in practice, and correctness matters far more than raw
// concurrency for this feature.
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { OWNER_PLAN_SELECT, teamIsPaused } from "./team";
import { speedLimitCheck, dailyCapReached, utcDayStart, withinGiveBackWindow } from "./speed";

export type ClaimBlockedReason = "removed" | "paused" | "speed_limit" | "daily_cap" | "no_contacts";
export type ClaimResult =
  | { ok: true; contactId: string; phone: string }
  | { ok: false; reason: ClaimBlockedReason; retryAfterMs?: number };

const MAX_LIST_ADVANCES = 200;

async function startNextWaitingList(tx: Prisma.TransactionClient, teamId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "OutreachList" SET "status" = 'running', "updatedAt" = now()
    WHERE id = (
      SELECT id FROM "OutreachList"
      WHERE "teamId" = ${teamId} AND "status" = 'waiting'
      ORDER BY "position" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `;
  return rows.length > 0;
}

export async function claimNextContact(memberId: string, now: Date = new Date()): Promise<ClaimResult> {
  return prisma.$transaction(async (tx) => {
    // Serializes concurrent claims BY THE SAME MEMBER (speed-limit/daily-cap
    // reads below must see a consistent lastGivenAt).
    await tx.$queryRaw`SELECT id FROM "OutreachMember" WHERE id = ${memberId} FOR UPDATE`;
    const member = await tx.outreachMember.findUnique({ where: { id: memberId } });
    if (!member || !member.active || member.removedAt) return { ok: false, reason: "removed" };

    const team = await tx.outreachTeam.findUnique({ where: { id: member.teamId } });
    if (!team) return { ok: false, reason: "removed" };
    const owner = await tx.user.findUnique({ where: { id: team.userId }, select: OWNER_PLAN_SELECT });
    if (teamIsPaused(owner)) return { ok: false, reason: "paused" };

    const speed = speedLimitCheck(member.lastGivenAt, now, team.speedLimitSeconds);
    if (speed.blocked) return { ok: false, reason: "speed_limit", retryAfterMs: speed.retryAfterMs };

    if (team.dailyCap != null) {
      const dayStart = utcDayStart(now);
      const givenToday = await tx.outreachContact.count({ where: { teamId: team.id, givenToMemberId: memberId, givenAt: { gte: dayStart } } });
      if (dailyCapReached(givenToday, team.dailyCap)) return { ok: false, reason: "daily_cap" };
    }

    // Per-team critical section for list claiming/advancement - see file
    // comment. $executeRaw (not $queryRaw): pg_advisory_xact_lock returns
    // void, which $queryRaw can't deserialize into a result row.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${team.id}))`;

    for (let i = 0; i < MAX_LIST_ADVANCES; i++) {
      const runningList = await tx.outreachList.findFirst({ where: { teamId: team.id, status: "running" }, orderBy: { position: "asc" }, select: { id: true } });
      if (!runningList) {
        if (!(await startNextWaitingList(tx, team.id))) return { ok: false, reason: "no_contacts" };
        continue;
      }

      // The atomic claim: a free contact is one never given, OR given back
      // and not yet reassigned (givenBackAt set). Claiming resets the
      // give-back markers for this new assignment.
      const claimed = await tx.$queryRaw<{ id: string; phone: string }[]>`
        UPDATE "OutreachContact"
        SET "givenToMemberId" = ${memberId}, "givenAt" = ${now}, "givenBackAt" = NULL, "givenBackByMemberId" = NULL
        WHERE id = (
          SELECT id FROM "OutreachContact"
          WHERE "listId" = ${runningList.id} AND ("givenToMemberId" IS NULL OR "givenBackAt" IS NOT NULL)
          ORDER BY "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING id, phone
      `;
      if (claimed.length) {
        await tx.outreachList.update({ where: { id: runningList.id }, data: { givenCount: { increment: 1 } } });
        await tx.outreachMember.update({ where: { id: memberId }, data: { lastGivenAt: now } });
        return { ok: true, contactId: claimed[0].id, phone: claimed[0].phone };
      }

      // This list has no free contact left - finish it and start the next waiting one.
      await tx.outreachList.update({ where: { id: runningList.id }, data: { status: "finished" } });
      if (!(await startNextWaitingList(tx, team.id))) return { ok: false, reason: "no_contacts" };
    }
    return { ok: false, reason: "no_contacts" };
  }, { timeout: 8000 });
}

export type GiveBackResult = { ok: true; contactId: string } | { ok: false; error: string };

/** "Give back" a mis-tap: returns the member's own LAST given contact to the pool, within the 10-minute window. */
export async function giveBack(memberId: string, now: Date = new Date()): Promise<GiveBackResult> {
  return prisma.$transaction(async (tx) => {
    const member = await tx.outreachMember.findUnique({ where: { id: memberId } });
    if (!member || !member.active || member.removedAt) return { ok: false, error: "Member not found." };
    const contact = await tx.outreachContact.findFirst({
      where: { givenToMemberId: memberId, givenBackAt: null },
      orderBy: { givenAt: "desc" },
    });
    if (!contact || !contact.givenAt) return { ok: false, error: "Nothing to give back." };
    if (!withinGiveBackWindow(contact.givenAt, now)) return { ok: false, error: "The 10-minute give-back window has passed." };
    const result = await tx.outreachContact.updateMany({
      where: { id: contact.id, givenToMemberId: memberId, givenBackAt: null },
      data: { givenBackAt: now, givenBackByMemberId: memberId },
    });
    if (!result.count) return { ok: false, error: "Nothing to give back." };
    // The contact goes back into its list's pool, so the list's givenCount
    // (incremented on claim - see claimNextContact above) must come back
    // down too, or a given-back-then-reclaimed contact is counted twice.
    await tx.outreachList.update({ where: { id: contact.listId }, data: { givenCount: { decrement: 1 } } });
    // Flag for the owner's report: members with many give-backs (mis-taps,
    // or someone gaming the queue) - see lib/outreach/report.ts.
    await tx.outreachMember.update({ where: { id: memberId }, data: { giveBackCount: { increment: 1 } } });
    return { ok: true, contactId: contact.id };
  }, { timeout: 5000 });
}
