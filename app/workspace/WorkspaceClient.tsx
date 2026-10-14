"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import EmailCodeConfirm from "@/app/components/EmailCodeConfirm";
import PlanPausedBadge from "@/app/components/PlanPausedBadge";
import { History, KeyRound, MailPlus, ShieldCheck, Trash2, Users } from "lucide-react";

type Member = { id: string; userId: string; name: string | null; email: string; role: string; joinedAt: string; planPausedAt?: string | null };
type Invitation = { id: string; email: string; role: string; expiresAt: string; deliveryStatus?: string };
type Workspace = { id: string; name: string; role: string; members: Member[]; invitations: Invitation[] };
type Activity = {
  id: string;
  eventType: string;
  actor: { id: string; name: string | null; email: string | null } | null;
  target: { id: string; name: string | null; email: string | null } | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
const activityLabels: Record<string, string> = {
  ownership_transferred: "Workspace ownership transferred",
  member_role_changed: "Member role changed",
  member_removed: "Member removed",
  invitation_created: "Invitation created",
  invitation_cancelled: "Invitation cancelled",
  invitation_accepted: "Invitation accepted",
  api_key_created: "API key created",
  api_key_revoked: "API key revoked",
  webhook_created: "Webhook created",
  webhook_disabled: "Webhook disabled",
  channel_created: "Channel connected",
  channel_credential_rotated: "Channel credential rotated",
  channel_paused: "Channel paused",
  channel_resumed: "Channel resumed",
  channel_disabled: "Channel disabled",
  agent_created: "AI agent created",
  agent_updated: "AI agent updated",
  agent_archived: "AI agent archived",
};

export default function WorkspaceClient() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [transferMemberId, setTransferMemberId] = useState("");
  const [transferCode, setTransferCode] = useState("");
  const [transferConfirmation, setTransferConfirmation] = useState("");
  const [transferNotice, setTransferNotice] = useState("");
  const [activities, setActivities] = useState<Activity[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    const response = await fetch("/api/workspaces", { cache: "no-store" });
    if (response.status === 401) { window.location.href = "/login?redirect=/workspace"; return; }
    const data = await response.json();
    const loadedWorkspaces: Workspace[] = data.workspaces ?? [];
    const selectedId = data.activeWorkspaceId ?? loadedWorkspaces[0]?.id ?? "";
    setWorkspaces(loadedWorkspaces); setActiveId(selectedId);
    const selected = loadedWorkspaces.find((workspace) => workspace.id === selectedId) ?? loadedWorkspaces[0];
    if (selected && ["owner", "admin"].includes(selected.role)) {
      const activityResponse = await fetch(`/api/workspaces/audit?workspaceId=${encodeURIComponent(selected.id)}`, { cache: "no-store" });
      const activityData = await activityResponse.json();
      setActivities(activityResponse.ok ? activityData.events ?? [] : []);
    } else setActivities([]);
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const active = workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];

  async function mutate(url: string, method: string, body: object) {
    setError("");
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "That change could not be saved."); return false; }
    await load(); return true;
  }
  async function invite(event: React.FormEvent) {
    event.preventDefault();
    if (await mutate("/api/workspaces/invitations", "POST", { workspaceId: active.id, email, role })) setEmail("");
  }
  async function transferOwnership(event: React.FormEvent) {
    event.preventDefault();
    setTransferNotice("");
    if (!window.confirm("Transfer this workspace and make yourself an admin? This changes billing entitlements immediately.")) return;
    const response = await fetch("/api/workspaces/ownership", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: active.id,
        targetMemberId: transferMemberId,
        emailCode: transferCode,
        confirmation: transferConfirmation,
      }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? "Ownership could not be transferred."); return; }
    setError("");
    setTransferCode("");
    setTransferConfirmation("");
    setTransferNotice(data.notice ?? "Workspace ownership transferred.");
    await load();
  }

  if (loading) return <div className="hero-bg min-h-[70vh] px-4 py-20 text-center text-slate-400">Loading workspace…</div>;
  if (!active) return <div className="hero-bg min-h-[70vh] px-4 py-20 text-center text-slate-400">No workspace is available.</div>;
  const canManage = ["owner", "admin"].includes(active.role);
  return <main className="hero-bg min-h-screen px-4 py-10">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#25D366]">Team workspace</p><h1 className="mt-2 text-3xl font-bold text-white">Work together in Wazap</h1><p className="mt-2 text-slate-400">Members share Flow leads, conversation attribution, follow-ups, and outcomes.</p></div>
        <Link href="/tools/follow-up" className="rounded-full bg-[#25D366] px-5 py-2.5 text-sm font-bold text-black">Open Wazap Flow</Link>
      </div>
      {workspaces.length > 1 && <div className="mt-7 rounded-2xl border border-slate-800 bg-[#111811] p-4"><label className="text-sm text-slate-300">Active workspace</label><select value={activeId} onChange={(event) => mutate("/api/workspaces", "PATCH", { workspaceId: event.target.value })} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-white">{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name} · {workspace.role}</option>)}</select></div>}
      {error && <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {transferNotice && <p className="mt-5 rounded-xl border border-[#25D366]/30 bg-[#25D366]/10 p-3 text-sm text-[#8ef0b2]">{transferNotice}</p>}
      <section className="mt-7 grid gap-5 lg:grid-cols-[1.35fr_.8fr]">
        <div className="rounded-3xl border border-slate-800 bg-[#111811] p-5 sm:p-7">
          <div className="flex items-center gap-3"><Users className="text-[#25D366]"/><div><h2 className="font-bold text-white">{active.name}</h2><p className="text-xs capitalize text-slate-500">Your role: {active.role}</p></div></div>
          <div className="mt-5 space-y-2">{active.members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3"><div><p className="text-sm font-semibold text-white">{member.name || member.email}</p><p className="text-xs text-slate-500">{member.email}</p></div><div className="flex items-center gap-2"><span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs capitalize text-slate-300">{member.role}</span>{member.planPausedAt && <PlanPausedBadge />}{canManage && member.role !== "owner" && <><select value={member.role} onChange={(event) => mutate("/api/workspaces/members", "PATCH", { id: member.id, role: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-xs text-white"><option value="member">Member</option>{active.role === "owner" && <option value="admin">Admin</option>}</select><button aria-label="Remove member" onClick={() => window.confirm(`Remove ${member.email}?`) && mutate("/api/workspaces/members", "DELETE", { id: member.id })} className="p-2 text-slate-500 hover:text-red-400"><Trash2 className="h-4 w-4"/></button></>}</div></div>)}</div>
          {canManage && active.invitations.length > 0 && <div className="mt-6"><h3 className="text-sm font-semibold text-white">Pending invitations</h3><div className="mt-2 space-y-2">{active.invitations.map((invitation) => <div key={invitation.id} className="flex items-center justify-between rounded-xl border border-slate-800 px-3 py-2 text-xs"><span className="text-slate-300">{invitation.email} · {invitation.deliveryStatus || "queued"}</span><button onClick={() => mutate("/api/workspaces/invitations", "DELETE", { id: invitation.id })} className="text-slate-500 hover:text-red-400">Cancel</button></div>)}</div></div>}
          {canManage && <div className="mt-7 border-t border-slate-800 pt-6"><div className="flex items-center gap-2"><History className="h-4 w-4 text-[#25D366]"/><h3 className="text-sm font-semibold text-white">Security activity</h3></div><p className="mt-1 text-xs text-slate-500">The latest privileged workspace changes. Message content and credentials are never included.</p>{activities.length ? <div className="mt-3 space-y-2">{activities.slice(0, 20).map((activity) => { const targetEmail = typeof activity.metadata?.targetEmail === "string" ? activity.metadata.targetEmail : null; const subject = activity.target?.name || activity.target?.email || targetEmail; return <div key={activity.id} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-200">{activityLabels[activity.eventType] || activity.eventType.replaceAll("_", " ")}</p><time className="text-[11px] text-slate-600">{new Date(activity.createdAt).toLocaleString()}</time></div><p className="mt-1 text-[11px] text-slate-500">{activity.actor?.name || activity.actor?.email || "System"}{subject ? ` · ${subject}` : ""}</p></div>; })}</div> : <p className="mt-3 text-xs text-slate-500">No security activity has been recorded yet.</p>}</div>}
        </div>
        <aside className="space-y-5">{canManage && <form onSubmit={invite} className="rounded-3xl border border-[#25D366]/20 bg-[#25D366]/5 p-5"><MailPlus className="text-[#25D366]"/><h2 className="mt-3 font-bold text-white">Invite a teammate</h2><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"/><select value={role} onChange={(event) => setRole(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"><option value="member">Member</option>{active.role === "owner" && <option value="admin">Admin</option>}</select><button className="mt-3 w-full rounded-xl bg-[#25D366] px-4 py-3 text-sm font-bold text-black">Send secure invitation</button></form>}
          {active.role === "owner" && active.members.length > 1 && <form onSubmit={transferOwnership} className="rounded-3xl border border-amber-500/25 bg-amber-500/5 p-5"><KeyRound className="text-amber-300"/><h2 className="mt-3 font-bold text-white">Transfer ownership</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Shared data and integrations stay with this workspace. Your role becomes Admin, and limits immediately follow the new owner’s plan.</p><label className="mt-4 block text-xs font-semibold text-slate-300">New owner</label><select required value={transferMemberId} onChange={(event) => setTransferMemberId(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"><option value="">Choose a member</option>{active.members.filter((member) => member.role !== "owner").map((member) => <option key={member.id} value={member.id}>{member.name || member.email} · {member.role}</option>)}</select><EmailCodeConfirm id="transfer-email-code" className="mt-3" value={transferCode} onChange={setTransferCode}/><label className="mt-3 block text-xs font-semibold text-slate-300">Type <span className="text-white">TRANSFER {active.name}</span></label><input required value={transferConfirmation} onChange={(event) => setTransferConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-white"/><button disabled={!transferMemberId || !transferCode || transferConfirmation !== `TRANSFER ${active.name}`} className="mt-3 w-full rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-40">Transfer workspace ownership</button></form>}
          <div className="rounded-3xl border border-slate-800 bg-[#111811] p-5"><ShieldCheck className="text-[#25D366]"/><h2 className="mt-3 font-bold text-white">Designed for accountable teams</h2><p className="mt-2 text-sm leading-relaxed text-slate-400">Invitations expire after seven days and can only be accepted by the invited email. Owners control roles and access.</p></div>
        </aside>
      </section>
    </div>
  </main>;
}
