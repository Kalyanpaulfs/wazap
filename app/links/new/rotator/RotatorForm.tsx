"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { COUNTRIES } from "@/lib/countries";
import PhoneInput, { type PhoneInputValue } from "@/app/components/PhoneInput";
import { salespeopleCounterText, buildCreatedUrl, MIN_SALESPEOPLE, type SalespersonRow } from "@/lib/link-create-forms";
import { formatUsageLine } from "@/lib/my-links";

const EMPTY_PHONE: PhoneInputValue = { e164Digits: "", valid: false };

export default function RotatorForm({
  planLabel,
  used,
  limit,
  numbersLimit,
  nextPlanHint,
  defaultCountry,
}: {
  planLabel: string;
  used: number;
  limit: number;
  numbersLimit: number;
  nextPlanHint: string;
  defaultCountry: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [country, setCountry] = useState<string | null>(defaultCountry);
  const [rows, setRows] = useState<SalespersonRow[]>([{ name: "", number: "" }, { name: "", number: "" }]);
  const [rowPhones, setRowPhones] = useState<PhoneInputValue[]>([EMPTY_PHONE, EMPTY_PHONE]);
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const atLimit = rows.length >= numbersLimit;
  const validRowCount = rowPhones.filter((p) => p.valid).length;

  function addRow() {
    setRows((prev) => [...prev, { name: "", number: "" }]);
    setRowPhones((prev) => [...prev, EMPTY_PHONE]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, j) => j !== i));
    setRowPhones((prev) => prev.filter((_, j) => j !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Give your rotator a name.");
      return;
    }
    if (!country) {
      setError("Choose a country.");
      return;
    }
    const numbers: string[] = [];
    const numberNames: Record<string, string> = {};
    rows.forEach((row, i) => {
      const phone = rowPhones[i];
      if (!phone?.valid) return;
      numbers.push(phone.e164Digits);
      const rowName = row.name.trim();
      if (rowName) numberNames[phone.e164Digits] = rowName;
    });
    if (numbers.length < MIN_SALESPEOPLE) {
      setError(`Add at least ${MIN_SALESPEOPLE} salespeople with a valid WhatsApp number.`);
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/rotator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), numbers, numberNames, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create the lead rotator. Please try again.");
      router.push(buildCreatedUrl("rotator", data.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the lead rotator. Please try again.");
      setCreating(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-surface p-6">
      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="rotator-name">Name</label>
        <input
          id="rotator-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Sales team"
          maxLength={100}
          required
          className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-muted">Just for you - visitors never see this name.</p>
      </div>

      <div>
        <label className="block text-xs text-muted mb-2" htmlFor="rotator-dial">Country code (applies to all)</label>
        <select
          id="rotator-dial"
          value={country ?? ""}
          onChange={(e) => setCountry(e.target.value || null)}
          className="rounded-xl bg-surface border border-border-strong px-3 py-2.5 text-sm text-text focus:outline-none focus:border-accent"
        >
          <option value="">Choose country</option>
          {COUNTRIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.dial} {c.name}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted">A salesperson&apos;s number can still paste their own &ldquo;+country&rdquo; number - it wins over this for that row.</p>
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-muted">Salespeople (name is optional)</label>
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={row.name}
              onChange={(e) => setRows((prev) => prev.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)))}
              placeholder="e.g. Ravi"
              aria-label={`Salesperson ${i + 1} name (optional)`}
              className="min-w-0 w-28 sm:w-36 shrink-0 self-start rounded-xl bg-surface border border-border-strong px-3 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
            />
            <div className="min-w-0 flex-1">
              <PhoneInput
                showCountrySelect={false}
                country={country}
                ariaLabel={`Salesperson ${i + 1} WhatsApp number`}
                placeholder={`Salesperson ${i + 1} WhatsApp number`}
                onChange={(value) => setRowPhones((prev) => prev.map((v, j) => (j === i ? value : v)))}
              />
            </div>
            {rows.length > MIN_SALESPEOPLE && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="shrink-0 self-start text-muted hover:text-danger p-2 transition-colors"
                aria-label={`Remove salesperson ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <p className="text-xs text-muted">{salespeopleCounterText(rows.length, numbersLimit, planLabel, nextPlanHint)}</p>
        {!atLimit ? (
          <button
            type="button"
            onClick={addRow}
            className="text-xs font-semibold text-accent hover:underline"
          >
            + Add salesperson
          </button>
        ) : (
          <p className="text-xs text-warning">
            Your {planLabel} plan allows {numbersLimit} salespeople per rotator.{" "}
            {nextPlanHint && (
              <Link href="/billing#plans" className="underline">
                Upgrade
              </Link>
            )}
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="rotator-message">First message (optional)</label>
        <textarea
          id="rotator-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          placeholder="Hi, I'd like more information."
          rows={2}
          className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-muted">Shown in WhatsApp for every salesperson. The visitor chooses whether to send it.</p>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <p className="text-xs text-muted">{formatUsageLine(planLabel, used, limit)}</p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={creating || !country || validRowCount < MIN_SALESPEOPLE}
          className="rounded-full bg-accent hover:bg-accent-hover disabled:opacity-50 px-6 py-2.5 text-sm font-bold text-on-accent transition-colors"
        >
          {creating ? "Creating…" : "Create lead rotator"}
        </button>
        <Link href="/links/new" className="text-sm font-semibold text-muted hover:text-text">
          Cancel
        </Link>
      </div>
    </form>
  );
}
