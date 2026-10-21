"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "lucide-react";
import PhoneInput, { type PhoneInputValue } from "@/app/components/PhoneInput";
import { AD_SOURCE_PRESETS, sourceToUtmSource, buildCreatedUrl, type AdSourcePreset } from "@/lib/link-create-forms";
import { formatUsageLine } from "@/lib/my-links";

export default function AdForm({
  planLabel,
  used,
  limit,
  defaultCountry,
}: {
  planLabel: string;
  used: number;
  limit: number;
  defaultCountry: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [number, setNumber] = useState<PhoneInputValue>({ e164Digits: "", valid: false });
  const [message, setMessage] = useState("");
  const [source, setSource] = useState<AdSourcePreset>("Facebook");
  const [customSource, setCustomSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [utmMedium, setUtmMedium] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
    setCreating(true);
    try {
      const res = await fetch("/api/adlinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          number: number.e164Digits,
          message,
          utmSource: sourceToUtmSource(source, customSource),
          utmMedium,
          utmCampaign: campaign,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not create the ad link. Please try again.");
      router.push(buildCreatedUrl("ad", data.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the ad link. Please try again.");
      setCreating(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-surface p-6">
      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="ad-name">Name</label>
        <input
          id="ad-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Facebook lead gen"
          maxLength={100}
          required
          className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-muted">Just for you - visitors never see this name.</p>
      </div>

      <div>
        <label className="block text-xs text-muted mb-2">WhatsApp number</label>
        <PhoneInput defaultCountry={defaultCountry} onChange={setNumber} required />
      </div>

      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="ad-message">First message (optional)</label>
        <input
          id="ad-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Hi, I saw your ad and I'm interested..."
          className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="block text-xs text-muted mb-2">Where does this ad run?</label>
        <div className="flex flex-wrap gap-2">
          {AD_SOURCE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setSource(preset)}
              aria-pressed={source === preset}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-semibold ${
                source === preset ? "border-accent bg-accent-soft text-accent" : "border-border-strong text-muted hover:border-border-strong"
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
            className="mt-2 w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
          />
        )}
      </div>

      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="ad-campaign">Campaign name (optional)</label>
        <input
          id="ad-campaign"
          value={campaign}
          onChange={(e) => setCampaign(e.target.value)}
          placeholder="e.g. summer-sale"
          className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-muted">Helps you tell campaigns apart in Results.</p>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted hover:text-text"
        >
          {showMore ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          More tracking options
        </button>
        {showMore && (
          <div className="mt-2">
            <label className="block text-xs text-muted mb-1" htmlFor="ad-medium">Ad placement (optional)</label>
            <input
              id="ad-medium"
              value={utmMedium}
              onChange={(e) => setUtmMedium(e.target.value)}
              placeholder="e.g. cpc, story, feed"
              className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
            />
            <p className="mt-1 text-xs text-muted">Advanced - only needed if you track ad placements separately.</p>
          </div>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <p className="text-xs text-muted">{formatUsageLine(planLabel, used, limit)}</p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={creating || !number.valid}
          className="rounded-full bg-accent hover:bg-accent-hover disabled:opacity-50 px-6 py-2.5 text-sm font-bold text-on-accent transition-colors"
        >
          {creating ? "Creating…" : "Create ad link"}
        </button>
        <Link href="/links/new" className="text-sm font-semibold text-muted hover:text-text">
          Cancel
        </Link>
      </div>
    </form>
  );
}
