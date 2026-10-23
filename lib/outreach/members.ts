// FEAT-QUEUE: owner-side member management (add one / CSV import / edit /
// remove / logout-all-devices). Plan-gated on active member count
// (lib/plan-limits.ts teamOutreachMemberLimit) via lib/outreach/plan.ts.
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/email-code";
import { cleanOutreachPhone } from "./phone";
import { parseMembersCsv, type MemberImportRow } from "./csv";
import { canAddMember } from "./plan";
import { revokeAllDevicesForMember } from "./device";

export async function listMembers(teamId: string) {
  return prisma.outreachMember.findMany({ where: { teamId }, orderBy: { createdAt: "asc" } });
}

export async function activeMemberCount(teamId: string): Promise<number> {
  return prisma.outreachMember.count({ where: { teamId, active: true, removedAt: null } });
}

export type AddMemberResult =
  | { ok: true; member: Awaited<ReturnType<typeof prisma.outreachMember.create>> }
  | { ok: false; error: string; upgrade?: boolean };

export async function addMember(
  teamId: string,
  input: { name: string; phone: string; email: string },
  defaultCountry: string | null,
  memberLimit: number
): Promise<AddMemberResult> {
  const name = String(input.name ?? "").trim().slice(0, 100);
  const email = normalizeEmail(input.email);
  const phoneResult = cleanOutreachPhone(input.phone, defaultCountry);
  if (!name) return { ok: false, error: "Enter a name." };
  if (!email) return { ok: false, error: "Enter a valid email address." };
  if (!phoneResult.ok) return { ok: false, error: phoneResult.error };

  const current = await activeMemberCount(teamId);
  if (!canAddMember(current, memberLimit)) {
    return { ok: false, error: `Your plan allows ${memberLimit} team members. Remove someone or upgrade to add more.`, upgrade: true };
  }

  const existing = await prisma.outreachMember.findUnique({ where: { teamId_phone: { teamId, phone: phoneResult.digits } } });
  if (existing && !existing.removedAt) return { ok: false, error: "A member with this phone number already exists." };
  if (existing && existing.removedAt) {
    // Re-adding a previously removed member: reactivate the same row rather
    // than creating a duplicate (unique(teamId, phone) would reject a
    // second insert anyway).
    const member = await prisma.outreachMember.update({ where: { id: existing.id }, data: { name, email, active: true, removedAt: null } });
    return { ok: true, member };
  }
  const member = await prisma.outreachMember.create({ data: { teamId, name, email, phone: phoneResult.digits } });
  return { ok: true, member };
}

export type ImportMembersPreview = {
  valid: MemberImportRow[];
  rejected: { row: number; reason: string }[];
  duplicatesInFile: number;
  alreadyOnTeam: number;
};

/** Dry-run preview for a members CSV import: cleans + validates, and reports phones already on the team (not yet created). */
export async function previewMembersImport(teamId: string, csvText: string, defaultCountry: string | null): Promise<ImportMembersPreview> {
  const parsed = parseMembersCsv(csvText, defaultCountry);
  const existing = await prisma.outreachMember.findMany({ where: { teamId, phone: { in: parsed.valid.map((r) => r.phone) } }, select: { phone: true, removedAt: true } });
  const existingActive = new Set(existing.filter((e) => !e.removedAt).map((e) => e.phone));
  const alreadyOnTeam = parsed.valid.filter((r) => existingActive.has(r.phone)).length;
  return { ...parsed, alreadyOnTeam };
}

/** Confirms a members CSV import: creates every valid, not-already-active row (reactivating removed members), up to the plan's member limit. */
export async function confirmMembersImport(
  teamId: string,
  csvText: string,
  defaultCountry: string | null,
  memberLimit: number
): Promise<{ created: number; reactivated: number; skipped: number; blockedByLimit: boolean }> {
  const parsed = parseMembersCsv(csvText, defaultCountry);
  let current = await activeMemberCount(teamId);
  let created = 0, reactivated = 0, skipped = 0, blockedByLimit = false;
  for (const row of parsed.valid) {
    const existing = await prisma.outreachMember.findUnique({ where: { teamId_phone: { teamId, phone: row.phone } } });
    if (existing && !existing.removedAt) { skipped++; continue; }
    if (!canAddMember(current, memberLimit)) { blockedByLimit = true; break; }
    if (existing) {
      await prisma.outreachMember.update({ where: { id: existing.id }, data: { name: row.name, email: row.email, active: true, removedAt: null } });
      reactivated++;
    } else {
      await prisma.outreachMember.create({ data: { teamId, name: row.name, email: row.email, phone: row.phone } });
      created++;
    }
    current++;
  }
  return { created, reactivated, skipped, blockedByLimit };
}

export type EditMemberPatch = { name?: string; email?: string };

export async function editMember(teamId: string, memberId: string, patch: EditMemberPatch) {
  const data: EditMemberPatch = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim().slice(0, 100);
    if (!name) throw new Error("Enter a name.");
    data.name = name;
  }
  if (patch.email !== undefined) {
    const email = normalizeEmail(patch.email);
    if (!email) throw new Error("Enter a valid email address.");
    data.email = email;
  }
  const result = await prisma.outreachMember.updateMany({ where: { id: memberId, teamId }, data });
  if (!result.count) throw new Error("Member not found.");
}

/** Removes a member: blocks every device of theirs immediately (lib/outreach/device.ts checks removedAt on every request). */
export async function removeMember(teamId: string, memberId: string) {
  const result = await prisma.outreachMember.updateMany({ where: { id: memberId, teamId }, data: { active: false, removedAt: new Date() } });
  if (!result.count) throw new Error("Member not found.");
  await revokeAllDevicesForMember(memberId);
}

export async function logoutAllDevices(teamId: string, memberId: string) {
  const member = await prisma.outreachMember.findFirst({ where: { id: memberId, teamId }, select: { id: true } });
  if (!member) throw new Error("Member not found.");
  await revokeAllDevicesForMember(memberId);
}
