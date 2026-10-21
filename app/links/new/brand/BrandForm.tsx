"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import PhoneInput, { type PhoneInputValue } from "@/app/components/PhoneInput";
import { sanitizeBrandSlugInput, buildCreatedUrl } from "@/lib/link-create-forms";
import { formatUsageLine } from "@/lib/my-links";

type SlugCheck = { state: "idle" | "checking" | "available" | "taken" | "invalid" };

export default function BrandForm({
  planLabel,
  used,
  limit,
  originHost,
  defaultCountry,
  simple = false,
}: {
  planLabel: string;
  used: number;
  limit: number;
  originHost: string;
  defaultCountry: string | null;
  simple?: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [showAddress, setShowAddress] = useState(!simple);
  const [phone, setPhone] = useState<PhoneInputValue>({ e164Digits: "", valid: false });
  const [message, setMessage] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  // Result of the last finished availability check, tagged with the slug it
  // was for; anything else on screen is derived, so the effect never has to
  // set state synchronously.
  const [checked, setChecked] = useState<{ slug: string; result: SlugCheck } | null>(null);
  const slugCheck: SlugCheck = !slug
    ? { state: "idle" }
    : slug.length < 3
      ? { state: "invalid" }
      : checked?.slug === slug
        ? checked.result
        : { state: "checking" };
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!slug || slug.length < 3) return;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/shortlinks/check?slug=${encodeURIComponent(slug)}`);
        const data = await res.json().catch(() => ({}));
        setChecked({ slug, result: !data.valid ? { state: "invalid" } : { state: data.available ? "available" : "taken" } });
      } catch {
        setChecked({ slug, result: { state: "idle" } });
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug]);

  const kindLabel = simple ? "WhatsApp link" : "brand link";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError(`Give your ${kindLabel} a name.`);
      return;
    }
    if (!phone.valid) {
      setError("Add a valid WhatsApp number.");
      return;
    }
    if (slug && slugCheck.state === "taken") {
      setError("That address is already taken — try another.");
      return;
    }
    if (slug && slugCheck.state === "invalid") {
      setError("Address must be 3–30 characters: lowercase letters, numbers, hyphens.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/shortlinks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.e164Digits, message, slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Could not create the ${kindLabel}. Please try again.`);
      router.push(buildCreatedUrl("brand", data.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not create the ${kindLabel}. Please try again.`);
      setCreating(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-border bg-surface p-6">
      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="brand-name">Name</label>
        <input
          id="brand-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Instagram bio"
          maxLength={60}
          required
          className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-muted">Just for you - visitors never see this name.</p>
      </div>

      {showAddress ? (
        <div>
          <label className="block text-xs text-muted mb-1" htmlFor="brand-slug">Brand address</label>
          <div className="flex items-center gap-2">
            <span className="shrink-0 font-mono text-xs text-muted">{originHost}/w/</span>
            <input
              id="brand-slug"
              value={slug}
              onChange={(e) => setSlug(sanitizeBrandSlugInput(e.target.value))}
              placeholder="yourcompany (optional)"
              className="min-w-0 flex-1 rounded-xl bg-surface border border-border-strong px-3 py-2 text-sm font-mono text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
            />
          </div>
          <div className="mt-1 text-xs">
            {slugCheck.state === "checking" && <span className="text-muted">Checking…</span>}
            {slugCheck.state === "available" && (
              <span className="inline-flex items-center gap-1 text-accent"><Check className="h-3.5 w-3.5" /> Available</span>
            )}
            {slugCheck.state === "taken" && (
              <span className="inline-flex items-center gap-1 text-danger"><X className="h-3.5 w-3.5" /> Already taken</span>
            )}
            {slugCheck.state === "invalid" && (
              <span className="text-warning">3–30 characters: lowercase letters, numbers, hyphens.</span>
            )}
            {slugCheck.state === "idle" && <span className="text-muted">Leave empty for a random address.</span>}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowAddress(true)}
          className="text-xs font-semibold text-accent hover:underline"
        >
          + Use my brand name in the address (optional)
        </button>
      )}

      <div>
        <label className="block text-xs text-muted mb-2">WhatsApp number</label>
        <PhoneInput defaultCountry={defaultCountry} onChange={setPhone} required />
      </div>

      <div>
        <label className="block text-xs text-muted mb-1" htmlFor="brand-message">First message (optional)</label>
        <textarea
          id="brand-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={600}
          rows={2}
          placeholder="Hi, I'd like more information."
          className="w-full rounded-xl bg-surface border border-border-strong px-4 py-2.5 text-sm text-text placeholder:text-muted/70 focus:outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-muted">Shown in WhatsApp. The visitor chooses whether to send it.</p>
      </div>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <p className="text-xs text-muted">{formatUsageLine(planLabel, used, limit)}</p>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={creating || !phone.valid}
          className="rounded-full bg-accent hover:bg-accent-hover disabled:opacity-50 px-6 py-2.5 text-sm font-bold text-on-accent transition-colors"
        >
          {creating ? "Creating…" : simple ? "Create WhatsApp link" : "Create brand link"}
        </button>
        <Link href="/links/new" className="text-sm font-semibold text-muted hover:text-text">
          Cancel
        </Link>
      </div>
    </form>
  );
}
