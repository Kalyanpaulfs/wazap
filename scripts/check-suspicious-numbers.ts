// UX-1 audit hardening, step 8: READ-ONLY check of existing data for the
// phone-number bug this feature fixes (a hard-coded UAE country dropdown
// that silently produced wrong numbers like a double-prefixed
// 971919876543210 or 9710501234567). Lists every RotatorLink.numbers/
// fallbackNumber, ShortLink.phone and AdLink.number that is either:
//   - invalid per lib/phone.ts's isPlausibleE164Digits (not 8-15 digits, or
//     flatly impossible per libphonenumber-js), or
//   - a plausible double-prefix pattern (starts with a country's own dial
//     code repeated, or one dial code immediately followed by another
//     country's dial code - the exact shape the UAE-hardcoded bug produces).
//
// Never writes anything - no prisma.*.update/updateMany/delete calls at all.
//
// Usage: npx tsx scripts/check-suspicious-numbers.ts
import { isValidPhoneNumber } from "libphonenumber-js/min";
import { prisma } from "../lib/prisma";
import { isPlausibleE164Digits } from "../lib/phone";
import { COUNTRIES } from "../lib/countries";

const DIAL_CODES = [...new Set(COUNTRIES.map((c) => c.dial.replace("+", "")))].sort((a, b) => b.length - a.length);

/**
 * Flags the "double prefix" shape this bug produces: the number starts with
 * some country's dial code, and everything after that dial code is ITSELF a
 * complete, independently-valid phone number. That's exactly what
 * `dial + digits` gave you when `digits` already included a country code
 * (e.g. UAE selected, customer typed "971501234567" or "919876543210"):
 * 971 + 971501234567 = 971971501234567, or 971 + 919876543210 = 971919876543210
 * - in both cases, stripping the leading "971" leaves a full, valid number
 * on its own. Deliberately strict (isValidPhoneNumber, not the "possible"
 * fallback lib/phone.ts uses) - a loose check flags plenty of ordinary
 * numbers whose area code happens to collide with some country's dial code
 * (e.g. a US number starting "1202…" - "20" is Egypt's dial code).
 */
function looksDoublePrefixed(digits: string): string | null {
  // A number that is valid as it stands is never flagged: plenty of real
  // numbers (e.g. Italian mobiles "39 324…") leave a remainder that also
  // happens to parse as some other country's number.
  try {
    if (isValidPhoneNumber("+" + digits)) return null;
  } catch {
    /* fall through to the remainder check */
  }
  for (const first of DIAL_CODES) {
    if (!digits.startsWith(first)) continue;
    const rest = digits.slice(first.length);
    if (rest.length < 8) continue;
    try {
      if (isValidPhoneNumber("+" + rest)) return `${first}+${rest.slice(0, 3)}…`;
    } catch {
      /* not parseable as its own number - not a match */
    }
  }
  return null;
}

type Flag = { source: string; field: string; id: string; number: string; reason: string };

function check(source: string, field: string, id: string, raw: string | null | undefined): Flag | null {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (!isPlausibleE164Digits(digits)) {
    return { source, field, id, number: digits, reason: "not 8-15 digits / impossible per libphonenumber-js" };
  }
  const doublePrefix = looksDoublePrefixed(digits);
  if (doublePrefix) {
    return { source, field, id, number: digits, reason: `looks double-prefixed (${doublePrefix})` };
  }
  return null;
}

async function run() {
  console.log("Suspicious WhatsApp number check (read-only - no data is modified).");
  console.log("");

  const flags: Flag[] = [];

  const rotators = await prisma.rotatorLink.findMany({ select: { id: true, userId: true, numbers: true, fallbackNumber: true } });
  for (const r of rotators) {
    for (const n of r.numbers) {
      const flag = check("RotatorLink", "numbers[]", r.id, n);
      if (flag) flags.push(flag);
    }
    const flag = check("RotatorLink", "fallbackNumber", r.id, r.fallbackNumber);
    if (flag) flags.push(flag);
  }

  const shortLinks = await prisma.shortLink.findMany({ select: { id: true, userId: true, phone: true } });
  for (const s of shortLinks) {
    const flag = check("ShortLink", "phone", s.id, s.phone);
    if (flag) flags.push(flag);
  }

  const adLinks = await prisma.adLink.findMany({ select: { id: true, userId: true, number: true } });
  for (const a of adLinks) {
    const flag = check("AdLink", "number", a.id, a.number);
    if (flag) flags.push(flag);
  }

  if (!flags.length) {
    console.log(`Checked ${rotators.length} rotator(s), ${shortLinks.length} short link(s), ${adLinks.length} ad link(s). Nothing suspicious found.`);
    return;
  }

  console.log("source       field         id                                   number            reason");
  console.log("-----------  ------------  -----------------------------------  ----------------  ------------------------------------------");
  for (const f of flags) {
    console.log(
      `${f.source.padEnd(11)}  ${f.field.padEnd(12)}  ${f.id.padEnd(37)}  ${f.number.padEnd(16)}  ${f.reason}`,
    );
  }
  console.log("");
  console.log(
    `${flags.length} suspicious number(s) out of ${rotators.length} rotator(s), ${shortLinks.length} short link(s), ${adLinks.length} ad link(s) checked.`,
  );
  console.log("No data was changed. Review each row above before deciding whether to contact the owning customer.");
}

run()
  .catch((err) => {
    console.error("[check-suspicious-numbers] failed:", err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
