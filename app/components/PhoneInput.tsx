"use client";
// UX-1 audit hardening: the one shared WhatsApp phone box - country select +
// digits-only number field + a live "WhatsApp will open: …" / error preview
// - used everywhere a customer enters a WhatsApp number (create forms and
// edit forms alike), so they all behave the same way. Validation itself
// lives in lib/phone.ts (normalizeWhatsAppNumber); this component is just
// the input/state/UI wrapper around it.
import { useEffect, useMemo, useState } from "react";
import { parsePhoneNumberFromString } from "libphonenumber-js/min";
import { COUNTRIES } from "@/lib/countries";
import { normalizeWhatsAppNumber, formatForPreview, countryMobileLengthRange, countryRawMaxLength, countryLengthHint } from "@/lib/phone";

export type PhoneInputValue = { e164Digits: string; valid: boolean };

// Enough digits typed before we start judging validity on every keystroke -
// avoids flashing "too short" red text while someone's still mid-number.
const JUDGE_AFTER_DIGITS = 5;

/** Full digits (no "+") -> what to show in the number box + which country to default the select to, for an EXISTING saved number (edit forms). */
function seedFromInitialValue(initialValue: string | undefined, fallbackCountry: string | null): { raw: string; country: string | null } {
  const digits = String(initialValue ?? "").replace(/\D/g, "");
  if (!digits) return { raw: "", country: fallbackCountry };
  try {
    const parsedNumber = parsePhoneNumberFromString("+" + digits);
    if (parsedNumber?.country) {
      return { raw: parsedNumber.nationalNumber as string, country: parsedNumber.country };
    }
  } catch {
    /* fall through */
  }
  const entry = COUNTRIES.find((c) => c.code === fallbackCountry);
  if (entry) {
    const dial = entry.dial.replace("+", "");
    if (digits.startsWith(dial)) return { raw: digits.slice(dial.length), country: fallbackCountry };
  }
  return { raw: digits, country: fallbackCountry };
}

/** Strips letters and symbols live, keeping a leading "+" only as the very first character (typed or pasted). */
function sanitizeTyped(value: string): string {
  const hasLeadingPlus = value.trimStart().startsWith("+");
  const digits = value.replace(/[^\d]/g, "");
  return (hasLeadingPlus ? "+" : "") + digits;
}

export default function PhoneInput({
  id,
  ariaLabel = "WhatsApp number",
  defaultCountry = null,
  initialValue,
  onChange,
  showCountrySelect = true,
  country: controlledCountry,
  required = false,
  placeholder = "WhatsApp number",
  numberClassName,
  selectClassName,
  wrapperClassName,
}: {
  id?: string;
  ariaLabel?: string;
  /** ISO country to start on when there's no saved number yet (lib/default-country.ts). */
  defaultCountry?: string | null;
  /** Full digits (no "+") of an already-saved number, for edit forms. */
  initialValue?: string;
  onChange: (value: PhoneInputValue) => void;
  /** false = no <select> is rendered here; `country` (controlled by the parent) is used instead - e.g. rotator rows sharing one "applies to all" select. A pasted "+<country>" number still wins for that one row either way (lib/phone.ts parses a leading "+" on its own). */
  showCountrySelect?: boolean;
  country?: string | null;
  required?: boolean;
  placeholder?: string;
  numberClassName?: string;
  selectClassName?: string;
  wrapperClassName?: string;
}) {
  const seeded = useMemo(() => seedFromInitialValue(initialValue, defaultCountry), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [ownCountry, setOwnCountry] = useState<string | null>(seeded.country);
  const [raw, setRaw] = useState(seeded.raw);
  const [touched, setTouched] = useState(false);

  const effectiveCountry = showCountrySelect ? ownCountry : controlledCountry ?? defaultCountry ?? null;

  // A leading "+" is self-sufficient (lib/phone.ts parses it on its own,
  // ignoring the country argument) - so a pasted "+91…" validates and
  // detects India even before any country has been chosen here.
  const canNormalize = Boolean(effectiveCountry) || raw.trim().startsWith("+");
  const result = useMemo(
    () => (canNormalize ? normalizeWhatsAppNumber(effectiveCountry ?? "", raw) : { ok: false as const, e164Digits: "", national: "", countryCode: null, error: raw ? "Choose a country." : undefined }),
    [canNormalize, effectiveCountry, raw],
  );

  useEffect(() => {
    onChange({ e164Digits: result.ok ? result.e164Digits : "", valid: result.ok });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.ok, result.e164Digits]);

  const countryName = COUNTRIES.find((c) => c.code === effectiveCountry)?.name ?? null;
  const enoughTyped = raw.replace(/\D/g, "").length >= JUDGE_AFTER_DIGITS;
  const showPreview = Boolean(raw) && (touched || enoughTyped);

  // Per-country mobile digit length (owner request: the box shouldn't
  // accept more digits than the selected country allows), read from
  // libphonenumber-js metadata - never hard-coded, see lib/phone.ts.
  const lengthRange = useMemo(() => countryMobileLengthRange(effectiveCountry), [effectiveCountry]);
  const lengthHint = useMemo(() => countryLengthHint(effectiveCountry), [effectiveCountry]);
  // "Too short" is judged on national digits only (a leading "+" is a full
  // international paste, validated by lib/phone.ts on its own below instead).
  const nationalDigitsTyped = raw.trim().startsWith("+") ? null : raw.replace(/^0/, "").length;
  const tooShort = !result.ok && lengthRange !== null && nationalDigitsTyped !== null && nationalDigitsTyped > 0 && nationalDigitsTyped < lengthRange.min;

  function handleRawChange(next: string) {
    const hasLeadingPlus = next.trim().startsWith("+");
    if (showCountrySelect && hasLeadingPlus) {
      // Pasted/typed a full international number: parse it, switch this
      // field's own select to match (a pasted "+91…" wins over whatever was
      // selected), and show it back in NATIONAL form so the box still
      // respects that country's own digit limit, instead of displaying the
      // whole "+<dial><national>" string.
      try {
        const parsed = parsePhoneNumberFromString(next);
        if (parsed?.country) {
          const national = String(parsed.nationalNumber);
          const clamp = countryRawMaxLength(parsed.country, national.startsWith("0"));
          setOwnCountry(parsed.country);
          setRaw(national.slice(0, clamp));
          return;
        }
      } catch {
        /* not parseable yet (still mid-paste/typing) - fall through and let
           the preview/error line resolve once more digits land. */
      }
      setRaw(next);
      return;
    }
    if (hasLeadingPlus) {
      // No local select to switch here (e.g. a rotator row controlled by
      // the parent) - a leading "+" is parsed fully international by
      // lib/phone.ts regardless of country, so just let it through.
      setRaw(next);
      return;
    }
    // Plain local typing/paste: stop accepting digits beyond this country's
    // own maximum (one extra only when it starts with a trunk "0").
    const clamp = countryRawMaxLength(effectiveCountry, next.startsWith("0"));
    setRaw(next.slice(0, clamp));
  }

  return (
    <div className={wrapperClassName}>
      <div className="flex gap-2">
        {showCountrySelect && (
          <select
            aria-label="Country"
            value={ownCountry ?? ""}
            onChange={(e) => setOwnCountry(e.target.value || null)}
            className={selectClassName ?? "rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#25D366]"}
          >
            <option value="">Choose country</option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.dial} {c.name}
              </option>
            ))}
          </select>
        )}
        <input
          id={id}
          aria-label={ariaLabel}
          value={raw}
          onChange={(e) => handleRawChange(sanitizeTyped(e.target.value))}
          onBlur={() => setTouched(true)}
          type="tel"
          inputMode="numeric"
          pattern="[0-9+]*"
          autoComplete="tel-national"
          // Generous on purpose: the real per-country cap is enforced in
          // handleRawChange (controlled component, so truncation there is
          // what actually stops extra digits) - this DOM attribute is just
          // a backstop, kept wide enough that a pasted full "+<dial>
          // <national>" string (up to 16 chars) is never clipped by the
          // browser before handleRawChange gets a chance to parse and
          // re-clamp it to that country's own national length.
          maxLength={Math.max(countryRawMaxLength(effectiveCountry, raw.startsWith("0")), 17)}
          required={required}
          placeholder={placeholder}
          className={numberClassName ?? "min-w-0 flex-1 rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] font-mono"}
        />
      </div>
      {lengthHint && <p className="mt-1 text-xs text-slate-500">{lengthHint}</p>}
      {showPreview && (
        result.ok ? (
          <p className="mt-1 text-xs text-[#25D366]">WhatsApp will open: {formatForPreview(result.e164Digits)}</p>
        ) : tooShort ? (
          <p role="alert" className="mt-1 text-xs text-amber-400">
            Too short — {countryName ?? "this country"}&apos;s numbers need {lengthRange!.min === lengthRange!.max ? lengthRange!.min : `at least ${lengthRange!.min}`} digits.
          </p>
        ) : result.error ? (
          <p role="alert" className="mt-1 text-xs text-red-400">{result.error}</p>
        ) : null
      )}
      {!countryName && !showCountrySelect && !raw && (
        <p className="mt-1 text-xs text-amber-400">Choose a country above first.</p>
      )}
    </div>
  );
}
