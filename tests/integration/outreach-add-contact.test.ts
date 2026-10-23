// BUG C: integration coverage for lib/outreach/lists.ts addContact - the
// core of the owner's "Add one customer" form. Exercises the real local
// Postgres so the list-status bookkeeping (new list waiting/running,
// reopening a finished list, totalCount increments) is proven against
// actual transactions, same style as tests/integration/outreach-claim.test.ts.
import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { addContact } from "@/lib/outreach/lists";
import { claimNextContact } from "@/lib/outreach/claim";
import { createTestUser, cleanupUser } from "./helpers";

async function makeTeam() {
  const user = await createTestUser({ plan: "pro" });
  const team = await prisma.outreachTeam.create({ data: { userId: user.id, code: "QC" + randomUUID().slice(0, 8).toUpperCase(), speedLimitSeconds: 0 } });
  return { user, team };
}

async function makeList(teamId: string, status: "running" | "waiting" | "paused" | "finished", totalCount = 0, position = 1) {
  return prisma.outreachList.create({ data: { teamId, name: "Existing list", position, status, consentAt: new Date(), totalCount } });
}

const createdUserIds: string[] = [];

afterAll(async () => {
  for (const id of createdUserIds) await cleanupUser(id).catch(() => {});
  await prisma.$disconnect();
});

describe("addContact (BUG C - Add one customer)", () => {
  it("creates a brand new list, running when nothing else is running, with one contact and totalCount 1", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);

    const result = await addContact(team.id, { phone: "+971500000001", name: "Alice", notes: null, newListName: "My new list" }, null, true, 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const list = await prisma.outreachList.findUniqueOrThrow({ where: { id: result.listId } });
    expect(list.status).toBe("running");
    expect(list.totalCount).toBe(1);
    expect(list.name).toBe("My new list");
    const contact = await prisma.outreachContact.findFirstOrThrow({ where: { listId: list.id } });
    expect(contact.phone).toBe("971500000001");
    expect(contact.name).toBe("Alice");
  });

  it("a new list goes to waiting (not running) when another list is already running", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    await makeList(team.id, "running", 1, 1);

    const result = await addContact(team.id, { phone: "+971500000002", name: null, notes: null, newListName: "Second list" }, null, true, 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const list = await prisma.outreachList.findUniqueOrThrow({ where: { id: result.listId } });
    expect(list.status).toBe("waiting");
  });

  it("adds to an existing waiting list and increments its totalCount", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const list = await makeList(team.id, "waiting", 3, 1);

    const result = await addContact(team.id, { phone: "+971500000003", name: null, notes: null, listId: list.id }, null, true, 1000);
    expect(result.ok).toBe(true);
    const updated = await prisma.outreachList.findUniqueOrThrow({ where: { id: list.id } });
    expect(updated.status).toBe("waiting");
    expect(updated.totalCount).toBe(4);
  });

  it("reopens a finished list to running when nothing else is running, so the contact can actually be claimed", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const list = await makeList(team.id, "finished", 2, 1);

    const result = await addContact(team.id, { phone: "+971500000004", name: null, notes: null, listId: list.id }, null, true, 1000);
    expect(result.ok).toBe(true);
    const updated = await prisma.outreachList.findUniqueOrThrow({ where: { id: list.id } });
    expect(updated.status).toBe("running");

    // Prove it's actually claimable now, not just flagged running.
    const member = await prisma.outreachMember.create({ data: { teamId: team.id, name: "M", phone: "971599999999", email: `m+${randomUUID()}@example.test` } });
    const claim = await claimNextContact(member.id);
    expect(claim.ok).toBe(true);
  });

  it("reopens a finished list to waiting (not running) when another list is already running", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    await makeList(team.id, "running", 1, 1);
    const finished = await makeList(team.id, "finished", 2, 2);

    const result = await addContact(team.id, { phone: "+971500000005", name: null, notes: null, listId: finished.id }, null, true, 1000);
    expect(result.ok).toBe(true);
    const updated = await prisma.outreachList.findUniqueOrThrow({ where: { id: finished.id } });
    expect(updated.status).toBe("waiting");
  });

  it("a paused list stays paused (owner's pause is deliberate, not undone by adding a contact)", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const list = await makeList(team.id, "paused", 1, 1);

    const result = await addContact(team.id, { phone: "+971500000006", name: null, notes: null, listId: list.id }, null, true, 1000);
    expect(result.ok).toBe(true);
    const updated = await prisma.outreachList.findUniqueOrThrow({ where: { id: list.id } });
    expect(updated.status).toBe("paused");
  });

  it("rejects a duplicate phone already in the SAME list, with a friendly message", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const list = await makeList(team.id, "waiting", 0, 1);
    await prisma.outreachContact.create({ data: { listId: list.id, teamId: team.id, phone: "971500000007" } });

    const result = await addContact(team.id, { phone: "+971500000007", name: null, notes: null, listId: list.id }, null, true, 1000);
    expect(result).toEqual({ ok: false, error: "This customer is already in this list." });
  });

  it("allows (but flags) a phone already given out in an OLDER list", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const oldList = await makeList(team.id, "finished", 1, 1);
    await prisma.outreachContact.create({
      data: { listId: oldList.id, teamId: team.id, phone: "971500000008", givenToMemberId: "someone", givenAt: new Date() },
    });

    const result = await addContact(team.id, { phone: "+971500000008", name: null, notes: null, newListName: "New list" }, null, true, 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyContactedElsewhere).toBe(true);
  });

  it("does NOT flag a phone that was only ever uploaded, never actually given out", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const oldList = await makeList(team.id, "waiting", 1, 1);
    await prisma.outreachContact.create({ data: { listId: oldList.id, teamId: team.id, phone: "971500000009" } }); // never given

    const result = await addContact(team.id, { phone: "+971500000009", name: null, notes: null, newListName: "New list" }, null, true, 1000);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.alreadyContactedElsewhere).toBe(false);
  });

  it("enforces the plan contact limit with the same error wording as CSV upload, and sets upgrade:true", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    await makeList(team.id, "running", 5, 1); // team total already at the limit

    const result = await addContact(team.id, { phone: "+971500000010", name: null, notes: null, newListName: "New list" }, null, true, 5);
    expect(result).toEqual({ ok: false, error: "This would exceed your plan's 5-contact limit.", upgrade: true });
  });

  it("requires consent even when adding to an existing list", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);
    const list = await makeList(team.id, "waiting", 0, 1);

    const result = await addContact(team.id, { phone: "+971500000011", name: null, notes: null, listId: list.id }, null, false, 1000);
    expect(result).toEqual({ ok: false, error: "Confirm that this customer agreed to be contacted." });
  });

  it("rejects when neither an existing list nor a new list name is given", async () => {
    const { user, team } = await makeTeam();
    createdUserIds.push(user.id);

    const result = await addContact(team.id, { phone: "+971500000012", name: null, notes: null }, null, true, 1000);
    expect(result).toEqual({ ok: false, error: "Choose a list, or name a new one." });
  });
});
