"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  Users, Crown, DollarSign, TrendingUp, Search, Download,
  ChevronDown, ChevronUp, X, AlertTriangle, Loader2,
  RefreshCw, MessageCircle, Send, Trash2, MailOpen, Mail,
  DatabaseBackup, CheckCircle2,
} from "lucide-react";

const PLAN_COLORS: Record<string, string> = {
  free: "text-slate-400", basic: "text-blue-400", pro: "text-[#25D366]", ultimate: "text-yellow-400", business: "text-emerald-300",
};
const PLAN_BG: Record<string, string> = {
  free: "bg-slate-700/30", basic: "bg-blue-500/20", pro: "bg-[#25D366]/20", ultimate: "bg-yellow-500/20", business: "bg-emerald-500/20",
};

function planDaysLeft(planExpiresAt: string | null) {
  if (!planExpiresAt) return null;
  return Math.max(0, Math.ceil((new Date(planExpiresAt).getTime() - Date.now()) / 86_400_000));
}

interface Payment { id: string; plan: string; amount: number; method: string; txId?: string | null; status: string; createdAt: string; }
function isReceivedPayment(p: Payment) {
  return p.status === "active" && !(p.method === "paypal" && p.txId?.startsWith("I-"));
}
interface User {
  id: string; email: string; name: string | null; plan: string; planExpiresAt: string | null;
  trialEndsAt: string | null; trialPlan: string | null;
  isAdmin: boolean; createdAt: string; payments: Payment[];
}
interface Stats { totalUsers: number; subscribers: number; conversionPct: number; totalRevenue: string; mrr: string; expiringSoon: number; churned: number; activeTrials: number; queuedEmails: number; emailFailures: number; emailAwaitingDelivery: number; }
interface BackupRestoreStatus { status: "healthy" | "failed" | "stale" | "missing"; verifiedAt: string | null; backup: string | null; bytes: number | null; durationSeconds: number | null; reason: string | null; }
interface NorthStarMetrics { timezone: string; dayStartedAt: string; inboxBusinessesToday: number; trackedLinkBusinessesToday: number; trackedLinkStartsToday: number; newInboxConversationsToday: number; inboxBusinesses7d: number; inboxBusinesses30d: number; trackedLinkBusinesses7d: number; trackedLinkBusinesses30d: number; retainedBusinesses7d: number; retainedBusinesses7dRate: number | null; }
interface FunnelMetric { name: string; count: number; }
interface TrafficMetric { label: string; count: number; }
interface ContactMessage {
  id: string; name: string; email: string; subject: string; message: string;
  adminReply?: string | null; repliedAt?: string | null; adminReplySeenAt?: string | null; read: boolean; createdAt: string;
}
interface SupportChatMessage { id: string; sender: string; body: string; readByAdmin: boolean; readByVisitor: boolean; createdAt: string; }
interface SupportConversation {
  id: string; visitorId: string; name: string | null; email: string | null; phone?:string|null; crmLeadId?:string|null; subject: string; status: string;
  intent: string; leadScore: number; aiSummary?: string | null;
  lastMessageAt: string; createdAt: string; unread: number; messages: SupportChatMessage[];
}

export default function AdminDashboard({ data }: {
  data: { stats: Stats; system: { backupRestore: BackupRestoreStatus; northStar: NorthStarMetrics }; funnel?: FunnelMetric[]; traffic?: { countries: TrafficMetric[]; sources: TrafficMetric[]; yahoo?: { visits7d: number; visits30d: number; knownUserVisits: number; paths: TrafficMetric[] } }; users: User[]; contactMessages?: ContactMessage[]; supportConversations?: SupportConversation[] }
}) {
  const [users, setUsers] = useState(data.users);
  const [messages, setMessages] = useState<ContactMessage[]>(data.contactMessages ?? []);
  const [conversations, setConversations] = useState<SupportConversation[]>(data.supportConversations ?? []);
  const [selectedChat, setSelectedChat] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("chat") ?? data.supportConversations?.[0]?.id ?? null;
    }
    return data.supportConversations?.[0]?.id ?? null;
  });
  const [replyDrafts, setReplyDrafts] = useState<Record<string,string>>({});
  const [section,setSection] = useState("overview");
  const [supportFilter,setSupportFilter] = useState("all");
  const [supportNotice,setSupportNotice] = useState("");
  const [actionNotice,setActionNotice] = useState("");
  const [userPage,setUserPage] = useState(1);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get("chat"))setSection("support");else if(params.get("section")==="users"){setSection("users");setSearch(params.get("customer")||"");}},[]);
  const [contactReplies, setContactReplies] = useState<Record<string, string>>({});
  const [contactNotices, setContactNotices] = useState<Record<string, string>>({});
  const [chatLoading, setChatLoading] = useState(false);
  const [expandedMsg, setExpandedMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);

  const filtered = users.filter(u => {
    const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase()) || (u.name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || u.plan === planFilter;
    return matchSearch && matchPlan;
  });

  const visibleConversations = conversations.filter(c=>supportFilter==="all" || (supportFilter==="unread"?c.unread>0:c.status===supportFilter));
  const activeChat = visibleConversations.find(c => c.id === selectedChat) ?? visibleConversations[0] ?? null;
  const replyText = activeChat ? replyDrafts[activeChat.id] || "" : "";
  function setReplyText(value:string){if(activeChat)setReplyDrafts(previous=>({...previous,[activeChat.id]:value}));}
  const pageCount = Math.max(1,Math.ceil(filtered.length/20));
  const currentPage = Math.min(userPage,pageCount);
  const pageUsers = filtered.slice((currentPage-1)*20,currentPage*20);
  const unreadChats = conversations.reduce((sum, c) => sum + c.unread, 0);

  const refreshSupport = useCallback(async (showLoading = true) => {
    if (document.hidden && !showLoading) return;
    if (showLoading) setChatLoading(true);
    try {
      const res = await fetch("/api/admin/support");
      if (!res.ok) throw new Error("Support refresh failed");
      const json = await res.json();
      setConversations(json.conversations);
      setSupportNotice("");
    } catch { setSupportNotice("Unable to refresh support. Your draft is safe; try again."); }
    finally { if (showLoading) setChatLoading(false); }
  }, []);

  useEffect(() => {
    if(section!=="support")return;
    const interval = window.setInterval(() => refreshSupport(false), 5000);
    return () => window.clearInterval(interval);
  }, [refreshSupport,section]);

  async function markChat(conversationId: string, status?: "open" | "closed") {
    try {
      const response=await fetch("/api/admin/support",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({conversationId,status})});
      if(!response.ok)throw new Error("Update failed");
      await refreshSupport(false);
    } catch {setSupportNotice("The conversation could not be updated. Try again.");}
  }

  async function replySupport(e: React.FormEvent) {
    e.preventDefault();
    if (!activeChat || !replyText.trim() || chatLoading) return;
    const conversationId=activeChat.id;
    const draft=replyText;
    setChatLoading(true);
    try {
      const res = await fetch("/api/admin/support", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: draft }),
      });
      if (!res.ok) throw new Error("Reply failed");
      const json = await res.json();
      setConversations(json.conversations);
      setReplyDrafts(previous=>({...previous,[conversationId]:previous[conversationId]===draft?"":previous[conversationId]}));
      setSupportNotice("Reply saved in the visitor's conversation.");
    } catch { setSupportNotice("Reply could not be sent. Your draft is saved here; try again."); }
    finally { setChatLoading(false); }
  }

  async function replyContactMessage(messageId: string) {
    const reply = contactReplies[messageId]?.trim();
    if (!reply || loading === messageId) return;
    setLoading(messageId);
    setContactNotices(current => ({ ...current, [messageId]: "" }));
    const res = await fetch("/api/admin/contact-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, reply }),
    });
    if (res.ok) {
      const json = await res.json();
      setMessages(ms => ms.map(m => m.id === messageId ? {
        ...m,
        read: json.message.read,
        adminReply: json.message.adminReply,
        repliedAt: json.message.repliedAt,
        adminReplySeenAt: json.message.adminReplySeenAt,
      } : m));
      setContactReplies(r => ({ ...r, [messageId]: "" }));
      setContactNotices(current => ({
        ...current,
        [messageId]: json.message.emailSent
          ? "Reply saved in the customer dashboard and accepted by the email provider."
          : "Reply saved in the customer dashboard. Email delivery is queued for retry.",
      }));
    } else {
      setContactNotices(current => ({ ...current, [messageId]: "Reply could not be saved. Please try again." }));
    }
    setLoading(null);
  }

  async function setContactRead(messageId: string, read: boolean) {
    const response = await fetch("/api/admin/contact-messages", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, read }),
    });
    if (response.ok) setMessages(current => current.map(message => message.id === messageId ? { ...message, read } : message));
  }

  async function openContactMessage(message: ContactMessage) {
    const opening = expandedMsg !== message.id;
    setExpandedMsg(opening ? message.id : null);
    if (opening && !message.read) await setContactRead(message.id, true);
  }

  async function deleteContactMessage(messageId: string) {
    if (!window.confirm("Delete this contact message permanently?")) return;
    const response = await fetch("/api/admin/contact-messages", {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId }),
    });
    if (response.ok) {
      setMessages(current => current.filter(message => message.id !== messageId));
      if (expandedMsg === messageId) setExpandedMsg(null);
    }
  }

  async function activate(userId: string, plan: string) {
    setLoading(userId); setActionNotice("");
    try {
      const res=await fetch("/api/admin/activate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,plan})});
      if(!res.ok)throw new Error("Plan update failed");
      const json=await res.json();
      setUsers(current=>current.map(user=>user.id===userId?{...user,plan,planExpiresAt:json.planExpiresAt??null}:user));
      setActionNotice("Customer plan updated.");
    } catch {setActionNotice("The plan could not be updated. No successful change has been confirmed; try again.");}
    finally {setLoading(null);}
  }

  async function revoke(userId: string) {
    setLoading(userId); setActionNotice("");
    try {
      const res=await fetch("/api/admin/activate",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId})});
      if(!res.ok)throw new Error("Revoke failed");
      setUsers(current=>current.map(user=>user.id===userId?{...user,plan:"free",planExpiresAt:null}:user));
      setConfirmRevoke(null);setActionNotice("Customer access returned to the Free plan.");
    } catch {setActionNotice("Access could not be changed. The customer record has not been updated here; try again.");}
    finally {setLoading(null);}
  }

  function exportCSV() {
    const headers = ["Name", "Email", "Plan", "Joined", "Expires", "Total Paid"];
    const rows = filtered.map(u => [
      u.name ?? "",
      u.email,
      u.plan,
      new Date(u.createdAt).toLocaleDateString("en-GB"),
      u.planExpiresAt ? new Date(u.planExpiresAt).toLocaleDateString("en-GB") : "",
      u.payments.filter(isReceivedPayment).reduce((s, p) => s + p.amount, 0).toFixed(2),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `wazap-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  return (
    <div className="space-y-6">
      <div className="wp-admin-heading"><div><p className="wp-eyebrow">WAZAP CONTROL CENTRE</p><h1>Administration</h1><p>Keep customers, support and platform health in focus.</p></div><div className="flex gap-2 flex-wrap"><a href="/admin/crm" className="wp-primary">Open lead CRM</a><a href="/admin/marketplace" className="wp-crm-secondary">Marketplace</a></div></div>
      <div className="wp-admin-tabs" role="group" aria-label="Admin sections">{[["overview","Overview"],["users","Customers"],["support","Support"],["system","Platform health"]].map(([id,label])=><button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}{id==="support"&&unreadChats>0?` · ${unreadChats} unread`:""}</button>)}</div>
      <div className="wp-admin-context"><span>{section==="overview"?"Business performance · verified activity and acquisition":section==="users"?"Customer accounts · plans, history and access":section==="support"?"Support workspace · replies stay in each visitor's own conversation":"Platform health · recovery readiness and email delivery"}</span><button onClick={()=>setSection(section==="support"?"overview":"support")}>{section==="support"?"View overview":`Open support${unreadChats?` (${unreadChats} unread)`:""}`}</button></div>
      <div hidden={section!=="overview"} className="space-y-6">

      <section className="rounded-2xl border border-[#25D366]/30 bg-[#25D366]/5 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-[#25D366]">North star · Asia/Dubai</p>
            <h2 className="mt-1 text-xl font-bold text-white">Verified customer conversation activity</h2>
          </div>
          <p className="text-xs text-slate-500">Current day since {new Date(data.system.northStar.dayStartedAt).toLocaleString()}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            ["Inbox-active businesses today", data.system.northStar.inboxBusinessesToday],
            ["New inbox threads", data.system.northStar.newInboxConversationsToday],
            ["Tracked link opens today", data.system.northStar.trackedLinkStartsToday],
            ["Inbox-active businesses · 7d", data.system.northStar.inboxBusinesses7d],
            ["Inbox-active businesses · 30d", data.system.northStar.inboxBusinesses30d],
          ].map(([label, value]) => (
            <article key={label} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <MessageCircle className="h-4 w-4 text-[#25D366]" />
              <p className="mt-2 text-2xl font-bold text-white">{value}</p>
              <p className="mt-1 text-xs text-slate-400">{label}</p>
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {data.system.northStar.retainedBusinesses7dRate === null
            ? "Weekly retention will appear after businesses are active in two consecutive seven-day windows."
            : `${data.system.northStar.retainedBusinesses7d} business${data.system.northStar.retainedBusinesses7d === 1 ? "" : "es"} returned week over week (${data.system.northStar.retainedBusinesses7dRate}%).`}
        </p>
        <p className="mt-2 text-xs text-slate-500">Tracked link opens are redirects into WhatsApp; they are reported separately and are not counted as inbox conversations. {data.system.northStar.trackedLinkBusinesses7d} businesses used tracked links in the last 7 days.</p>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Users", value: data.stats.totalUsers, icon: <Users className="h-5 w-5" />, color: "text-slate-300" },
          { label: "Active trials", value: data.stats.activeTrials, icon: <Crown className="h-5 w-5" />, color: "text-[#25D366]" },
          { label: "Conversion", value: `${data.stats.conversionPct}%`, icon: <TrendingUp className="h-5 w-5" />, color: "text-blue-400" },
          { label: "Revenue", value: `$${data.stats.totalRevenue}`, icon: <DollarSign className="h-5 w-5" />, color: "text-yellow-400" },
          { label: "MRR", value: `$${data.stats.mrr}`, icon: <TrendingUp className="h-5 w-5" />, color: "text-[#25D366]" },
          { label: "Expiring ≤7d", value: data.stats.expiringSoon, icon: <AlertTriangle className="h-5 w-5" />, color: data.stats.expiringSoon > 0 ? "text-amber-400" : "text-slate-600" },
          { label: "Churned", value: data.stats.churned, icon: <Users className="h-5 w-5" />, color: data.stats.churned > 0 ? "text-red-400" : "text-slate-600" },
          { label: "Emails queued", value: data.stats.queuedEmails, icon: <Mail className="h-5 w-5" />, color: data.stats.queuedEmails > 0 ? "text-amber-400" : "text-slate-600" },
          { label: "Email delivery pending", value: data.stats.emailAwaitingDelivery, icon: <Mail className="h-5 w-5" />, color: data.stats.emailAwaitingDelivery > 0 ? "text-blue-400" : "text-slate-600" },
          { label: "Customer email failures (30d)", value: data.stats.emailFailures, icon: <Mail className="h-5 w-5" />, color: data.stats.emailFailures > 0 ? "text-red-400" : "text-slate-600" },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-slate-800 bg-[#111811] p-4">
            <div className={`mb-2 ${s.color}`}>{s.icon}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-white">Revenue funnel</h2>
            <p className="mt-0.5 text-xs text-slate-500">Distinct non-admin customers from server-verified events in the last 30 days; anonymous pricing views are counted as events.</p>
          </div>
          <span className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-400">30 days</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[
            ["pricing_view", "Pricing views"],
            ["signup_completed", "Signups"],
            ["trial_started", "Trials started"],
            ["trial_activated", "Trials activated"],
            ["checkout_started", "Checkout starts"],
            ["subscription_activated", "Subscriptions"],
          ].map(([name, label]) => {
            const value = data.funnel?.find(metric => metric.name === name)?.count ?? 0;
            return (
              <div key={name} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="mt-1 text-xs text-slate-500">{label}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          ["Top visitor countries", data.traffic?.countries ?? []],
          ["Top acquisition sources", data.traffic?.sources ?? []],
        ].map(([title, metrics]) => (
          <div key={title as string} className="rounded-2xl border border-slate-800 bg-[#111811] p-5">
            <h2 className="font-semibold text-white">{title as string}</h2>
            <p className="mt-0.5 text-xs text-slate-500">Clean acquisition sessions since Aug 2 · staff and bots excluded</p>
            <div className="mt-4 space-y-2">
              {(metrics as TrafficMetric[]).length === 0 ? <p className="text-sm text-slate-600">Collecting new visit data</p> : (metrics as TrafficMetric[]).map(metric => (
                <div key={metric.label} className="flex items-center justify-between rounded-lg bg-slate-950/50 px-3 py-2 text-sm">
                  <span className="text-slate-300">{metric.label}</span><span className="font-semibold text-white">{metric.count}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-purple-500/25 bg-purple-500/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-white">Yahoo visitor activity</h2>
            <p className="mt-0.5 text-xs text-slate-500">Privacy-safe first-party visits attributed from Yahoo search and referral pages.</p>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full border border-purple-400/25 px-3 py-1 text-purple-200">7d: {data.traffic?.yahoo?.visits7d ?? 0}</span>
            <span className="rounded-full border border-purple-400/25 px-3 py-1 text-purple-200">30d: {data.traffic?.yahoo?.visits30d ?? 0}</span>
            <span className="rounded-full border border-purple-400/25 px-3 py-1 text-purple-200">Signed-in: {data.traffic?.yahoo?.knownUserVisits ?? 0}</span>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(data.traffic?.yahoo?.paths?.length ?? 0) === 0 ? (
            <p className="text-sm text-slate-500">No Yahoo visits recorded yet. The panel will populate automatically after searchers click a Yahoo result.</p>
          ) : data.traffic!.yahoo!.paths.map(metric => (
            <div key={metric.label} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-sm">
              <span className="truncate text-slate-300">{metric.label}</span>
              <span className="ml-3 font-semibold text-white">{metric.count}</span>
            </div>
          ))}
        </div>
      </div>

      </div>
      <div hidden={section!=="system"} className="space-y-6">      <section className={`rounded-2xl border p-5 ${data.system.backupRestore.status === "healthy" ? "border-[#25D366]/30 bg-[#25D366]/5" : "border-red-500/30 bg-red-500/5"}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            {data.system.backupRestore.status === "healthy"
              ? <CheckCircle2 className="mt-0.5 h-6 w-6 text-[#25D366]" />
              : <DatabaseBackup className="mt-0.5 h-6 w-6 text-red-300" />}
            <div>
              <h2 className="font-semibold text-white">Database recovery readiness</h2>
              <p className="mt-1 text-sm text-slate-400">
                {data.system.backupRestore.status === "healthy"
                  ? `Latest backup restored and validated in ${data.system.backupRestore.durationSeconds ?? "—"}s.`
                  : data.system.backupRestore.reason || `Restore verification is ${data.system.backupRestore.status}.`}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p className="font-semibold uppercase tracking-wider">{data.system.backupRestore.status}</p>
            <p className="mt-1">{data.system.backupRestore.verifiedAt ? new Date(data.system.backupRestore.verifiedAt).toLocaleString() : "Never verified"}</p>
            {data.system.backupRestore.backup && <p className="mt-1">{data.system.backupRestore.backup}</p>}
          </div>
        </div>
      </section>

<div className="grid gap-4 sm:grid-cols-3">{[["Queued emails",data.stats.queuedEmails],["Awaiting delivery",data.stats.emailAwaitingDelivery],["Delivery failures · 30d",data.stats.emailFailures]].map(([label,value])=><div key={label} className="rounded-2xl border border-green-900 bg-[#101810] p-5"><p className="text-xs text-slate-400">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p></div>)}</div><p className="text-xs text-slate-400">Delivery pending is not proof of receipt. Use the verified provider and webhook records when investigating an email.</p></div>
      <div hidden={section!=="support"} className="space-y-6">
      {supportNotice&&<p role="status" className="wp-admin-context">{supportNotice}</p>}
      <div className="wp-admin-tabs" role="group" aria-label="Support filters">{[["all","All conversations"],["open","Open requests"],["unread","Unread"],["ai","Automated"],["closed","Closed"]].map(([value,label])=><button key={value} aria-pressed={supportFilter===value} onClick={()=>setSupportFilter(value)}>{label}</button>)}</div>
      {/* Live Support Inbox */}
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#111811]">
        <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            Live Support Inbox
            {unreadChats > 0 && (
              <span className="rounded-full bg-[#25D366]/20 border border-[#25D366]/30 px-2 py-0.5 text-xs text-[#25D366]">
                {unreadChats} unread
              </span>
            )}
          </h2>
          <button onClick={() => refreshSupport()} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors">
            <RefreshCw className={`h-4 w-4 ${chatLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {visibleConversations.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500">No conversations match this view. Choose another filter to see other requests.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] min-h-[460px]">
            <div className="border-b lg:border-b-0 lg:border-r border-slate-800 divide-y divide-slate-800/60 max-h-[520px] overflow-y-auto">
              {visibleConversations.map(c => (
                <button key={c.id} onClick={() => { setSelectedChat(c.id); markChat(c.id); }}
                  className={`w-full text-left px-4 py-3 transition-colors ${activeChat?.id === c.id ? "bg-[#25D366]/10" : "hover:bg-slate-800/30"}`}>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-white truncate">{c.name || "Website visitor"}</p>
                    {c.unread > 0 && <span className="w-2 h-2 rounded-full bg-[#25D366] shrink-0" />}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">{c.email || "No email yet"}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${c.intent === "purchase" ? "bg-amber-400/15 text-amber-300" : c.intent === "support" ? "bg-red-400/15 text-red-300" : "bg-slate-700/40 text-slate-400"}`}>{c.intent}</span>
                    {c.intent === "purchase" && <span className="text-[10px] text-amber-300">Buyer signal · {c.leadScore}/100</span>}
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-2">{c.messages.at(-1)?.body || c.subject}</p>
                  <p className="text-[11px] text-slate-600 mt-1">{new Date(c.lastMessageAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                </button>
              ))}
            </div>

            {activeChat && (
              <div className="flex flex-col min-h-[460px]">
                <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{activeChat.name || "Website visitor"}</p>
                    <p className="text-xs text-slate-500 truncate">{activeChat.email || "Email not provided"} · {activeChat.phone || "Phone not provided"} · {activeChat.status} · {activeChat.intent} ({activeChat.leadScore}/100)</p>
                  </div>
                  {activeChat.crmLeadId&&<a href={`/admin/crm?lead=${activeChat.crmLeadId}`} className="text-xs text-[#25D366] shrink-0">CRM record</a>}
                  <button onClick={() => markChat(activeChat.id, activeChat.status === "closed" ? "open" : "closed")}
                    className="rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-white transition-colors">
                    {activeChat.status === "closed" ? "Reopen" : "Close"}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 max-h-[360px]">
                  {activeChat.messages.map(m => (
                    <div key={m.id} className={`flex ${m.sender === "admin" ? "justify-end" : "justify-start"}`}>
                      <div className={`rounded-2xl px-3 py-2.5 text-sm max-w-[80%] leading-relaxed whitespace-pre-wrap ${
                        m.sender === "admin"
                          ? "bg-[#25D366] text-black rounded-br-sm"
                          : m.sender === "bot"
                            ? "bg-blue-500/10 border border-blue-400/20 text-slate-200 rounded-bl-sm"
                            : "bg-slate-900 border border-slate-800 text-slate-200 rounded-bl-sm"
                      }`}>
                        {m.sender === "bot" && <div className="mb-1 text-[10px] font-semibold uppercase text-blue-300">Wazap AI</div>}
                        {m.body}
                        <div className={`mt-1 text-[10px] ${m.sender === "admin" ? "text-black/60" : "text-slate-600"}`}>
                          {new Date(m.createdAt).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <form onSubmit={replySupport} className="border-t border-slate-800 p-3 flex items-end gap-2">
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                    aria-label="Reply to selected support conversation" maxLength={4000} placeholder="Reply in the customer's same chat thread..."
                    rows={3}
                    className="flex-1 rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] resize-none" />
                  <button type="submit" disabled={!replyText.trim() || chatLoading}
                    className="h-10 w-10 rounded-xl bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-40 flex items-center justify-center transition-colors shrink-0">
                    {chatLoading ? <Loader2 className="h-4 w-4 text-black animate-spin" /> : <Send className="h-4 w-4 text-black" />}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>

      </div>
      <div hidden={section!=="users"} className="space-y-6">
      {actionNotice&&<p role="status" className="wp-admin-context">{actionNotice}</p>}
      {/* Users table */}
      <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-800 bg-[#111811]">
        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">
            Users <span className="text-slate-500 font-normal text-sm">({filtered.length})</span>
          </h2>
          <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
            <div className="relative flex-1 sm:w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input type="text" aria-label="Search customers" placeholder="Search name or email..." value={search} onChange={e => {setSearch(e.target.value);setUserPage(1);}}
                className="w-full rounded-xl bg-slate-900 border border-slate-700 pl-9 pr-4 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366]" />
            </div>
            <select aria-label="Filter customers by plan" value={planFilter} onChange={e => {setPlanFilter(e.target.value);setUserPage(1);}}
              className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-[#25D366]">
              <option value="all">All Plans</option>
              <option value="free">Free</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="ultimate">Ultimate</option>
              <option value="business">Business</option>
            </select>
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-sm text-slate-300 transition-colors">
              <Download className="h-4 w-4" /> CSV
            </button>
          </div>
        </div>

        <div className="w-full min-w-0 max-w-full overflow-x-auto">
          <table className="w-full min-w-[1040px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[18%]" />
              <col className="w-[16%]" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-800/50 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">Revenue</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-slate-500">No users found</td>
                </tr>
              )}
              {pageUsers.map(u => {
                const totalPaid = u.payments.filter(isReceivedPayment).reduce((s, p) => s + p.amount, 0);
                return (
                  <Fragment key={u.id}>
                    <tr className="align-middle transition-colors hover:bg-slate-800/20">
                      <td className="px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#25D366]/20 bg-[#25D366]/10 text-sm font-bold text-[#25D366]">
                            {(u.name ?? u.email)[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-white">{u.name ?? "—"}</div>
                            <div className="truncate text-xs text-slate-500">{u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${PLAN_BG[u.plan]} ${PLAN_COLORS[u.plan]}`}>
                            {u.plan !== "free" && <Crown className="h-3 w-3" />}
                            {u.plan}
                          </span>
                          {u.planExpiresAt && (
                            <div className="text-xs font-medium text-slate-400">
                              {planDaysLeft(u.planExpiresAt)} day{planDaysLeft(u.planExpiresAt) !== 1 ? "s" : ""} left
                            </div>
                          )}
                          {u.planExpiresAt && (
                            <div className="text-[11px] text-slate-600">
                              Expires {new Date(u.planExpiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-[#25D366]">
                        {totalPaid > 0 ? `$${totalPaid.toFixed(2)}` : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {new Date(u.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {confirmRevoke === u.id ? (
                            <div className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-3 py-1.5">
                              <span className="text-xs text-red-300">Revoke?</span>
                              <button onClick={() => revoke(u.id)} className="text-xs font-bold text-red-400 hover:text-red-300">Yes</button>
                              <button onClick={() => setConfirmRevoke(null)} className="text-xs text-slate-500 hover:text-white">No</button>
                            </div>
                          ) : u.plan === "free" ? (
                            <select
                              onChange={e => e.target.value && activate(u.id, e.target.value)}
                              defaultValue=""
                              className="w-36 rounded-xl border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-white focus:border-[#25D366] focus:outline-none"
                              disabled={loading === u.id}
                            >
                              <option value="">Activate...</option>
                              <option value="basic">Basic monthly</option>
                              <option value="pro">Pro monthly</option>
                              <option value="ultimate">Ultimate monthly</option>
                              <option value="business">Business monthly</option>
                            </select>
                          ) : (
                            <button onClick={() => setConfirmRevoke(u.id)} disabled={loading === u.id}
                              className="inline-flex items-center gap-1 rounded-full border border-red-500/30 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50">
                              {loading === u.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                              Revoke
                            </button>
                          )}
                          <button onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                            className="rounded-lg p-1 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300"
                            aria-label={expanded === u.id ? "Hide payment history" : "Show payment history"}>
                            {expanded === u.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expanded === u.id && (
                      <tr className="border-t border-slate-800 bg-slate-900/30">
                        <td colSpan={6} className="px-5 py-4">
                          <p className="mb-3 text-xs uppercase tracking-wider text-slate-500">Payment History</p>
                          {u.payments.length === 0 ? (
                            <p className="text-xs italic text-slate-600">No payments recorded</p>
                          ) : (
                            <div className="space-y-2">
                              {u.payments.map(p => (
                                <div key={p.id} className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2.5 text-xs">
                                  <div className="min-w-0">
                                    <span className="font-medium capitalize text-white">{p.plan}</span>
                                    <span className="ml-2 uppercase text-slate-500">{p.method}</span>
                                    {p.txId && <span className="ml-2 font-mono text-slate-600">{p.txId.slice(0, 16)}...</span>}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-3">
                                    <span className="font-bold text-[#25D366]">{p.method === "paypal" && p.txId?.startsWith("I-") ? "Subscription record · not revenue" : `$${p.amount.toFixed(2)}`}</span>
                                    <span className={`rounded-full px-2 py-0.5 ${p.status === "active" ? "bg-[#25D366]/20 text-[#25D366]" : "bg-amber-500/20 text-amber-400"}`}>
                                      {p.status}
                                    </span>
                                    <span className="text-slate-600">{new Date(p.createdAt).toLocaleDateString("en-GB")}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {filtered.length===0&&<div role="status" className="wp-admin-context">No customers match these filters. <button onClick={()=>{setSearch("");setPlanFilter("all");setUserPage(1);}}>Clear filters</button></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400"><span>{filtered.length?`${(currentPage-1)*20+1}–${Math.min(currentPage*20,filtered.length)} of ${filtered.length} customers`:"0 customers"}</span><div className="flex gap-3 items-center"><button className="rounded-lg border border-green-900 px-3 py-2 disabled:opacity-40" disabled={currentPage===1} onClick={()=>setUserPage(currentPage-1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button className="rounded-lg border border-green-900 px-3 py-2 disabled:opacity-40" disabled={currentPage===pageCount} onClick={()=>setUserPage(currentPage+1)}>Next</button></div></div>
      </div>
      <div hidden={section!=="support"}>
      {/* Contact Messages */}
      {messages.length > 0 && (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-[#111811] p-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <span>✉️</span> Contact Messages ({messages.length})
            {messages.filter(m => !m.read).length > 0 && (
              <span className="rounded-full bg-[#25D366]/20 border border-[#25D366]/30 px-2 py-0.5 text-xs text-[#25D366]">
                {messages.filter(m => !m.read).length} unread
              </span>
            )}
          </h2>
          <div className="space-y-2">
            {messages.map(m => (
              <div key={m.id} className={`rounded-xl border px-4 py-3 ${m.read ? "border-slate-800 bg-slate-900/50" : "border-[#25D366]/20 bg-[#25D366]/5"}`}>
                <div className="flex items-center justify-between gap-4 cursor-pointer" onClick={() => openContactMessage(m)}>
                  <div className="flex items-center gap-3 min-w-0">
                    {!m.read && <span className="w-2 h-2 rounded-full bg-[#25D366] shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{m.name} <span className="text-slate-500 font-normal">· {m.email}</span></p>
                      <p className="text-xs text-slate-400 truncate">{m.subject}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <p className="text-xs text-slate-600">{new Date(m.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                    <button type="button" title={m.read ? "Mark unread" : "Mark read"} onClick={event => { event.stopPropagation(); setContactRead(m.id, !m.read); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-white">
                      {m.read ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}
                    </button>
                    <button type="button" title="Delete message" onClick={event => { event.stopPropagation(); deleteContactMessage(m.id); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {expandedMsg === m.id && (
                  <div className="mt-3 pt-3 border-t border-slate-800">
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{m.message}</p>
                    {m.adminReply && (
                      <div className="mt-4 rounded-xl border border-[#25D366]/20 bg-[#25D366]/5 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-[#25D366] mb-2">Reply shown in customer account</p>
                        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{m.adminReply}</p>
                        {m.repliedAt && <p className="text-[11px] text-slate-500 mt-2">Sent {new Date(m.repliedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                        {m.adminReplySeenAt ? (
                          <p className="text-[11px] text-[#25D366] mt-1">Seen by customer {new Date(m.adminReplySeenAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>
                        ) : (
                          <p className="text-[11px] text-yellow-300 mt-1">Not seen by customer yet</p>
                        )}
                      </div>
                    )}
                    <div className="mt-4 space-y-2">
                        <textarea
                        value={contactReplies[m.id] ?? ""}
                        onChange={e => setContactReplies(r => ({ ...r, [m.id]: e.target.value }))}
                        placeholder={`Reply inside ${m.email}'s Wazap dashboard...`}
                        rows={3}
                          className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#25D366] resize-none"
                        />
                        {contactNotices[m.id] && (
                          <p className={`text-xs ${contactNotices[m.id].startsWith("Reply could not") ? "text-red-400" : "text-[#25D366]"}`}>
                            {contactNotices[m.id]}
                          </p>
                        )}
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-xs text-slate-500">This saves the answer in the customer account dashboard.</p>
                        <button
                          type="button"
                          onClick={() => replyContactMessage(m.id)}
                          disabled={loading === m.id || !contactReplies[m.id]?.trim()}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366] hover:bg-[#1fba58] disabled:opacity-40 px-4 py-2 text-xs font-bold text-black transition-colors"
                        >
                          {loading === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Send in account
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
