"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Gauge,
  MessageSquareText,
  ShieldCheck,
  Star,
  UsersRound,
} from "lucide-react";

type Install = {
  id: string;
  setupStatus: string;
  lastTestedAt?: string | null;
  activatedAt?: string | null;
  config?: {
    objective?: string;
    audience?: string;
    channelId?: string;
    sampleCustomerMessage?: string;
    sampleDraft?: string;
  } | null;
  listing: { name: string; slug: string; packageType: string; requestedScopes: string[] };
  version: { version: string };
};
type Channel = { id: string; displayName: string; channel: string; status: string };
type Outcomes = { completedRuns: number; draftsPrepared: number; humanHandoffs: number; leadsTracked: number };
type Overview = { installs: Install[]; channels: Channel[]; knowledgeCount: number; outcomes: Outcomes; outcomesByInstall?: Record<string, Outcomes> };

const EMPTY_OUTCOMES: Outcomes = {
  completedRuns: 0,
  draftsPrepared: 0,
  humanHandoffs: 0,
  leadsTracked: 0,
};

export default function AgentLaunchWizard({ installId }: { installId: string }) {
  const [overview, setOverview] = useState<Overview>({ installs: [], channels: [], knowledgeCount: 0, outcomes: EMPTY_OUTCOMES });
  const [objective, setObjective] = useState("");
  const [audience, setAudience] = useState("");
  const [channelId, setChannelId] = useState("manual_review");
  const [sampleMessage, setSampleMessage] = useState("Hi, I would like more information and help with the next step.");
  const [sampleDraft, setSampleDraft] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [rating, setRating] = useState(5);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/marketplace/activation", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Could not load agent setup.");
      return;
    }
    setOverview(data);
    const install = (data.installs || []).find((item: Install) => item.id === installId);
    if (install?.config) {
      setObjective(install.config.objective || "");
      setAudience(install.config.audience || "");
      setChannelId(install.config.channelId || "manual_review");
      setSampleMessage(install.config.sampleCustomerMessage || "Hi, I would like more information and help with the next step.");
      setSampleDraft(install.config.sampleDraft || "");
    }
  }, [installId]);

  useEffect(() => {
    // Loading remote workspace state is the external synchronization performed by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const install = useMemo(
    () => overview.installs.find((item) => item.id === installId),
    [installId, overview.installs],
  );
  const tested = Boolean(install?.lastTestedAt || sampleDraft);
  const active = install?.setupStatus === "active";
  const outcomes = overview.outcomesByInstall?.[installId] || overview.outcomes;

  async function action(name: "configure" | "test" | "activate") {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/marketplace/activation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: name,
        installId,
        objective,
        audience,
        channelId,
        sampleCustomerMessage: sampleMessage,
      }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(data.error || data.notice || (name === "configure" ? "Objective saved." : name === "test" ? "Safe test completed." : "Agent activated."));
    if (data.sampleDraft) setSampleDraft(data.sampleDraft);
    await load();
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const response = await fetch("/api/marketplace/reviews", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ installId, rating, title: reviewTitle, body: reviewBody }),
    });
    const data = await response.json();
    setBusy(false);
    setMessage(data.error || "Verified-install review published.");
  }

  if (!install && !message) {
    return <main className="hero-bg min-h-screen px-4 py-20 text-center text-slate-400">Loading agent setup…</main>;
  }
  if (!install) {
    return (
      <main className="hero-bg min-h-screen px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-white">Agent install not found</h1>
        <p className="mt-3 text-slate-400">{message}</p>
        <Link href="/marketplace/manage" className="mt-6 inline-block text-[#25D366]">Return to marketplace workspace</Link>
      </main>
    );
  }

  const cards = [
    ["Drafts prepared", outcomes.draftsPrepared, MessageSquareText],
    ["Successful runs", outcomes.completedRuns, Gauge],
    ["Human handoffs", outcomes.humanHandoffs, UsersRound],
    ["Workspace leads", outcomes.leadsTracked, CheckCircle2],
  ] as const;

  return (
    <main className="hero-bg min-h-screen px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <Link href="/marketplace/manage" className="text-sm font-semibold text-[#25D366]">← Marketplace workspace</Link>
        <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#25D366]">Guided activation</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">{install.listing.name}</h1>
            <p className="mt-2 text-slate-400">v{install.version.version} · {install.setupStatus.replaceAll("_", " ")}</p>
          </div>
          <span className="rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-2 text-sm font-semibold text-[#25D366]">
            {active ? "Active with human approval" : tested ? "Tested safely" : "Setup in progress"}
          </span>
        </div>

        {message && <p className="mt-5 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-3 text-sm text-[#25D366]">{message}</p>}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(([label, value, Icon]) => (
            <article key={label} className="rounded-2xl border border-slate-800 bg-[#111811] p-4">
              <Icon className="h-5 w-5 text-[#25D366]" />
              <p className="mt-3 text-2xl font-bold text-white">{value}</p>
              <p className="text-xs text-slate-500">{label}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#25D366]">1 · Define the outcome</p>
            <label className="mt-4 block text-sm font-semibold text-white">Business objective</label>
            <textarea value={objective} onChange={(event) => setObjective(event.target.value)} rows={4} placeholder="Example: Qualify inbound enquiries and prepare budget, timing and requirements for a human sales advisor." className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
            <label className="mt-4 block text-sm font-semibold text-white">Customer audience</label>
            <input value={audience} onChange={(event) => setAudience(event.target.value)} placeholder="Example: New website leads asking about services" className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
            <label className="mt-4 block text-sm font-semibold text-white">Conversation source</label>
            <select value={channelId} onChange={(event) => setChannelId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white">
              <option value="manual_review">Manual review inbox</option>
              {overview.channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.displayName} · {channel.status}</option>)}
            </select>
            <button disabled={busy} onClick={() => action("configure")} className="mt-4 rounded-xl bg-[#25D366] px-5 py-3 font-bold text-black disabled:opacity-50">Save objective</button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#25D366]">2 · Add approved knowledge</p>
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-slate-950 p-4">
              <ShieldCheck className="h-6 w-6 text-[#25D366]" />
              <div><p className="font-semibold text-white">{overview.knowledgeCount} approved knowledge entries</p><p className="text-xs text-slate-500">Agents use only reviewed workspace facts.</p></div>
            </div>
            <Link href="/ai-agents" className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-5 py-3 font-semibold text-white">Manage knowledge <ArrowRight className="h-4 w-4" /></Link>
            <p className="mt-5 text-sm leading-6 text-slate-400">Sensitive requests, payments, legal commitments and uncertain facts always require a human reviewer.</p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#25D366]">3 · Test before activation</p>
            <label className="mt-4 block text-sm font-semibold text-white">Sample customer message</label>
            <textarea value={sampleMessage} onChange={(event) => setSampleMessage(event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-white" />
            <button disabled={busy || !objective || !audience} onClick={() => action("test")} className="mt-4 rounded-xl border border-[#25D366]/40 px-5 py-3 font-bold text-[#25D366] disabled:opacity-40">Generate safe preview</button>
            {sampleDraft && <div className="mt-4 rounded-xl bg-slate-950 p-4"><p className="text-xs font-semibold text-slate-500">DRAFT — NOT SENT</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{sampleDraft}</p></div>}
          </div>

          <div className="rounded-2xl border border-[#25D366]/25 bg-[#25D366]/5 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#25D366]">4 · Activate safely</p>
            <div className="mt-4 flex gap-3"><Bot className="h-7 w-7 text-[#25D366]" /><div><p className="font-bold text-white">Human-reviewed drafts only</p><p className="mt-1 text-sm text-slate-400">Activation never enables automatic message sending.</p></div></div>
            <button disabled={busy || !tested || active} onClick={() => action("activate")} className="mt-5 rounded-xl bg-[#25D366] px-5 py-3 font-bold text-black disabled:opacity-40">{active ? "Agent active" : "Activate with approval required"}</button>
            <Link href="/inbox" className="ml-3 inline-flex items-center gap-1 text-sm font-semibold text-white">Open inbox <ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>

        {tested && (
          <form onSubmit={submitReview} className="mt-6 rounded-2xl border border-slate-800 bg-[#111811] p-5">
            <div className="flex items-center gap-2"><Star className="h-5 w-5 text-yellow-300" /><h2 className="font-bold text-white">Verified-install review</h2></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-[120px_1fr]">
              <select value={rating} onChange={(event) => setRating(Number(event.target.value))} className="rounded-xl bg-slate-950 p-3 text-white">{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select>
              <input value={reviewTitle} onChange={(event) => setReviewTitle(event.target.value)} placeholder="Review title" className="rounded-xl bg-slate-950 p-3 text-white" />
            </div>
            <textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} rows={3} placeholder="What outcome did this package help you prepare?" className="mt-3 w-full rounded-xl bg-slate-950 p-3 text-white" />
            <button disabled={busy} className="mt-3 rounded-xl border border-slate-700 px-5 py-2 font-semibold text-white">Publish verified review</button>
          </form>
        )}
      </div>
    </main>
  );
}
