"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import {
  Copy,
  Check,
  Download,
  ExternalLink,
  Trash2,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronUp,
  Pause as PauseIcon,
  Play,
} from "lucide-react";
import BackLink from "@/app/links/BackLink";
import PhoneInput, { type PhoneInputValue } from "@/app/components/PhoneInput";
import { LINK_KIND_NAME, type LinkKind } from "@/lib/my-links";
import {
  MIN_SALESPEOPLE,
  salespeopleCounterText,
  AD_SOURCE_PRESETS,
  sourceToUtmSource,
  type AdSourcePreset,
} from "@/lib/link-create-forms";
import { numbersPatchAllowed } from "@/lib/plan-limits";

const EMPTY_PHONE: PhoneInputValue = { e164Digits: "", valid: false };

const DELETE_ENDPOINT: Record<LinkKind, string> = {
  rotator: "/api/rotator",
  shortlink: "/api/shortlinks",
  adlink: "/api/adlinks",
};

function slugify(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || "link";
}

type RotatorData = {
  numbers: string[];
  numberNames: Record<string, string>;
  pausedNumbers: string[];
  fallbackNumber: string | null;
  message: string | null;
  salespeople: { number: string; name: string | null; last30Days: number; paused: boolean }[];
  numbersLimit: number;
  nextPlanHint: string;
};
type ShortlinkData = { phone: string; message: string };
type AdlinkData = { number: string; message: string | null; utmSource: string | null; utmMedium: string | null; utmCampaign: string | null };

export default function LinkDetailsClient({
  kind,
  id,
  name: initialName,
  createdAt,
  addressDisplay,
  publicUrl,
  metric,
  paused,
  manuallyPaused,
  statusText,
  pauseReason,
  planLabel,
  defaultCountry,
  rotator,
  shortlink,
  adlink,
}: {
  kind: LinkKind;
  id: string;
  name: string;
  createdAt: string;
  addressDisplay: string;
  publicUrl: string;
  metric: number;
  /** True when the link isn't live for ANY reason (plan pause or the customer's own manual pause). */
  paused: boolean;
  /** True only when the customer paused it themselves - drives the Pause/Resume button. */
  manuallyPaused: boolean;
  statusText: string;
  /** Only set when the link is PLAN-paused - the big banner+CTA below only ever shows for that reason, never for a manual pause. */
  pauseReason: string | null;
  planLabel: string;
  defaultCountry: string | null;
  rotator?: RotatorData;
  shortlink?: ShortlinkData;
  adlink?: AdlinkData;
}) {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState("");
  const [name, setName] = useState(initialName);
  // Salesperson pause clicks show at once; the server value takes over after router.refresh().
  const [pausedOverride, setPausedOverride] = useState<Record<string, boolean>>({});
  const pausedNow = (sp: { number: string; paused: boolean }) => pausedOverride[sp.number] ?? sp.paused;
  // Every salesperson paused = the link is paused (app/r/[code]/route.ts shows the paused page).
  const allSalespeoplePaused = kind === "rotator" && !!rotator?.salespeople.length && rotator.salespeople.every(pausedNow);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(publicUrl, { width: 320, margin: 2, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrError("Could not create a QR code for this link.");
      });
    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setQrError("Copy was blocked. Select the link and copy it manually.");
    }
  }

  function downloadQR() {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `wazap-${slugify(name)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  const createdLabel = new Date(createdAt).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <main className="px-4 py-7 sm:px-7 sm:py-9">
      <div className="mx-auto max-w-3xl space-y-6">
        <BackLink href="/links" label="My links" />

        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white sm:text-3xl">{name}</h1>
              <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">{LINK_KIND_NAME[kind]}</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">Created {createdLabel}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {paused || allSalespeoplePaused ? (
              <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-300">{paused ? statusText : "Paused"}</span>
            ) : (
              <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-3 py-1.5 text-xs font-semibold text-[#25D366]">● Live</span>
            )}
            <PauseResumeButton kind={kind} id={id} manuallyPaused={manuallyPaused} />
          </div>
        </header>

        {/* Plan-pause banner only - a manual (owner) pause is already clear
            from the status pill + Pause/Resume button above, with no
            upgrade pitch (there's nothing to buy to fix a self-pause). */}
        {pauseReason && (
          <section className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5" aria-label="Link paused">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
                <p className="text-sm font-semibold text-white">This link is paused: {pauseReason}.</p>
              </div>
              <Link href="/billing#plans" className="rounded-full bg-[#25D366] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#1fba58]">
                Choose a plan
              </Link>
            </div>
          </section>
        )}

        <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7">
          <div className="flex flex-col gap-6 sm:flex-row">
            <div className="flex-1 space-y-4">
              <div>
                <p className="text-xs text-slate-500">Public address</p>
                <p className="mt-1 break-all rounded-xl bg-slate-900 px-3 py-2.5 font-mono text-sm text-white">{addressDisplay}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[#25D366]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={downloadQR}
                  disabled={!qrDataUrl}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download QR
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </a>
              </div>
              {qrError && <p role="alert" className="text-xs text-red-400">{qrError}</p>}

              <div className="flex flex-wrap items-center gap-6 pt-2">
                <div>
                  <p className="text-xs text-slate-500">Clicks</p>
                  <p className="text-xl font-bold text-white">{metric.toLocaleString()}</p>
                </div>
                <Link href={`/results?link=${kind}:${id}`} className="text-xs font-semibold text-[#25D366] hover:underline">
                  See in Results →
                </Link>
              </div>
            </div>

            {qrDataUrl && (
              <img src={qrDataUrl} alt={`QR code for ${name}`} className="mx-auto h-36 w-36 shrink-0 rounded-xl border border-slate-800 bg-white p-2 sm:mx-0" />
            )}
          </div>
        </section>

        {kind === "rotator" && rotator && rotator.salespeople.length > 0 && (
          <section className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7">
            <h2 className="text-sm font-semibold text-white">Salespeople</h2>
            <p className="mt-1 text-xs text-slate-500">Clicks in the last 30 days. Pause a salesperson to stop sending them new chats - the rest keep rotating fairly.</p>
            {allSalespeoplePaused && (
              <p className="mt-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-300">
                All salespeople are paused, so the link is paused. Resume someone to start getting chats again.
              </p>
            )}
            <div className="mt-3 space-y-2">
              {rotator.salespeople.map((sp) => (
                <div
                  key={sp.number}
                  className={`flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm ${pausedNow(sp) ? "bg-slate-900/50" : "bg-slate-900"}`}
                >
                  <span className={pausedNow(sp) ? "text-slate-500" : "text-slate-200"}>
                    {sp.name || sp.number}
                    {pausedNow(sp) && <span className="ml-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300">Paused</span>}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-400">{sp.last30Days.toLocaleString()} clicks</span>
                    <SalespersonPauseButton
                      rotatorId={id}
                      number={sp.number}
                      paused={pausedNow(sp)}
                      onChange={(paused) => setPausedOverride((prev) => ({ ...prev, [sp.number]: paused }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {kind === "rotator" && rotator && (
          <RotatorEditSection id={id} initialName={name} rotator={rotator} planLabel={planLabel} defaultCountry={defaultCountry} onNameSaved={setName} />
        )}
        {kind === "shortlink" && shortlink && (
          <ShortlinkEditSection id={id} initialName={name} shortlink={shortlink} defaultCountry={defaultCountry} onNameSaved={setName} />
        )}
        {kind === "adlink" && adlink && (
          <AdlinkEditSection id={id} initialName={name} adlink={adlink} defaultCountry={defaultCountry} onNameSaved={setName} />
        )}

        <DangerZone kind={kind} id={id} />
      </div>
    </main>
  );
}

function SaveBar({ saving, success, error, disabled = false }: { saving: boolean; success: boolean; error: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={saving || disabled}
        className="rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-50 px-6 py-2.5 text-sm font-bold text-black transition-colors"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
      {success && <span className="text-sm font-semibold text-[#25D366]">Saved.</span>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rotator edit
// ---------------------------------------------------------------------------
function RotatorEditSection({
  id,
  initialName,
  rotator,
  planLabel,
  defaultCountry,
  onNameSaved,
}: {
  id: string;
  initialName: string;
  rotator: RotatorData;
  planLabel: string;
  defaultCountry: string | null;
  onNameSaved: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [rows, setRows] = useState(
    rotator.numbers.map((number) => ({ number, name: rotator.numberNames[number] || "" })),
  );
  const [rowPhones, setRowPhones] = useState<PhoneInputValue[]>(
    rotator.numbers.map((number) => ({ e164Digits: number, valid: true })),
  );
  const [message, setMessage] = useState(rotator.message || "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const initialCount = rotator.numbers.length;
  const validRowCount = rowPhones.filter((p) => p.valid).length;
  const canAddMore = numbersPatchAllowed(initialCount, rows.length + 1, rotator.numbersLimit);

  function addRow() {
    setRows((prev) => [...prev, { number: "", name: "" }]);
    setRowPhones((prev) => [...prev, EMPTY_PHONE]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, j) => j !== i));
    setRowPhones((prev) => prev.filter((_, j) => j !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (!name.trim()) {
      setError("Give your rotator a name.");
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
    if (!numbersPatchAllowed(initialCount, numbers.length, rotator.numbersLimit)) {
      setError(`Your ${planLabel} plan allows ${rotator.numbersLimit} numbers per rotator. Upgrade to add more.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/rotator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: name.trim(), numbers, numberNames, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save changes. Please try again.");
      setSuccess(true);
      onNameSaved(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-800 bg-[#111811] p-6">
      <h2 className="text-sm font-semibold text-white">Edit lead rotator</h2>
      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="edit-rotator-name">Name</label>
        <input
          id="edit-rotator-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs text-slate-400">Salespeople (name is optional)</label>
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={row.name}
              onChange={(e) => setRows((prev) => prev.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)))}
              placeholder={`Salesperson ${i + 1} name`}
              aria-label={`Salesperson ${i + 1} name (optional)`}
              className="min-w-0 w-28 sm:w-36 shrink-0 self-start rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
            />
            <div className="min-w-0 flex-1">
              <PhoneInput
                defaultCountry={defaultCountry}
                initialValue={row.number}
                ariaLabel={`Salesperson ${i + 1} WhatsApp number`}
                placeholder={`Salesperson ${i + 1} WhatsApp number`}
                onChange={(value) => setRowPhones((prev) => prev.map((v, j) => (j === i ? value : v)))}
              />
            </div>
            {rows.length > MIN_SALESPEOPLE && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="shrink-0 self-start text-slate-600 hover:text-red-400 p-2 transition-colors"
                aria-label={`Remove salesperson ${i + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <p className="text-xs text-slate-500">{salespeopleCounterText(rows.length, rotator.numbersLimit, planLabel, rotator.nextPlanHint)}</p>
        {canAddMore ? (
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#25D366] hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Add salesperson
          </button>
        ) : (
          <p className="text-xs text-amber-400">
            Your {planLabel} plan allows {rotator.numbersLimit} salespeople per rotator.{" "}
            {rotator.nextPlanHint && (
              <Link href="/billing#plans" className="underline">
                Upgrade
              </Link>
            )}
          </p>
        )}
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="edit-rotator-message">First message (optional)</label>
        <textarea
          id="edit-rotator-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={2000}
          rows={2}
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
      </div>

      <SaveBar saving={saving} success={success} error={error} disabled={validRowCount < MIN_SALESPEOPLE} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Shortlink (WhatsApp/brand link) edit
// ---------------------------------------------------------------------------
function ShortlinkEditSection({
  id,
  initialName,
  shortlink,
  defaultCountry,
  onNameSaved,
}: {
  id: string;
  initialName: string;
  shortlink: ShortlinkData;
  defaultCountry: string | null;
  onNameSaved: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState<PhoneInputValue>({ e164Digits: shortlink.phone, valid: true });
  const [message, setMessage] = useState(shortlink.message || "");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (!name.trim()) {
      setError("Give it a name.");
      return;
    }
    if (!phone.valid) {
      setError("Add a valid WhatsApp number.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/shortlinks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name: name.trim(), phone: phone.e164Digits, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save changes. Please try again.");
      setSuccess(true);
      onNameSaved(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-800 bg-[#111811] p-6">
      <h2 className="text-sm font-semibold text-white">Edit WhatsApp link</h2>
      <p className="text-xs text-slate-500">The address can&apos;t change, so printed QR codes and shared links keep working.</p>

      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="edit-sl-name">Name</label>
        <input
          id="edit-sl-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1" id="edit-sl-phone-label">WhatsApp number</label>
        <PhoneInput
          defaultCountry={defaultCountry}
          initialValue={shortlink.phone}
          ariaLabel="WhatsApp number"
          onChange={setPhone}
          required
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="edit-sl-message">First message (optional)</label>
        <textarea
          id="edit-sl-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={600}
          rows={2}
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
      </div>

      <SaveBar saving={saving} success={success} error={error} disabled={!phone.valid} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Ad link edit
// ---------------------------------------------------------------------------
function initialPreset(utmSource: string | null): { preset: AdSourcePreset; custom: string } {
  const value = (utmSource || "").trim().toLowerCase();
  const match = AD_SOURCE_PRESETS.find((p) => p !== "Other" && p.toLowerCase() === value);
  if (match) return { preset: match, custom: "" };
  return { preset: "Other", custom: utmSource || "" };
}

function AdlinkEditSection({
  id,
  initialName,
  adlink,
  defaultCountry,
  onNameSaved,
}: {
  id: string;
  initialName: string;
  adlink: AdlinkData;
  defaultCountry: string | null;
  onNameSaved: (name: string) => void;
}) {
  const initial = initialPreset(adlink.utmSource);
  const [name, setName] = useState(initialName);
  const [number, setNumber] = useState<PhoneInputValue>({ e164Digits: adlink.number, valid: true });
  const [message, setMessage] = useState(adlink.message || "");
  const [source, setSource] = useState<AdSourcePreset>(initial.preset);
  const [customSource, setCustomSource] = useState(initial.custom);
  const [campaign, setCampaign] = useState(adlink.utmCampaign || "");
  const [utmMedium, setUtmMedium] = useState(adlink.utmMedium || "");
  const [showMore, setShowMore] = useState(Boolean(adlink.utmMedium));
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);
    if (!name.trim()) {
      setError("Give your ad link a name.");
      return;
    }
    if (!number.valid) {
      setError("Add a valid WhatsApp number.");
      return;
    }
    if (source === "Other" && !customSource.trim()) {
      setError("Tell us the ad source, or choose one of the presets.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/adlinks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          name: name.trim(),
          number: number.e164Digits,
          message,
          utmSource: sourceToUtmSource(source, customSource),
          utmMedium,
          utmCampaign: campaign,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save changes. Please try again.");
      setSuccess(true);
      onNameSaved(name.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save changes. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-800 bg-[#111811] p-6">
      <h2 className="text-sm font-semibold text-white">Edit ad link</h2>

      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="edit-ad-name">Name</label>
        <input
          id="edit-ad-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          required
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1" id="edit-ad-number-label">WhatsApp number</label>
        <PhoneInput
          defaultCountry={defaultCountry}
          initialValue={adlink.number}
          ariaLabel="WhatsApp number"
          onChange={setNumber}
          required
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="edit-ad-message">First message (optional)</label>
        <input
          id="edit-ad-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-2">Where does this ad run?</label>
        <div className="flex flex-wrap gap-2">
          {AD_SOURCE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSource(preset)}
              aria-pressed={source === preset}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                source === preset ? "border-[#25D366] bg-[#25D366]/10 text-[#25D366]" : "border-slate-700 text-slate-300 hover:border-slate-500"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
        {source === "Other" && (
          <input
            value={customSource}
            onChange={(e) => setCustomSource(e.target.value)}
            placeholder="Where does this ad run?"
            maxLength={60}
            className="mt-2 w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
          />
        )}
      </div>

      <div>
        <label className="block text-xs text-slate-400 mb-1" htmlFor="edit-ad-campaign">Campaign name (optional)</label>
        <input
          id="edit-ad-campaign"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
        />
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
        >
          {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          More tracking options
        </button>
        {showMore && (
          <div className="mt-2">
            <label className="block text-xs text-slate-400 mb-1" htmlFor="edit-ad-medium">Ad placement (optional)</label>
            <input
              id="edit-ad-medium"
              value={utmMedium}
              onChange={(e) => setUtmMedium(e.target.value)}
              className="w-full rounded-xl bg-slate-900 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]"
            />
          </div>
        )}
      </div>

      <SaveBar saving={saving} success={success} error={error} disabled={!number.valid} />
    </form>
  );
}

// ---------------------------------------------------------------------------
// Manual pause/resume (owner feature, distinct from the plan pause) - a
// short inline confirm before pausing (no window.confirm), no confirm
// needed to resume.
// ---------------------------------------------------------------------------
function PauseResumeButton({ kind, id, manuallyPaused }: { kind: LinkKind; id: string; manuallyPaused: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(DELETE_ENDPOINT[kind], {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, paused: !manuallyPaused }),
      });
      if (!res.ok) throw new Error("Could not update this link. Please try again.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update this link.");
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
        <span className="text-slate-300">Pause this link? People who click it will see a &quot;paused&quot; page.</span>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          className="rounded-full bg-amber-500/90 px-3 py-1.5 font-semibold text-black hover:bg-amber-500 disabled:opacity-50"
        >
          {saving ? "Pausing…" : "Yes, pause"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={saving}
          className="rounded-full border border-slate-700 px-3 py-1.5 text-slate-300 hover:border-slate-500"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => (manuallyPaused ? toggle() : setConfirming(true))}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3.5 py-1.5 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white disabled:opacity-50"
      >
        {manuallyPaused ? <Play className="h-3.5 w-3.5" /> : <PauseIcon className="h-3.5 w-3.5" />}
        {saving ? "Saving…" : manuallyPaused ? "Resume" : "Pause"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-salesperson pause/resume (distinct from the link-level Pause/Resume
// above): pauses just this one number - their traffic simply skips them and
// rotates fairly among the rest, so no "visitors will see a paused page"
// warning is needed here.
// ---------------------------------------------------------------------------
function SalespersonPauseButton({ rotatorId, number, paused, onChange }: { rotatorId: string; number: string; paused: boolean; onChange: (paused: boolean) => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The row flips the moment it's clicked (onChange); reverted if the save fails.
  async function toggle() {
    const next = !paused;
    onChange(next);
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/rotator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rotatorId, pauseNumber: number, numberPaused: next }),
      });
      if (!res.ok) throw new Error("Could not update this salesperson. Please try again.");
      router.refresh();
    } catch (e) {
      onChange(!next);
      setError(e instanceof Error ? e.message : "Could not update this salesperson.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-[#25D366] hover:text-white disabled:opacity-50"
      >
        {paused ? <Play className="h-3.5 w-3.5" /> : <PauseIcon className="h-3.5 w-3.5" />}
        {paused ? "Resume" : "Pause"}
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Danger zone (delete)
// ---------------------------------------------------------------------------
function DangerZone({ kind, id }: { kind: LinkKind; id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function confirmDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(DELETE_ENDPOINT[kind], {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error("The link could not be deleted. Please try again.");
      router.push("/links");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The link could not be deleted.");
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <section className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
      <h2 className="text-sm font-semibold text-red-300">Danger zone</h2>
      <p className="mt-1 text-xs text-slate-500">Deleting a link stops it working immediately. This cannot be undone.</p>
      <div className="mt-4">
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-300">Delete this link for good?</span>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="rounded-full bg-red-500/90 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={deleting}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-slate-500"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 px-4 py-2 text-xs font-semibold text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete this link
          </button>
        )}
        {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      </div>
    </section>
  );
}
