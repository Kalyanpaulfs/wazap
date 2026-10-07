"use client";

import { useSiteLocale } from "../localization/SiteLocale";
import { useEffect, useState } from "react";
import type { Localization, SupportedLanguage } from "@/lib/localization";
import { PRICING_TEXT } from "@/lib/i18n";

type Payload = Localization;

const DEFAULT_LOCALIZATION: Payload = {
  country: "US",
  currency: "USD",
  language: "en",
  direction: "ltr",
  rate: 1,
  rateSource: "fallback",
  updatedAt: new Date().toISOString(),
};

export function useLocalization() {
  const { language } = useSiteLocale();
  const [localization, setLocalization] = useState<Payload>(DEFAULT_LOCALIZATION);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("language", language);
    params.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    fetch(`/api/localization?${params.toString()}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.currency && data?.language) setLocalization(data);
      })
      .catch(() => {});
  }, [language]);

  return localization;
}

export function usePricingText(language: SupportedLanguage) {
  return PRICING_TEXT[language] || PRICING_TEXT.en;
}

export function formatLocalPrice(usd: number, localization: Payload) {
  const localAmount = usd * (localization.rate || 1);
  const formatterLocale: Record<SupportedLanguage, string> = {
    en: "en-US",
    ar: "ar-AE",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    pt: "pt-BR",
    it: "it-IT",
    tr: "tr-TR",
    hi: "hi-IN",
    id: "id-ID",
    ru: "ru-RU",
    zh: "zh-CN",
    lv: "lv-LV",
    ms: "ms-MY",
    nl: "nl-NL",
    ka: "ka-GE",
    ja: "ja-JP",
    fa: "fa-IR",
    ur: "ur-PK",
    bn: "bn-BD",
    pl: "pl-PL",
    cs: "cs-CZ",
    ro: "ro-RO",
    uk: "uk-UA",
    ko: "ko-KR",
    th: "th-TH",
    vi: "vi-VN",
    sw: "sw-KE",
    fil: "fil-PH",
  };
  const formatter = new Intl.NumberFormat(formatterLocale[localization.language] || "en-US", {
    style: "currency",
    currency: localization.currency,
    maximumFractionDigits: 0,
  });
  return formatter.format(localAmount);
}
