// UX-1 audit hardening: one shared, pure (no DB, no React) place that turns
// whatever a customer typed into a phone box into a safe WhatsApp number -
// or a plain-English reason it can't. Used by app/components/PhoneInput.tsx
// (live, client-side) AND by the three create/edit API routes (server-side,
// defence in depth) so a request that skips the UI can't save garbage.
//
// The bug this exists to fix: the old create forms had a country dropdown
// hard-coded to UAE (+971) and just concatenated dial + digits. A customer
// who typed their own country code ("+91 98765 43210") or a local number
// with a leading trunk 0 ("050 123 4567") got a number that was silently
// WRONG (971919876543210 / 9710501234567) - no warning, no block.
import { isPossiblePhoneNumber, isValidPhoneNumber, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/min";
import { Metadata as CoreMetadata } from "libphonenumber-js/core";
import fullMetadata from "libphonenumber-js/metadata.max.json";
import { COUNTRIES } from "./countries";

export type PhoneNormalizeResult = {
  ok: boolean;
  /** Digits only, no leading "+" - what gets saved to the DB. "" when !ok. */
  e164Digits: string;
  /** National significant number, e.g. "50 123 4567" - "" when !ok. */
  national: string;
  /** ISO country actually used to validate (may differ from what was passed in, e.g. a pasted "+91…" while UAE is selected). */
  countryCode: CountryCode | null;
  /** Plain-English reason, only set when !ok. Absent (not just falsy) while the box is simply empty. */
  error?: string;
};

function findCountryByIso(iso: string) {
  return COUNTRIES.find((c) => c.code === iso.toUpperCase()) ?? null;
}
function findCountryByDial(dial: string) {
  const clean = dial.replace(/\D/g, "");
  if (!clean) return null;
  return COUNTRIES.find((c) => c.dial.replace("+", "") === clean) ?? null;
}
/** `dialOrCountry` is either a 2-letter ISO code ("AE") or a bare dial code ("971") - callers use whichever they already have. */
function resolveCountry(dialOrCountry: string) {
  const value = String(dialOrCountry ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(value)) return findCountryByIso(value);
  return findCountryByDial(value);
}

// ---------------------------------------------------------------------------
// Per-country mobile-number digit length (owner request: stop the number
// box accepting more digits than the selected country allows). The /min
// metadata bundle used above strips per-number-type data to save bytes, so
// the MOBILE-specific possible lengths it exposes are the combined range
// across every number type for that country (e.g. AE: 5-12, not the
// mobile-only 9) - no good for a length cap. The full (/max) bundle keeps
// the per-type breakdown, so it's used here instead, read straight from the
// library's own metadata rather than a hand-typed table - a metadata update
// changes this automatically, including for countries not explicitly
// called out anywhere in this file.
//
// `hasCountry`/`hasTypes`/`type(...)` exist on the real runtime class
// (libphonenumber-js source/metadata.js) but aren't part of its published
// .d.ts (which only types selectNumberingPlan/numberingPlan), hence the
// narrow local interface below instead of reaching for `any`.
interface MobileLengthMetadata {
  hasCountry(country: string): boolean;
  selectNumberingPlan(country: CountryCode): void;
  hasTypes(): boolean;
  type(type: "MOBILE"): { possibleLengths(): number[] } | undefined;
  possibleLengths(): number[];
}

export type CountryLengthRange = { min: number; max: number };

const lengthRangeCache = new Map<string, CountryLengthRange | null>();

/** Mobile-number national-length range for `iso` (e.g. AE -> {min:9, max:9}, ID -> {min:9, max:12}), or null for an unrecognized/unsupported country. */
export function countryMobileLengthRange(iso: string | null | undefined): CountryLengthRange | null {
  const code = String(iso ?? "").toUpperCase();
  if (!code) return null;
  if (lengthRangeCache.has(code)) return lengthRangeCache.get(code) ?? null;
  let result: CountryLengthRange | null = null;
  try {
    const metadata = new CoreMetadata(fullMetadata) as unknown as MobileLengthMetadata;
    if (metadata.hasCountry(code)) {
      metadata.selectNumberingPlan(code as CountryCode);
      const mobile = metadata.hasTypes() ? metadata.type("MOBILE") : undefined;
      const lengths = mobile ? mobile.possibleLengths() : metadata.possibleLengths();
      if (lengths && lengths.length) result = { min: Math.min(...lengths), max: Math.max(...lengths) };
    }
  } catch {
    result = null;
  }
  lengthRangeCache.set(code, result);
  return result;
}

/**
 * Max characters the national-number box should accept for `iso`, before
 * any "+<country><national>" paste is parsed down to national form and
 * re-clamped for its OWN country. One extra digit is allowed only when the
 * first digit typed is a trunk "0" (normalizeWhatsAppNumber below drops
 * exactly one leading zero before validating), so a customer who always
 * starts a local number with the trunk prefix isn't cut off a digit short.
 * Falls back to the absolute E.164 national ceiling (15 minus the shortest
 * dial code, rounded up to 15) when the country/range is unknown.
 */
export function countryRawMaxLength(iso: string | null | undefined, rawStartsWithZero: boolean): number {
  const range = countryMobileLengthRange(iso);
  const max = range ? range.max : 15;
  return max + (rawStartsWithZero ? 1 : 0);
}

/** "UAE mobile numbers have 9 digits (without +971)." / "...have 9-12 digits (without +62)." - the hint shown under the number box. Null when the country/range is unknown. */
export function countryLengthHint(iso: string | null | undefined): string | null {
  const range = countryMobileLengthRange(iso);
  const country = findCountryByIso(String(iso ?? ""));
  if (!range || !country) return null;
  const lenText = range.min === range.max ? `${range.max} digits` : `${range.min}-${range.max} digits`;
  return `${country.name} mobile numbers have ${lenText} (without ${country.dial}).`;
}

function isValidOrPossible(e164: string, iso: CountryCode | undefined): boolean {
  const withPlus = "+" + e164;
  try {
    // Prefer strict metadata validation - rejects most mistyped/double-
    // prefixed numbers outright.
    if (iso ? isValidPhoneNumber(withPlus, iso) : isValidPhoneNumber(withPlus)) return true;
  } catch {
    /* fall through to the possible-length check below */
  }
  try {
    // Fall back to "possible" (correct digit-length for the country, not
    // necessarily an assigned range) rather than hard-rejecting. The /min
    // metadata lags newer mobile prefixes in some countries, and we'd
    // rather let a genuine customer number through than block it on a
    // library gap. The absolute 8-15 digit E.164 bound plus this
    // per-country length check still catches the typo/double-prefix cases
    // this feature exists for.
    return iso ? isPossiblePhoneNumber(withPlus, iso) : isPossiblePhoneNumber(withPlus);
  } catch {
    return false;
  }
}

/**
 * Normalizes one phone box's raw text into a safe, saveable WhatsApp number.
 *
 * Rules (in order):
 * - letters anywhere -> "Numbers only."
 * - empty input -> not ok, no error (nothing typed yet - not a mistake).
 * - a leading "+" -> parsed as a full international number, ignoring
 *   `dialOrCountry` entirely (a pasted "+91…" wins over a UAE selector).
 * - otherwise: if the digits already start with the selected country's own
 *   dial code AND that reading is valid/possible, don't prefix it again
 *   (fixes the "971971…" / "9719…" double-prefix bug); else if it starts
 *   with a trunk "0", drop the leading zero(s) before prefixing the dial
 *   code; else just prefix the dial code.
 * - absolute bound: 8-15 digits total (E.164).
 * - final check: libphonenumber-js isValidPhoneNumber, falling back to
 *   isPossiblePhoneNumber (see isValidOrPossible above).
 */
export function normalizeWhatsAppNumber(dialOrCountry: string, rawInput: string): PhoneNormalizeResult {
  const selected = resolveCountry(dialOrCountry);
  const selectedName = selected?.name ?? "that country";
  const fail = (error: string, countryCode: CountryCode | null = null): PhoneNormalizeResult => ({
    ok: false,
    e164Digits: "",
    national: "",
    countryCode,
    error,
  });

  const raw = String(rawInput ?? "");
  if (/[a-zA-Z]/.test(raw)) return fail("Numbers only.");

  let cleaned = raw.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) cleaned = "+" + cleaned.slice(1).replace(/\+/g, "");
  else cleaned = cleaned.replace(/\+/g, "");
  if (!cleaned || cleaned === "+") return { ok: false, e164Digits: "", national: "", countryCode: selected?.code as CountryCode | null };

  if (cleaned.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(cleaned);
    if (!parsed || !parsed.country) return fail(`This doesn't look like a valid ${selectedName} number.`, (selected?.code as CountryCode) ?? null);
    const e164 = parsed.number.replace("+", "");
    if (e164.length < 8) return fail(`This number looks too short for ${parsed.country}.`, parsed.country as CountryCode);
    if (e164.length > 15) return fail(`This number looks too long for ${parsed.country}.`, parsed.country as CountryCode);
    if (!isValidOrPossible(e164, parsed.country as CountryCode)) {
      const name = findCountryByIso(parsed.country)?.name ?? parsed.country;
      return fail(`This doesn't look like a valid ${name} number.`, parsed.country as CountryCode);
    }
    return { ok: true, e164Digits: e164, national: parsed.formatNational(), countryCode: parsed.country as CountryCode };
  }

  if (!selected) return fail("Choose a country.");
  const dialDigits = selected.dial.replace("+", "");
  const digits = cleaned;

  // Two readings of the same typed digits: "the dial code is already there"
  // vs. "it's a local number, maybe with a leading trunk 0". Try the one
  // that looks like it was intended (dial-code-prefixed, when applicable)
  // first; validity decides between them.
  //
  // Known gap: typing another country's full number WITHOUT a leading "+"
  // (e.g. "919876543210" while UAE is selected) isn't reliably caught -
  // isPossiblePhoneNumber's length-only fallback (see isValidOrPossible)
  // tends to accept the resulting digit count for most country pairs. The
  // two cases the owner actually reported - a pasted "+<country>…" number,
  // and a local number with a leading trunk 0 - are both handled correctly
  // above/below because a leading "+" always wins outright. Always typing
  // the "+" for a foreign number (which every phone's contacts app does)
  // avoids this gap entirely.
  const candidates: string[] = [];
  if (digits.length > dialDigits.length && digits.startsWith(dialDigits)) candidates.push(digits);
  const withoutTrunkZero = digits.replace(/^0+/, "");
  const prefixed = dialDigits + withoutTrunkZero;
  if (!candidates.includes(prefixed)) candidates.push(prefixed);

  for (const candidate of candidates) {
    if (candidate.length < 8 || candidate.length > 15) continue;
    if (isValidOrPossible(candidate, selected.code as CountryCode)) {
      const parsed = parsePhoneNumberFromString("+" + candidate);
      return {
        ok: true,
        e164Digits: candidate,
        national: parsed?.formatNational() ?? candidate,
        countryCode: (parsed?.country as CountryCode) ?? (selected.code as CountryCode),
      };
    }
  }

  // Nothing validated - report the most plausible candidate's length problem,
  // or a generic "not valid" if its length was in bounds.
  const primary = candidates[0];
  if (primary.length < 8) return fail(`This number looks too short for ${selectedName}.`, selected.code as CountryCode);
  if (primary.length > 15) return fail(`This number looks too long for ${selectedName}.`, selected.code as CountryCode);
  return fail(`This doesn't look like a valid ${selectedName} number.`, selected.code as CountryCode);
}

/**
 * Server-side defence in depth for app/api/{rotator,shortlinks,adlinks} -
 * the UI (PhoneInput) already validated per-country before the request was
 * sent, so here there's no country to check against, just: is this 8-15
 * digits and not flatly impossible as an E.164 number. Deliberately looser
 * than normalizeWhatsAppNumber (no per-country isValid check) so it never
 * rejects a number the UI already accepted.
 */
export function isPlausibleE164Digits(digits: string): boolean {
  const clean = String(digits ?? "").replace(/\D/g, "");
  if (clean.length < 8 || clean.length > 15) return false;
  try {
    return isPossiblePhoneNumber("+" + clean);
  } catch {
    return false;
  }
}

/** "+971 50 123 4567" - for the live preview line. Falls back to a plain "+<digits>" if the library can't format it (shouldn't happen for anything normalizeWhatsAppNumber marked ok). */
export function formatForPreview(e164Digits: string): string {
  const digits = String(e164Digits ?? "").replace(/\D/g, "");
  if (!digits) return "";
  const parsed = parsePhoneNumberFromString("+" + digits);
  return parsed ? parsed.formatInternational() : "+" + digits;
}
