// UX-1 audit hardening: picks the ISO country a phone box should start on,
// instead of the old hard-coded "+971". Server-only (prisma + request
// headers), called once per create/edit page.tsx and passed down as a
// prop - never guesses when it has no real signal (see (c) below), because
// a wrong default is exactly the bug this feature exists to fix.
import "server-only";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { prisma } from "./prisma";
import { countryForRequest } from "./site-country";

function countryFromDigits(digits: string | null | undefined): string | null {
  const clean = String(digits ?? "").replace(/\D/g, "");
  if (!clean) return null;
  try {
    const parsed = parsePhoneNumberFromString("+" + clean);
    return parsed?.country ?? null;
  } catch {
    return null;
  }
}

/** The country of whichever of the user's rotator/shortlink/ad-link numbers was saved most recently, or null if they have none (or none parse). */
async function mostRecentLinkCountry(userId: string): Promise<string | null> {
  const [rotator, shortlink, adlink] = await Promise.all([
    prisma.rotatorLink.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { numbers: true, createdAt: true } }),
    prisma.shortLink.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { phone: true, createdAt: true } }),
    prisma.adLink.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { number: true, createdAt: true } }),
  ]);
  const candidates: { number: string | undefined; createdAt: Date }[] = [
    { number: rotator?.numbers?.[0], createdAt: rotator?.createdAt ?? new Date(0) },
    { number: shortlink?.phone, createdAt: shortlink?.createdAt ?? new Date(0) },
    { number: adlink?.number, createdAt: adlink?.createdAt ?? new Date(0) },
  ].filter((c) => c.number);
  candidates.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  for (const c of candidates) {
    const country = countryFromDigits(c.number);
    if (country) return country;
  }
  return null;
}

/**
 * Default ISO country for a phone input, in order:
 * (a) the country of the user's most recently saved link number - most
 *     people keep creating links for the same country;
 * (b) else the visitor's own country from their IP (MaxMind), via
 *     lib/site-country.ts's countryForRequest - `headers` is passed in by
 *     the caller (a server page.tsx) since this file doesn't see the
 *     request itself;
 * (c) else null - the PhoneInput then shows "Choose country" and the form
 *     can't be submitted until one is picked, rather than silently
 *     defaulting to the wrong country.
 */
export async function defaultCountryForUser(userId: string, headers: Headers): Promise<string | null> {
  const fromHistory = await mostRecentLinkCountry(userId);
  if (fromHistory) return fromHistory;
  return countryForRequest(headers);
}
