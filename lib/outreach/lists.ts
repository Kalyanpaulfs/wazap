// FEAT-QUEUE: owner-side customer list management - upload (dry-run +
// confirm), pause/resume, reorder, delete. Lists run one at a time in
// `position` order; lib/outreach/claim.ts owns advancing waiting -> running
// -> finished as contacts run out.
import { prisma } from "@/lib/prisma";
import { parseContactsCsv, type ContactImportRow } from "./csv";
import { cleanOutreachPhone } from "./phone";
import { canUploadContacts } from "./plan";

export async function listLists(teamId: string) {
  return prisma.outreachList.findMany({ where: { teamId }, orderBy: { position: "asc" } });
}

export async function teamContactTotal(teamId: string): Promise<number> {
  const result = await prisma.outreachList.aggregate({ where: { teamId }, _sum: { totalCount: true } });
  return result._sum.totalCount ?? 0;
}

export type UploadPreview = {
  valid: ContactImportRow[];
  rejected: { row: number; reason: string }[];
  duplicatesInFile: number;
  alreadyContactedCount: number;
  alreadyContactedPhones: string[];
  overLimit: boolean;
  remainingRoom: number;
};

/** Dry run: cleans the CSV and reports how many of the valid phones were already given out in an OLDER list of this team. */
export async function previewListUpload(teamId: string, csvText: string, defaultCountry: string | null, contactLimit: number): Promise<UploadPreview> {
  const parsed = parseContactsCsv(csvText, defaultCountry);
  const phones = parsed.valid.map((r) => r.phone);
  const alreadyGiven = phones.length
    ? await prisma.outreachContact.findMany({
        where: { teamId, phone: { in: phones }, givenToMemberId: { not: null } },
        select: { phone: true },
        distinct: ["phone"],
      })
    : [];
  const alreadyContactedPhones = alreadyGiven.map((r) => r.phone);
  const currentTotal = await teamContactTotal(teamId);
  const remainingRoom = Math.max(0, contactLimit - currentTotal);
  return {
    ...parsed,
    alreadyContactedCount: alreadyContactedPhones.length,
    alreadyContactedPhones,
    overLimit: !canUploadContacts(currentTotal, parsed.valid.length, contactLimit),
    remainingRoom,
  };
}

export type ConfirmUploadResult =
  | { ok: true; listId: string; created: number; skippedDuplicates: number }
  | { ok: false; error: string; upgrade?: boolean };

/**
 * Creates a new list from a CSV, after the owner has seen the dry-run
 * preview. `duplicateChoice` decides what happens to phones already given
 * out in an older list: "skip" (default) excludes them, "include" keeps
 * them (the owner may want the same customer re-contacted).
 */
export async function confirmListUpload(
  teamId: string,
  name: string,
  csvText: string,
  defaultCountry: string | null,
  consent: boolean,
  duplicateChoice: "skip" | "include",
  contactLimit: number
): Promise<ConfirmUploadResult> {
  if (!consent) return { ok: false, error: "Confirm that these customers agreed to be contacted." };
  const parsed = parseContactsCsv(csvText, defaultCountry);
  if (!parsed.valid.length) return { ok: false, error: "No valid contacts to import." };

  let rows = parsed.valid;
  let skippedDuplicates = 0;
  if (duplicateChoice === "skip") {
    const phones = rows.map((r) => r.phone);
    const alreadyGiven = await prisma.outreachContact.findMany({
      where: { teamId, phone: { in: phones }, givenToMemberId: { not: null } },
      select: { phone: true },
      distinct: ["phone"],
    });
    const alreadyGivenSet = new Set(alreadyGiven.map((r) => r.phone));
    const before = rows.length;
    rows = rows.filter((r) => !alreadyGivenSet.has(r.phone));
    skippedDuplicates = before - rows.length;
  }
  if (!rows.length) return { ok: false, error: "Every contact in this file was already contacted in an older list." };

  const currentTotal = await teamContactTotal(teamId);
  if (!canUploadContacts(currentTotal, rows.length, contactLimit)) {
    return { ok: false, error: `This would exceed your plan's ${contactLimit.toLocaleString()}-contact limit.`, upgrade: true };
  }

  const listName = name.trim().slice(0, 100) || "Untitled list";
  const result = await prisma.$transaction(async (tx) => {
    const [{ _max }, runningExists] = await Promise.all([
      tx.outreachList.aggregate({ where: { teamId }, _max: { position: true } }),
      tx.outreachList.findFirst({ where: { teamId, status: "running" }, select: { id: true } }),
    ]);
    const position = (_max.position ?? 0) + 1;
    const list = await tx.outreachList.create({
      data: {
        teamId,
        name: listName,
        position,
        status: runningExists ? "waiting" : "running",
        consentAt: new Date(),
        totalCount: rows.length,
      },
    });
    await tx.outreachContact.createMany({
      data: rows.map((r) => ({ listId: list.id, teamId, phone: r.phone, name: r.name, notes: r.notes })),
    });
    return list;
  });
  return { ok: true, listId: result.id, created: rows.length, skippedDuplicates };
}

export type AddContactInput = {
  phone: string;
  name: string | null;
  notes: string | null;
  // Exactly one of these must be given - an existing list's id, or a name
  // for a brand new one.
  listId?: string;
  newListName?: string;
};

export type AddContactResult =
  | { ok: true; listId: string; listName: string; alreadyContactedElsewhere: boolean }
  | { ok: false; error: string; upgrade?: boolean };

/**
 * BUG C: owner adds ONE customer by hand (the "Add one customer" form on the
 * Customer lists tab, mirroring "Add one salesperson" on Team). Reuses the
 * same rules as the CSV upload path above:
 * - phone cleaned with cleanOutreachPhone (same helper parseContactsCsv uses)
 * - the plan contact limit, with the exact same error wording confirmListUpload uses
 * - consent is required every time (CSV's rule), but consentAt is only
 *   stamped when a brand NEW list is created here - an existing list already
 *   has one from when it was created.
 * - a duplicate phone already in the SAME list is rejected
 * - a phone already given out in an OLDER list is allowed, just flagged back
 *   (`alreadyContactedElsewhere`) - same information the CSV dry-run preview
 *   surfaces before upload, not a block.
 * - a 'finished' list is reopened ('running' if nothing else is running,
 *   else 'waiting') - lib/outreach/claim.ts only ever claims from a
 *   'running' list, so without this the new contact would never be handed
 *   out. 'waiting'/'running'/'paused' lists keep their current status.
 */
export async function addContact(
  teamId: string,
  input: AddContactInput,
  defaultCountry: string | null,
  consent: boolean,
  contactLimit: number
): Promise<AddContactResult> {
  if (!consent) return { ok: false, error: "Confirm that this customer agreed to be contacted." };
  if (!input.listId && !input.newListName?.trim()) return { ok: false, error: "Choose a list, or name a new one." };
  const phoneResult = cleanOutreachPhone(input.phone, defaultCountry);
  if (!phoneResult.ok) return { ok: false, error: phoneResult.error };
  const name = input.name?.trim().slice(0, 100) || null;
  const notes = input.notes?.trim().slice(0, 500) || null;

  const currentTotal = await teamContactTotal(teamId);
  if (!canUploadContacts(currentTotal, 1, contactLimit)) {
    return { ok: false, error: `This would exceed your plan's ${contactLimit.toLocaleString()}-contact limit.`, upgrade: true };
  }

  // Informational only (not a block) - same signal the CSV dry-run preview
  // gives before upload.
  const alreadyGivenElsewhere = await prisma.outreachContact.findFirst({
    where: { teamId, phone: phoneResult.digits, givenToMemberId: { not: null } },
    select: { id: true },
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      let list;
      if (input.listId) {
        list = await tx.outreachList.findFirst({ where: { id: input.listId, teamId } });
        if (!list) throw new Error("List not found.");
        const duplicate = await tx.outreachContact.findFirst({ where: { listId: list.id, phone: phoneResult.digits }, select: { id: true } });
        if (duplicate) throw new Error("This customer is already in this list.");
        if (list.status === "finished") {
          const runningExists = await tx.outreachList.findFirst({ where: { teamId, status: "running" }, select: { id: true } });
          list = await tx.outreachList.update({ where: { id: list.id }, data: { status: runningExists ? "waiting" : "running" } });
        }
      } else {
        const listName = (input.newListName || "").trim().slice(0, 100) || "Untitled list";
        const [{ _max }, runningExists] = await Promise.all([
          tx.outreachList.aggregate({ where: { teamId }, _max: { position: true } }),
          tx.outreachList.findFirst({ where: { teamId, status: "running" }, select: { id: true } }),
        ]);
        const position = (_max.position ?? 0) + 1;
        list = await tx.outreachList.create({
          data: { teamId, name: listName, position, status: runningExists ? "waiting" : "running", consentAt: new Date(), totalCount: 0 },
        });
      }
      await tx.outreachContact.create({ data: { listId: list.id, teamId, phone: phoneResult.digits, name, notes } });
      const updated = await tx.outreachList.update({ where: { id: list.id }, data: { totalCount: { increment: 1 } } });
      return { listId: updated.id, listName: updated.name };
    });
    return { ok: true, listId: result.listId, listName: result.listName, alreadyContactedElsewhere: Boolean(alreadyGivenElsewhere) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not add this customer." };
  }
}

export async function pauseList(teamId: string, listId: string, paused: boolean) {
  const list = await prisma.outreachList.findFirst({ where: { id: listId, teamId } });
  if (!list) throw new Error("List not found.");
  if (paused) {
    if (list.status !== "running" && list.status !== "waiting") throw new Error("Only a waiting or running list can be paused.");
    await prisma.outreachList.update({ where: { id: listId }, data: { status: "paused" } });
    return;
  }
  if (list.status !== "paused") throw new Error("List is not paused.");
  // Resuming: if another list is already running, this one goes back to
  // waiting (still respects position order); otherwise it starts running
  // immediately.
  const runningExists = await prisma.outreachList.findFirst({ where: { teamId, status: "running" }, select: { id: true } });
  await prisma.outreachList.update({ where: { id: listId }, data: { status: runningExists ? "waiting" : "running" } });
}

/** Reorders every "waiting" list for the team to match `orderedIds` (running/finished/paused lists keep their position otherwise, but the whole set is renumbered by this order so later waiting-list inserts stay consistent). */
export async function reorderLists(teamId: string, orderedIds: string[]) {
  const existing = await prisma.outreachList.findMany({ where: { teamId }, select: { id: true } });
  const existingIds = new Set(existing.map((l) => l.id));
  if (orderedIds.length !== existing.length || !orderedIds.every((id) => existingIds.has(id))) {
    throw new Error("Reorder list must include every list exactly once.");
  }
  await prisma.$transaction(orderedIds.map((id, i) => prisma.outreachList.update({ where: { id }, data: { position: i + 1 } })));
}

/** Hard-deletes a list and its contacts (privacy requirement - deleting a list deletes its customer data). */
export async function deleteList(teamId: string, listId: string) {
  const result = await prisma.outreachList.deleteMany({ where: { id: listId, teamId } });
  if (!result.count) throw new Error("List not found.");
}
