import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Inbox,
  MessageCircle,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspaces";

const DAY = 86_400_000;

function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function sourceName(value: string | null) {
  return value?.trim() || "Direct / unknown";
}

function reportWindow() {
  const now = new Date();
  return { now, since30d: new Date(now.getTime() - 30 * DAY), since14d: new Date(now.getTime() - 13 * DAY) };
}

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login?redirect=/reports");

  const userId = (session.user as { id: string }).id;
  const membership = await getActiveWorkspace(userId);
  const { now, since30d, since14d } = reportWindow();

  const [workspace, leads, starts, conversations, dueTasks] = await Promise.all([
    prisma.workspace.findUnique({ where: { id: membership.workspaceId }, select: { name: true, ownerId: true } }),
    prisma.lead.findMany({
      where: { workspaceId: membership.workspaceId, archivedAt: null, createdAt: { gte: since30d } },
      select: { id: true, source: true, status: true, estimatedValue: true, currency: true, createdAt: true, closedAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.conversationStart.findMany({
      where: { workspaceId: membership.workspaceId, createdAt: { gte: since30d } },
      select: { source: true, assetType: true, assetName: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.inboxConversation.findMany({
      where: { workspaceId: membership.workspaceId, createdAt: { gte: since30d } },
      select: { status: true, assignedMemberId: true, createdAt: true, firstResponseAt: true },
    }),
    prisma.inboxTask.count({ where: { workspaceId: membership.workspaceId, status: "open", dueAt: { lte: now } } }),
  ]);

  if (!workspace) redirect("/workspace");

  const won = leads.filter((lead) => lead.status === "won");
  const open = leads.filter((lead) => !["won", "lost"].includes(lead.status));
  const wonValue = won.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0), 0);
  const openValue = open.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0), 0);
  const conversionRate = leads.length ? Math.round((won.length / leads.length) * 1000) / 10 : 0;
  const responseSamples = conversations
    .filter((conversation) => conversation.firstResponseAt)
    .map((conversation) => Math.max(0, conversation.firstResponseAt!.getTime() - conversation.createdAt.getTime()));
  const averageResponseMinutes = responseSamples.length
    ? Math.round(responseSamples.reduce((sum, value) => sum + value, 0) / responseSamples.length / 60_000)
    : null;

  const sourceMap = new Map<string, { leads: number; won: number; value: number; starts: number }>();
  for (const lead of leads) {
    const source = sourceName(lead.source);
    const row = sourceMap.get(source) ?? { leads: 0, won: 0, value: 0, starts: 0 };
    row.leads += 1;
    if (lead.status === "won") { row.won += 1; row.value += lead.estimatedValue ?? 0; }
    sourceMap.set(source, row);
  }
  for (const start of starts) {
    const source = sourceName(start.source);
    const row = sourceMap.get(source) ?? { leads: 0, won: 0, value: 0, starts: 0 };
    row.starts += 1;
    sourceMap.set(source, row);
  }
  const sources = [...sourceMap.entries()].sort((a, b) => (b[1].starts + b[1].leads) - (a[1].starts + a[1].leads)).slice(0, 8);

  const assetMap = new Map<string, number>();
  for (const start of starts) {
    const label = start.assetName?.trim() || start.assetType.replaceAll("_", " ");
    assetMap.set(label, (assetMap.get(label) ?? 0) + 1);
  }
  const assets = [...assetMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxAssetStarts = Math.max(1, ...assets.map(([, count]) => count));

  const daily = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(since14d.getTime() + index * DAY);
    const key = dayKey(date);
    return {
      key,
      label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date),
      starts: starts.filter((item) => dayKey(item.createdAt) === key).length,
      leads: leads.filter((item) => dayKey(item.createdAt) === key).length,
      won: won.filter((item) => item.closedAt && dayKey(item.closedAt) === key).length,
    };
  });
  const maxDaily = Math.max(1, ...daily.map((item) => item.starts + item.leads + item.won));

  const recommendations = [
    starts.length === 0 ? "Publish one tracked Wazap link or QR campaign so attribution can begin." : null,
    leads.length === 0 ? "Connect campaign conversations to leads and assign a next follow-up date." : null,
    conversations.some((item) => !item.assignedMemberId && item.status !== "resolved") ? "Assign every open conversation so no customer is left without an owner." : null,
    dueTasks > 0 ? `Clear ${dueTasks} overdue inbox task${dueTasks === 1 ? "" : "s"} before adding more campaigns.` : null,
    leads.length > 0 && conversionRate < 10 ? "Review lost and stalled leads, then standardize the best-performing follow-up sequence." : null,
  ].filter(Boolean) as string[];

  const metrics = [
    { label: "Conversation starts", value: starts.length.toLocaleString(), detail: "Tracked across Wazap assets", icon: MessageCircle },
    { label: "New leads", value: leads.length.toLocaleString(), detail: "Created in the last 30 days", icon: Users },
    { label: "Lead conversion", value: `${conversionRate}%`, detail: `${won.length} marked won`, icon: Target },
    { label: "Won value", value: money(wonValue), detail: `${money(openValue)} open pipeline`, icon: CircleDollarSign },
    { label: "Average response", value: averageResponseMinutes == null ? "—" : `${averageResponseMinutes}m`, detail: `${responseSamples.length} measured replies`, icon: Clock3 },
    { label: "Inbox health", value: `${conversations.filter((item) => item.status === "open").length} open`, detail: `${dueTasks} overdue tasks`, icon: Inbox },
  ];

  return (
    <main className="hero-bg min-h-screen px-4 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-[#25D366]">Wazap Intelligence · 30 days</p>
            <h1 className="mt-2 text-3xl font-bold text-white sm:text-4xl">From first click to closed lead</h1>
            <p className="mt-2 text-slate-400">One view of acquisition, conversations, pipeline, team response and outcomes for {workspace.name}.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/inbox" className="rounded-full border border-slate-700 px-5 py-2.5 text-sm font-semibold text-white hover:border-[#25D366]">Open inbox</Link>
            <Link href="/tools/follow-up" className="rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black">Open pipeline</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {metrics.map(({ label, value, detail, icon: Icon }) => (
            <article key={label} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
              <Icon className="h-5 w-5 text-[#25D366]" />
              <p className="mt-4 text-2xl font-bold text-white">{value}</p>
              <p className="mt-1 text-sm font-semibold text-slate-300">{label}</p>
              <p className="mt-1 text-xs text-slate-500">{detail}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <article className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7">
            <div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-[#25D366]" /><h2 className="font-bold text-white">Fourteen-day activity</h2></div>
            <div className="mt-6 flex h-56 items-end gap-2" aria-label="Daily activity chart">
              {daily.map((item) => {
                const total = item.starts + item.leads + item.won;
                return <div key={item.key} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div className="text-[10px] text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">{total}</div>
                  <div className="w-full rounded-t-md bg-[#25D366] transition-all" style={{ height: `${Math.max(total ? 8 : 2, (total / maxDaily) * 170)}px`, opacity: total ? 0.85 : 0.12 }} title={`${item.label}: ${item.starts} starts, ${item.leads} leads, ${item.won} won`} />
                  <span className="hidden text-[9px] text-slate-600 sm:block">{item.label}</span>
                </div>;
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500"><span>Bars combine conversation starts, new leads and won outcomes.</span></div>
          </article>

          <article className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7">
            <div className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-[#25D366]" /><h2 className="font-bold text-white">Top conversion assets</h2></div>
            <div className="mt-5 space-y-4">
              {assets.length ? assets.map(([name, count]) => <div key={name}>
                <div className="flex justify-between gap-3 text-sm"><span className="truncate text-slate-300 capitalize">{name}</span><strong className="text-white">{count}</strong></div>
                <div className="mt-2 h-2 rounded-full bg-slate-900"><div className="h-2 rounded-full bg-[#25D366]" style={{ width: `${Math.max(4, (count / maxAssetStarts) * 100)}%` }} /></div>
              </div>) : <p className="rounded-xl border border-dashed border-slate-700 p-5 text-sm text-slate-500">No attributed conversation starts yet.</p>}
            </div>
          </article>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.5fr_.8fr]">
          <article className="overflow-hidden rounded-3xl border border-slate-800 bg-[#111811]">
            <div className="border-b border-slate-800 px-5 py-4 sm:px-7"><h2 className="font-bold text-white">Performance by source</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-600"><tr><th className="px-5 py-3 sm:px-7">Source</th><th className="px-4 py-3">Starts</th><th className="px-4 py-3">Leads</th><th className="px-4 py-3">Won</th><th className="px-4 py-3">Won value</th></tr></thead>
                <tbody>{sources.length ? sources.map(([source, row]) => <tr key={source} className="border-t border-slate-800/70"><td className="px-5 py-4 font-semibold text-white sm:px-7">{source}</td><td className="px-4 py-4 text-slate-300">{row.starts}</td><td className="px-4 py-4 text-slate-300">{row.leads}</td><td className="px-4 py-4 text-slate-300">{row.won}</td><td className="px-4 py-4 text-slate-300">{money(row.value)}</td></tr>) : <tr><td colSpan={5} className="px-7 py-8 text-center text-slate-500">No source data yet.</td></tr>}</tbody>
              </table>
            </div>
          </article>

          <aside className="rounded-3xl border border-[#25D366]/25 bg-[#25D366]/5 p-5 sm:p-7">
            <CheckCircle2 className="h-6 w-6 text-[#25D366]" />
            <h2 className="mt-4 text-lg font-bold text-white">Recommended next actions</h2>
            <div className="mt-4 space-y-3">
              {(recommendations.length ? recommendations : ["Performance is healthy. Increase traffic to the best-converting asset and monitor lead quality."]).map((item) => <div key={item} className="flex gap-3 rounded-xl border border-slate-800 bg-black/20 p-3 text-sm leading-relaxed text-slate-300"><ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-[#25D366]" />{item}</div>)}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
