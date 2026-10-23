// FEAT-QUEUE: proves the atomic claim's core safety property against the
// real local Postgres - 20 parallel claims on the same list never hand out
// the same contact twice, and the list correctly finishes + the next
// waiting list starts once contacts run out.
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { claimNextContact, giveBack } from "@/lib/outreach/claim";
import { createTestUser, cleanupUser } from "./helpers";

async function makeTeam(plan = "pro") {
  const user = await createTestUser({ plan });
  const team = await prisma.outreachTeam.create({ data: { userId: user.id, code: "QA" + randomUUID().slice(0, 8).toUpperCase(), speedLimitSeconds: 0 } });
  return { user, team };
}

async function makeMembers(teamId: string, count: number) {
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      prisma.outreachMember.create({ data: { teamId, name: `Member ${i}`, phone: `97150000${String(i).padStart(4, "0")}`, email: `member${i}+${randomUUID()}@example.test` } })
    )
  );
}

async function makeList(teamId: string, contactCount: number, status: "running" | "waiting" = "running", position = 1) {
  const list = await prisma.outreachList.create({ data: { teamId, name: "QA list", position, status, consentAt: new Date(), totalCount: contactCount } });
  await prisma.outreachContact.createMany({
    data: Array.from({ length: contactCount }, (_, i) => ({ listId: list.id, teamId, phone: `97160000${String(i).padStart(4, "0")}` })),
  });
  return list;
}

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) await cleanupUser(id).catch(() => {});
  await prisma.$disconnect();
});

describe("claimNextContact concurrency", () => {
  it("20 parallel claims on a 15-contact list never return the same contact, and blocks the rest with no_contacts", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const members = await makeMembers(team.id, 20);
    await makeList(team.id, 15);

    const results = await Promise.all(members.map((m) => claimNextContact(m.id)));
    const claimedIds = results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok).map((r) => r.contactId);

    expect(claimedIds).toHaveLength(15);
    expect(new Set(claimedIds).size).toBe(15); // no duplicates

    const blocked = results.filter((r) => !r.ok);
    expect(blocked).toHaveLength(5);
    for (const b of blocked) {
      if (!b.ok) expect(b.reason).toBe("no_contacts");
    }

    const totalGiven = await prisma.outreachContact.count({ where: { listId: (await prisma.outreachList.findFirstOrThrow({ where: { teamId: team.id } })).id, givenToMemberId: { not: null } } });
    expect(totalGiven).toBe(15);
  }, 30_000);

  it("advances to the next waiting list once the running list is exhausted", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const members = await makeMembers(team.id, 3);
    const listA = await makeList(team.id, 2, "running", 1);
    const listB = await makeList(team.id, 5, "waiting", 2);

    const [r1, r2, r3] = await Promise.all(members.map((m) => claimNextContact(m.id)));
    expect([r1, r2, r3].every((r) => r.ok)).toBe(true);

    const finishedA = await prisma.outreachList.findUniqueOrThrow({ where: { id: listA.id } });
    expect(finishedA.status).toBe("finished");
    const runningB = await prisma.outreachList.findUniqueOrThrow({ where: { id: listB.id } });
    expect(runningB.status).toBe("running");
  }, 30_000);

  it("give-back returns the member's last contact to the pool within the window", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const [member] = await makeMembers(team.id, 1);
    await makeList(team.id, 1);

    const claim = await claimNextContact(member.id);
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;

    const back = await giveBack(member.id);
    expect(back).toEqual({ ok: true, contactId: claim.contactId });

    const contact = await prisma.outreachContact.findUniqueOrThrow({ where: { id: claim.contactId } });
    expect(contact.givenBackAt).not.toBeNull();
    expect(contact.givenBackByMemberId).toBe(member.id);

    // The same contact is claimable again (back in the pool).
    const reclaim = await claimNextContact(member.id);
    expect(reclaim).toEqual({ ok: true, contactId: claim.contactId, phone: claim.phone });
  }, 30_000);

  it("give-back decrements the list's givenCount and increments the member's giveBackCount (STEP 0a/0b)", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const [member] = await makeMembers(team.id, 1);
    const list = await makeList(team.id, 1);

    const claim = await claimNextContact(member.id);
    expect(claim.ok).toBe(true);
    const givenList = await prisma.outreachList.findUniqueOrThrow({ where: { id: list.id } });
    expect(givenList.givenCount).toBe(1);

    const back = await giveBack(member.id);
    expect(back.ok).toBe(true);

    const afterGiveBack = await prisma.outreachList.findUniqueOrThrow({ where: { id: list.id } });
    expect(afterGiveBack.givenCount).toBe(0); // decremented, not double-counted on reclaim

    const memberRow = await prisma.outreachMember.findUniqueOrThrow({ where: { id: member.id } });
    expect(memberRow.giveBackCount).toBe(1);

    // Reclaiming the same contact increments givenCount back to 1, not 2.
    const reclaim = await claimNextContact(member.id);
    expect(reclaim.ok).toBe(true);
    const afterReclaim = await prisma.outreachList.findUniqueOrThrow({ where: { id: list.id } });
    expect(afterReclaim.givenCount).toBe(1);
  }, 30_000);

  it("blocks claims once the owner's plan no longer covers team outreach", async () => {
    const { user, team } = await makeTeam("free");
    createdUserIds.push(user.id);
    const [member] = await makeMembers(team.id, 1);
    await makeList(team.id, 1);

    const result = await claimNextContact(member.id);
    expect(result).toEqual({ ok: false, reason: "paused" });
  }, 30_000);
});
