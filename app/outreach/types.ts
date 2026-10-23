// FEAT-QUEUE: shared client-side types for the owner's /outreach page.
// Mirrors the shapes returned by app/api/outreach/** (see lib/outreach/*.ts
// for the server-side source of truth) - kept local to app/outreach so this
// workstream doesn't need to import server-only lib modules into client
// components.

export type OutreachTeamData = {
  id: string;
  code: string;
  speedLimitSeconds: number;
  dailyCap: number | null;
  defaultCountry: string | null;
};

export type OutreachMemberData = {
  id: string;
  name: string;
  phone: string;
  email: string;
  active: boolean;
  removedAt: string | null;
};

export type OutreachListStatus = "waiting" | "running" | "paused" | "finished";

export type OutreachListData = {
  id: string;
  name: string;
  position: number;
  status: OutreachListStatus;
  totalCount: number;
  givenCount: number;
};

export type RejectedRow = { row: number; reason: string };

export type MemberImportRow = { name: string; phone: string; email: string };
export type MembersImportPreview = {
  valid: MemberImportRow[];
  rejected: RejectedRow[];
  duplicatesInFile: number;
  alreadyOnTeam: number;
};
export type MembersImportConfirmResult = {
  created: number;
  reactivated: number;
  skipped: number;
  blockedByLimit: boolean;
};

export type ContactImportRow = { phone: string; name: string | null; notes: string | null };
export type ListUploadPreview = {
  valid: ContactImportRow[];
  rejected: RejectedRow[];
  duplicatesInFile: number;
  alreadyContactedCount: number;
  alreadyContactedPhones: string[];
  overLimit: boolean;
  remainingRoom: number;
};

export type ReportTotalRow = {
  memberId: string;
  memberName: string;
  today: number;
  last7Days: number;
  allTime: number;
  giveBackCount: number;
  burst: boolean;
  manyGiveBacks: boolean;
};

export type ReportContactRow = {
  contactPhone: string;
  contactName: string | null;
  listName: string;
  memberName: string | null;
  givenAt: string | null;
  givenBackAt: string | null;
};
