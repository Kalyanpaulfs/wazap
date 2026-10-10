"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarClock, CheckCircle2, CircleDollarSign, History, MessageCircle, Plus, Trash2, TrendingUp, UserRound } from "lucide-react";

type LeadActivity = {
  id: string;
  type: string;
  body: string | null;
  createdAt: string;
};

type Lead = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  source: string;
  campaign: string | null;
  status: string;
  owner: string | null;
  estimatedValue: number | null;
  currency: string;
  nextFollowUpAt: string | null;
  lastContactedAt: string | null;
  notes: string;
  activities: LeadActivity[];
  updatedAt: string;
};

type FlowMetrics = {
  conversationStarts30d: number;
  openPipelineValue: number;
  wonValue: number;
  wonCount: number;
  sourceStarts: { source: string; count: number }[];
};

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  won: "Won",
  lost: "Lost",
};

const EMPTY_FORM = {
  name: "",
  phone: "",
  email: "",
  source: "Manual",
  campaign: "",
  owner: "",
  estimatedValue: "",
  currency: "USD",
  nextFollowUpAt: "",
  notes: "",
};

function dueBucket(lead: Lead) {
  if (["won", "lost"].includes(lead.status)) return "closed";
  if (!lead.nextFollowUpAt) return "unscheduled";
  const due = new Date(lead.nextFollowUpAt).getTime();
  const endToday = new Date();
  endToday.setHours(23, 59, 59, 999);
  if (due < new Date().setHours(0, 0, 0, 0)) return "overdue";
  if (due <= endToday.getTime()) return "today";
  return "upcoming";
}

function dateLabel(value: string | null) {
  if (!value) return "No follow-up set";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function FollowUpPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [plan, setPlan] = useState("free");
  const [workspace, setWorkspace] = useState<{ id: string; name: string; role: string } | null>(null);
  const [limit, setLimit] = useState(15);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [filter, setFilter] = useState("today");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [metrics, setMetrics] = useState<FlowMetrics>({ conversationStarts30d: 0, openPipelineValue: 0, wonValue: 0, wonCount: 0, sourceStarts: [] });
  const [expandedLead, setExpandedLead] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/leads", { cache: "no-store" });
    if (response.status === 401) {
      setUnauthorized(true);
      setLoading(false);
      return;
    }
    const data = await response.json();
    setLeads(data.leads ?? []);
    setPlan(data.plan ?? "free");
    setWorkspace(data.workspace ?? null);
    setLimit(data.limit ?? 15);
    setMetrics(data.metrics ?? { conversationStarts30d: 0, openPipelineValue: 0, wonValue: 0, wonCount: 0, sourceStarts: [] });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const result = { today: 0, overdue: 0, upcoming: 0, unscheduled: 0, open: 0, won: 0 };
    for (const lead of leads) {
      const bucket = dueBucket(lead);
      if (bucket in result) result[bucket as keyof typeof result] += 1;
      if (!["won", "lost"].includes(lead.status)) result.open += 1;
      if (lead.status === "won") result.won += 1;
    }
    return result;
  }, [leads]);

  const visible = useMemo(() => leads.filter((lead) => {
    if (filter === "all") return true;
    if (filter === "open") return !["won", "lost"].includes(lead.status);
    if (filter === "won") return lead.status === "won";
    return dueBucket(lead) === filter;
  }), [leads, filter]);

  async function createLead(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      setError(data.error ?? "Could not save this lead.");
      return;
    }
    setForm(EMPTY_FORM);
    setShowForm(false);
    setFilter("open");
    await load();
  }

  async function updateLead(id: string, data: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/leads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...data }),
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Could not update this lead.");
      return;
    }
    await load();
  }

  async function removeLead(id: string) {
    if (!window.confirm("Archive this lead? It will leave your active workspace without deleting its history.")) return;
    await fetch("/api/leads", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  if (loading) {
    return (
      <div className="hero-bg min-h-[70vh] px-4 py-20 text-center">
        <h1 className="text-3xl font-bold text-white">WhatsApp Lead Follow-Up Tracker</h1>
        <p className="mt-3 text-slate-400">Loading your follow-up workspace…</p>
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="hero-bg min-h-[75vh] px-4 py-20">
        <div className="mx-auto max-w-xl rounded-3xl border border-[#25D366]/30 bg-[#0d150d] p-8 text-center">
          <CalendarClock className="mx-auto h-12 w-12 text-[#25D366]" />
          <h1 className="mt-5 text-3xl font-bold text-white">Never lose a WhatsApp lead</h1>
          <p className="mt-3 text-slate-400">Track source, campaign, value and the next follow-up date in one focused daily queue.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/signup?redirect=/tools/follow-up" className="rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black">Create free account</Link>
            <Link href="/login?redirect=/tools/follow-up" className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-white">Sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-bg min-h-screen px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#25D366]">Wazap Follow-Up</div>
            <h1 className="text-3xl font-bold text-white sm:text-4xl">Who needs a reply today?</h1>
            <p className="mt-2 text-slate-400">Turn campaign clicks and conversations into an organized sales habit.</p>
          </div>
          <button onClick={() => setShowForm((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#25D366] px-6 py-3 text-sm font-bold text-black">
            <Plus className="h-4 w-4" /> Add lead
          </button>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Due today", value: counts.today, icon: CalendarClock, color: "text-[#25D366]" },
            { label: "Overdue", value: counts.overdue, icon: ArrowRight, color: "text-red-400" },
            { label: "Open pipeline", value: counts.open, icon: TrendingUp, color: "text-blue-400" },
            { label: "Won", value: counts.won, icon: CheckCircle2, color: "text-emerald-400" },
            { label: "Starts · 30 days", value: metrics.conversationStarts30d, icon: MessageCircle, color: "text-violet-400" },
            { label: "Won value", value: metrics.wonValue.toLocaleString(), icon: CircleDollarSign, color: "text-yellow-300" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-[#111811] p-4">
              <Icon className={`h-5 w-5 ${color}`} />
              <div className="mt-3 text-2xl font-bold text-white">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-[#111811] px-4 py-3 text-xs text-slate-400">
          <span><strong className="text-white">{workspace?.name || "My workspace"}</strong> · <span className="capitalize">{workspace?.role}</span> · <strong className="capitalize text-white">{plan}</strong> plan · {counts.open}/{limit === -1 ? "∞" : limit} active leads</span>
          <span className="text-slate-500">Open pipeline value: <strong className="text-white">{metrics.openPipelineValue.toLocaleString()}</strong></span>
          <span className="flex gap-4"><Link href="/workspace" className="font-semibold text-[#25D366]">Manage team</Link><Link href="/pricing" className="font-semibold text-[#25D366]">Compare plans →</Link></span>
        </div>

        <section className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#25D366]" />
              <h2 className="font-semibold text-white">Conversation attribution</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">Privacy-safe starts recorded by Wazap links and routing workflows during the last 30 days.</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {metrics.sourceStarts.length ? metrics.sourceStarts.map((item) => (
                <div key={item.source} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/45 px-3 py-2.5 text-sm">
                  <span className="truncate text-slate-300">{item.source}</span>
                  <strong className="ml-3 text-white">{item.count}</strong>
                </div>
              )) : <p className="text-sm text-slate-600">Conversation sources will appear after customers use your tracked links.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-[#25D366]/20 bg-[#25D366]/5 p-5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#25D366]">Outcome loop</p>
            <h2 className="mt-2 font-semibold text-white">Start → follow up → win</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">Wazap now measures conversation starts independently of message content. Move leads through the pipeline to connect acquisition activity with business outcomes.</p>
          </div>
        </section>

        {showForm && (
          <form onSubmit={createLead} className="mt-6 rounded-3xl border border-[#25D366]/30 bg-[#0d150d] p-5 sm:p-7">
            <h2 className="text-lg font-bold text-white">Add a lead</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { key: "name", label: "Lead name", required: true, placeholder: "Jane Smith" },
                { key: "phone", label: "WhatsApp number", required: true, placeholder: "971501234567" },
                { key: "email", label: "Email", placeholder: "jane@example.com" },
                { key: "source", label: "Source", placeholder: "Meta ad, website, referral" },
                { key: "campaign", label: "Campaign", placeholder: "Summer offer" },
                { key: "owner", label: "Owner", placeholder: "Joseph" },
                { key: "estimatedValue", label: "Estimated value", placeholder: "2500", type: "number" },
                { key: "currency", label: "Currency", placeholder: "USD", maxLength: 3 },
                { key: "nextFollowUpAt", label: "Next follow-up", type: "datetime-local" },
              ].map(({ key, label, ...props }) => (
                <label key={key} className="text-xs text-slate-400">{label}
                  <input {...props} value={form[key as keyof typeof form]} onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-[#25D366]" />
                </label>
              ))}
            </div>
            <label className="mt-4 block text-xs text-slate-400">Notes
              <textarea aria-label="Intent, objections, promised next step…" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} rows={3} placeholder="Intent, objections, promised next step…"
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-[#25D366]" />
            </label>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button disabled={saving} className="rounded-full bg-[#25D366] px-6 py-2.5 text-sm font-bold text-black disabled:opacity-50">{saving ? "Saving…" : "Save lead"}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-full border border-slate-700 px-6 py-2.5 text-sm font-semibold text-slate-300">Cancel</button>
            </div>
          </form>
        )}

        {error && <div role="alert" className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>}

        <div className="mt-7 flex gap-2 overflow-x-auto pb-2">
          {[
            ["today", `Today (${counts.today})`], ["overdue", `Overdue (${counts.overdue})`], ["upcoming", "Upcoming"],
            ["unscheduled", "No date"], ["open", "All open"], ["won", "Won"], ["all", "All"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold ${filter === key ? "bg-[#25D366] text-black" : "border border-slate-800 bg-[#111811] text-slate-400"}`}>{label}</button>
          ))}
        </div>

        <div className="mt-3 space-y-3">
          {!visible.length && (
            <div className="rounded-3xl border border-dashed border-slate-800 py-14 text-center">
              <UserRound className="mx-auto h-9 w-9 text-slate-700" />
              <p className="mt-3 text-sm text-slate-500">No leads in this view.</p>
            </div>
          )}
          {visible.map((lead) => {
            const bucket = dueBucket(lead);
            const message = encodeURIComponent(`Hi ${lead.name}, just following up on our conversation. Is there anything I can help with?`);
            return (
              <article key={lead.id} className="rounded-2xl border border-slate-800 bg-[#111811] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-white">{lead.name}</h2>
                      <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-300">{STATUS_LABELS[lead.status] ?? lead.status}</span>
                      {bucket === "overdue" && <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-bold text-red-400">OVERDUE</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>{lead.phone}</span>
                      <span>{lead.source}{lead.campaign ? ` · ${lead.campaign}` : ""}</span>
                      {lead.owner && <span>Owner: {lead.owner}</span>}
                      {lead.estimatedValue != null && <span>Value: {lead.currency} {lead.estimatedValue.toLocaleString()}</span>}
                    </div>
                    <div className={`mt-2 text-xs ${bucket === "overdue" ? "text-red-400" : bucket === "today" ? "text-[#25D366]" : "text-slate-400"}`}>{dateLabel(lead.nextFollowUpAt)}</div>
                    {lead.notes && <p className="mt-2 line-clamp-2 text-sm text-slate-400">{lead.notes}</p>}
                    {lead.activities?.length > 0 && (
                      <button onClick={() => setExpandedLead(expandedLead === lead.id ? null : lead.id)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#25D366]">
                        <History className="h-3.5 w-3.5" /> {expandedLead === lead.id ? "Hide history" : `History (${lead.activities.length})`}
                      </button>
                    )}
                    {expandedLead === lead.id && (
                      <div className="mt-3 space-y-2 border-l border-slate-700 pl-3">
                        {lead.activities.map((activity) => (
                          <div key={activity.id} className="text-xs text-slate-500">
                            <span className="font-medium text-slate-300">{activity.body || activity.type}</span>
                            <span className="ml-2">{new Date(activity.createdAt).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <select aria-label={`Status for ${lead.name}`} value={lead.status} onChange={(event) => updateLead(lead.id, { status: event.target.value })}
                      className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white">
                      {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    <a href={`https://wa.me/${lead.phone}?text=${message}`} target="_blank" rel="noopener noreferrer" onClick={() => updateLead(lead.id, { markContacted: true })}
                      className="inline-flex items-center gap-2 rounded-full bg-[#25D366] px-4 py-2 text-xs font-bold text-black">
                      <MessageCircle className="h-4 w-4" /> Follow up
                    </a>
                    <button onClick={() => removeLead(lead.id)} aria-label={`Archive ${lead.name}`} title="Archive lead" className="rounded-full border border-slate-700 p-2 text-slate-500 hover:border-yellow-500/50 hover:text-yellow-300"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
