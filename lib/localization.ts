import { headers } from "next/headers";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "./languages";

export type { SupportedLanguage } from "./languages";

export type Localization = {
  country: string;
  currency: string;
  language: SupportedLanguage;
  direction: "ltr" | "rtl";
  rate: number;
  rateSource: "live" | "fallback";
  updatedAt: string;
};

const RTL_LANGUAGES = new Set<SupportedLanguage>(["ar", "fa", "ur"]);

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  AE: "AED", SA: "SAR", QA: "QAR", KW: "KWD", BH: "BHD", OM: "OMR",
  US: "USD", CA: "CAD", GB: "GBP", IE: "EUR", AU: "AUD", NZ: "NZD",
  EU: "EUR", FR: "EUR", DE: "EUR", ES: "EUR", IT: "EUR", NL: "EUR", BE: "EUR", PT: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
  CH: "CHF", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", CZ: "CZK", HU: "HUF", RO: "RON",
  TR: "TRY", IN: "INR", PK: "PKR", BD: "BDT", LK: "LKR", NP: "NPR",
  PH: "PHP", ID: "IDR", MY: "MYR", SG: "SGD", TH: "THB", VN: "VND",
  JP: "JPY", KR: "KRW", CN: "CNY", HK: "HKD", TW: "TWD",
  BR: "BRL", MX: "MXN", AR: "ARS", CL: "CLP", CO: "COP", PE: "PEN",
  ZA: "ZAR", EG: "EGP", MA: "MAD", NG: "NGN", KE: "KES",
  LT: "EUR", LV: "EUR", UA: "UAH", GE: "GEL", CD: "CDF", AF: "AFN", CI: "XOF",
};

const FALLBACK_RATES: Record<string, number> = {
  USD: 1, AED: 3.67, SAR: 3.75, QAR: 3.64, KWD: 0.31, BHD: 0.38, OMR: 0.39,
  EUR: 0.92, GBP: 0.79, CAD: 1.37, AUD: 1.52, NZD: 1.66, CHF: 0.89,
  SEK: 10.4, NOK: 10.6, DKK: 6.86, PLN: 3.95, CZK: 23.1, HUF: 360, RON: 4.58,
  TRY: 33.0, INR: 83.5, PKR: 278, BDT: 117, LKR: 303, NPR: 134,
  PHP: 58.5, IDR: 16200, MYR: 4.7, SGD: 1.35, THB: 36.5, VND: 25400,
  JPY: 157, KRW: 1380, CNY: 7.25, HKD: 7.8, TWD: 32.5,
  BRL: 5.45, MXN: 18.1, ARS: 930, CLP: 930, COP: 4100, PEN: 3.75,
  ZAR: 18.2, EGP: 48, MAD: 9.9, NGN: 1500, KES: 129,
  UAH: 41.5, GEL: 2.72, CDF: 2870, AFN: 70.5, XOF: 604,
};

let cachedRates: { expiresAt: number; rates: Record<string, number>; source: "live" | "fallback"; updatedAt: string } | null = null;

export function normalizeLanguage(raw: string | null | undefined): SupportedLanguage {
  const code = String(raw || "en").split(",")[0]?.trim().split("-")[0]?.toLowerCase();
  return SUPPORTED_LANGUAGES.includes(code as SupportedLanguage) ? (code as SupportedLanguage) : "en";
}

const COUNTRY_TO_LANGUAGE: Partial<Record<string, SupportedLanguage>> = {
  AE: "ar", SA: "ar", QA: "ar", KW: "ar", BH: "ar", OM: "ar", EG: "ar", MA: "ar",
  ES: "es", MX: "es", AR: "es", CL: "es", CO: "es", PE: "es",
  FR: "fr", DE: "de", BR: "pt", PT: "pt", IT: "it", TR: "tr", IN: "hi",
  ID: "id", RU: "ru", CN: "zh", TW: "zh", LV: "lv", MY: "ms", NL: "nl",
  GE: "ka", JP: "ja", IR: "fa", AF: "fa", PK: "ur", BD: "bn", PL: "pl",
  CZ: "cs", RO: "ro", UA: "uk", KR: "ko", TH: "th", VN: "vi", KE: "sw", PH: "fil",
};

export function languageForCountry(country: string): SupportedLanguage {
  return COUNTRY_TO_LANGUAGE[country.toUpperCase()] || "en";
}

function countryFromLocale(raw: string | null | undefined) {
  const match = String(raw || "").match(/[-_]([A-Z]{2})\b/i);
  return match?.[1]?.toUpperCase() || null;
}

export async function detectCountry() {
  const h = await headers();
  return (
    h.get("cf-ipcountry") ||
    h.get("x-vercel-ip-country") ||
    h.get("x-country-code") ||
    h.get("x-forwarded-country") ||
    countryFromLocale(h.get("accept-language")) ||
    "US"
  ).toUpperCase();
}

export function currencyForCountry(country: string) {
  return COUNTRY_TO_CURRENCY[country.toUpperCase()] || "USD";
}

export async function getUsdRates() {
  if (cachedRates && cachedRates.expiresAt > Date.now()) return cachedRates;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 21_600 } });
    const data = await res.json();
    if (res.ok && data?.result === "success" && data?.rates?.USD) {
      cachedRates = { expiresAt: Date.now() + 21_600_000, rates: data.rates, source: "live", updatedAt: new Date().toISOString() };
      return cachedRates;
    }
  } catch {}
  cachedRates = { expiresAt: Date.now() + 900_000, rates: FALLBACK_RATES, source: "fallback", updatedAt: new Date().toISOString() };
  return cachedRates;
}

export async function getLocalization(languageHint?: string | null, countryHint?: string | null): Promise<Localization> {
  const country = (countryHint || await detectCountry()).toUpperCase();
  const currency = currencyForCountry(country);
  const language = languageHint ? normalizeLanguage(languageHint) : languageForCountry(country);
  const rates = await getUsdRates();
  return {
    country,
    currency,
    language,
    direction: RTL_LANGUAGES.has(language) ? "rtl" : "ltr",
    rate: rates.rates[currency] || 1,
    rateSource: rates.source,
    updatedAt: rates.updatedAt,
  };
}

export function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
}
