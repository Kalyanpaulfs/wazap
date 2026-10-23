// FEAT-QUEUE: phone cleaning for team-outreach member/contact imports.
// Thin wrapper over the same libphonenumber-js-based helpers the rotator
// create/edit APIs use (lib/phone.ts) - no new phone-parsing logic here.
// `defaultCountry` is the owner-chosen ISO2 country (OutreachTeam.
// defaultCountry) used to complete numbers typed/uploaded without a country
// code; a number that already has a "+" or looks like a full E.164 number is
// still accepted even when it belongs to a different country.
import { normalizeWhatsAppNumber, isPlausibleE164Digits } from "@/lib/phone";

export type PhoneCleanResult = { ok: true; digits: string } | { ok: false; error: string };

/**
 * Cleans one raw phone string (from a form field or a CSV cell) into
 * digits-only E.164, using `defaultCountry` to complete numbers with no
 * country code. Falls back to the looser isPlausibleE164Digits check when
 * there's no default country to resolve against and the input has no "+"
 * (so a bare local number with no default country is rejected with a clear
 * reason, rather than silently guessed).
 */
export function cleanOutreachPhone(raw: string, defaultCountry: string | null | undefined): PhoneCleanResult {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: false, error: "Phone number is required." };
  if (trimmed.startsWith("+")) {
    const digits = trimmed.replace(/[^\d+]/g, "").slice(1);
    if (isPlausibleE164Digits(digits)) return { ok: true, digits };
    return { ok: false, error: "This doesn't look like a valid phone number." };
  }
  if (!defaultCountry) {
    // No "+" and no owner default country to complete it against - the
    // digits alone aren't enough to know which country this is.
    const digits = trimmed.replace(/\D/g, "");
    if (digits.length >= 8 && isPlausibleE164Digits(digits)) return { ok: true, digits };
    return { ok: false, error: "Add a country code (e.g. +1), or set a default country for this team." };
  }
  const result = normalizeWhatsAppNumber(defaultCountry, trimmed);
  if (!result.ok) return { ok: false, error: result.error || "This doesn't look like a valid phone number." };
  return { ok: true, digits: result.e164Digits };
}

/**
 * Masks a stored E.164 digits-only phone for on-screen display to a
 * salesperson ("+971••••4567" style: a short prefix + stars + last 4
 * digits). Privacy requirement: a salesperson only ever sees their OWN last
 * contact, never the full list - and even that one contact's number is
 * shown masked, never in full. Display only, never used for sending/dialing.
 */
export function maskContactPhone(digits: string): string {
  const clean = String(digits ?? "").replace(/\D/g, "");
  if (!clean) return "";
  if (clean.length <= 4) return `+${clean}`;
  const visible = clean.slice(-4);
  const prefixLen = Math.min(3, clean.length - 4);
  const prefix = clean.slice(0, prefixLen);
  return `+${prefix}••••${visible}`;
}
