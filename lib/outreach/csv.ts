// FEAT-QUEUE: pure CSV parsing + cleaning for team-outreach member and
// customer-list imports. Handles quotes, commas, CRLF/LF and a leading BOM -
// the same shape of parser as app/admin/crm/ContactImport.tsx's
// parseContactCsv, written fresh here so this stays a plain, unit-testable
// server lib module (that file is a 'use client' component and isn't meant
// to be imported from server code).
import { cleanOutreachPhone } from "./phone";
import { normalizeEmail } from "@/lib/email-code";

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const raw = String(text ?? "");
  // Strip a leading BOM without an irregular-whitespace literal in the
  // source (eslint no-irregular-whitespace) - charCode check instead of a
  // regex containing the character itself.
  const value = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '"') {
      if (quoted && value[i + 1] === '"') { cell += '"'; i++; }
      else if (!quoted && cell.length === 0) quoted = true;
      else if (quoted) quoted = false;
      else throw new Error("Invalid CSV quoting.");
    } else if (c === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && value[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("A quoted value is incomplete.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export type RejectedRow = { row: number; reason: string };

export type MemberImportRow = { name: string; phone: string; email: string };
export type ParsedMembersCsv = {
  valid: MemberImportRow[];
  rejected: RejectedRow[];
  duplicatesInFile: number;
};

const MAX_ROWS = 2000;

/** header row -> column index lookup, trimmed + lowercased; "" if not found. */
function headerIndex(header: string[], names: string[]): number {
  for (const name of names) {
    const idx = header.indexOf(name);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Parses + cleans a team members CSV: name, phone, email all required.
 * In-file duplicate phones (after cleaning) are rejected, keeping the first
 * occurrence - callers still check against existing team members
 * separately (that needs the DB).
 */
export function parseMembersCsv(text: string, defaultCountry: string | null | undefined): ParsedMembersCsv {
  const rows = parseCsvRows(text);
  if (rows.length > MAX_ROWS + 1) throw new Error(`Import at most ${MAX_ROWS} rows per file.`);
  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  const nameIdx = headerIndex(header, ["name"]);
  const phoneIdx = headerIndex(header, ["phone", "phone number", "mobile"]);
  const emailIdx = headerIndex(header, ["email"]);
  if (nameIdx === -1 || phoneIdx === -1 || emailIdx === -1) {
    throw new Error("CSV requires name, phone and email columns.");
  }

  const valid: MemberImportRow[] = [];
  const rejected: RejectedRow[] = [];
  const seenPhones = new Set<string>();
  let duplicatesInFile = 0;

  rows.forEach((cells, i) => {
    const rowNum = i + 2; // +1 for header, +1 for 1-based
    const name = (cells[nameIdx] || "").trim().slice(0, 100);
    const emailRaw = (cells[emailIdx] || "").trim();
    const phoneRaw = (cells[phoneIdx] || "").trim();
    if (!name) return rejected.push({ row: rowNum, reason: "Missing name." });
    const email = normalizeEmail(emailRaw);
    if (!email) return rejected.push({ row: rowNum, reason: "Missing or invalid email." });
    const phoneResult = cleanOutreachPhone(phoneRaw, defaultCountry);
    if (!phoneResult.ok) return rejected.push({ row: rowNum, reason: phoneResult.error });
    if (seenPhones.has(phoneResult.digits)) {
      duplicatesInFile++;
      return rejected.push({ row: rowNum, reason: "Duplicate phone number in this file." });
    }
    seenPhones.add(phoneResult.digits);
    valid.push({ name, phone: phoneResult.digits, email });
  });

  return { valid, rejected, duplicatesInFile };
}

export type ContactImportRow = { phone: string; name: string | null; notes: string | null };
export type ParsedContactsCsv = {
  valid: ContactImportRow[];
  rejected: RejectedRow[];
  duplicatesInFile: number;
};

/**
 * Parses + cleans a customer list CSV: phone required, name/notes optional.
 * In-file duplicate phones are rejected (keeping the first occurrence).
 * The "already given out in an older list" check is a separate, DB-backed
 * step (lib/outreach/lists.ts) since it needs to look at other lists.
 */
export function parseContactsCsv(text: string, defaultCountry: string | null | undefined): ParsedContactsCsv {
  const rows = parseCsvRows(text);
  if (rows.length > MAX_ROWS + 1) throw new Error(`Import at most ${MAX_ROWS} rows per file.`);
  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase());
  const phoneIdx = headerIndex(header, ["phone", "phone number", "mobile"]);
  if (phoneIdx === -1) throw new Error("CSV requires a phone column. Optional columns: name, notes.");
  const nameIdx = headerIndex(header, ["name"]);
  const notesIdx = headerIndex(header, ["notes", "note"]);

  const valid: ContactImportRow[] = [];
  const rejected: RejectedRow[] = [];
  const seenPhones = new Set<string>();
  let duplicatesInFile = 0;

  rows.forEach((cells, i) => {
    const rowNum = i + 2;
    const phoneRaw = (cells[phoneIdx] || "").trim();
    const phoneResult = cleanOutreachPhone(phoneRaw, defaultCountry);
    if (!phoneResult.ok) return rejected.push({ row: rowNum, reason: phoneResult.error });
    if (seenPhones.has(phoneResult.digits)) {
      duplicatesInFile++;
      return rejected.push({ row: rowNum, reason: "Duplicate phone number in this file." });
    }
    seenPhones.add(phoneResult.digits);
    const name = nameIdx !== -1 ? (cells[nameIdx] || "").trim().slice(0, 100) || null : null;
    const notes = notesIdx !== -1 ? (cells[notesIdx] || "").trim().slice(0, 500) || null : null;
    valid.push({ phone: phoneResult.digits, name, notes });
  });

  return { valid, rejected, duplicatesInFile };
}
