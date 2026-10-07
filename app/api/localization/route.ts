import { NextRequest, NextResponse } from "next/server";
import { countryForRequest } from "@/lib/site-country";
import { normalizeSiteLanguage, siteLanguageForCountry } from "@/lib/site-languages";
import { getLocalization, normalizeLanguage } from "@/lib/localization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEZONE_COUNTRY: Record<string, string> = {
  "Asia/Dubai": "AE",
  "Asia/Riyadh": "SA",
  "Asia/Qatar": "QA",
  "Asia/Kuwait": "KW",
  "Asia/Bahrain": "BH",
  "Asia/Muscat": "OM",
  "Europe/London": "GB",
  "Europe/Paris": "FR",
  "Europe/Berlin": "DE",
  "Europe/Madrid": "ES",
  "Europe/Rome": "IT",
  "Europe/Riga": "LV",
  "Europe/Amsterdam": "NL",
  "Europe/Warsaw": "PL",
  "Europe/Prague": "CZ",
  "Europe/Bucharest": "RO",
  "Europe/Kyiv": "UA",
  "Asia/Kuala_Lumpur": "MY",
  "Asia/Tbilisi": "GE",
  "Asia/Shanghai": "CN",
  "Asia/Seoul": "KR",
  "Asia/Bangkok": "TH",
  "Asia/Ho_Chi_Minh": "VN",
  "Asia/Karachi": "PK",
  "Asia/Dhaka": "BD",
  "Asia/Kabul": "AF",
  "Africa/Algiers": "DZ",
  "Africa/Tunis": "TN",
  "Africa/Kinshasa": "CD",
  "Africa/Abidjan": "CI",
  "Africa/Nairobi": "KE",
  "America/Sao_Paulo": "BR",
  "America/New_York": "US",
  "America/Los_Angeles": "US",
  "America/Toronto": "CA",
  "Asia/Kolkata": "IN",
  "Asia/Singapore": "SG",
  "Asia/Jakarta": "ID",
  "Asia/Manila": "PH",
  "Asia/Tokyo": "JP",
  "Australia/Sydney": "AU",
};

export async function GET(req: NextRequest) {
  const hint = normalizeSiteLanguage(req.nextUrl.searchParams.get("language")) || normalizeSiteLanguage(req.cookies.get("wazap_site_language")?.value);
  const timeZone = req.nextUrl.searchParams.get("timeZone") || "";
  const country = countryForRequest(req.headers) || TIMEZONE_COUNTRY[timeZone] || null;
  const localization = await getLocalization(normalizeLanguage(hint || siteLanguageForCountry(country, req.headers.get("accept-language") || "")), country);
  return NextResponse.json(localization, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
