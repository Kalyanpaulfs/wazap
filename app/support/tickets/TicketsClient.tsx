"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from "lucide-react";
import BackLink from "@/app/links/BackLink";

interface TicketSummary { id: string; number: string; topic: string; status: string; urgent: boolean; createdAt: string; updatedAt: string; solvedAt: string | null; canReopen: boolean; unread: number }

const TOPIC_LABELS: Record<string, string> = { payment: "Payment", link: "Link not working", account: "Account/login", other: "Other" };
const STATUS_LABELS: Record<string, string> = { open: "Open", investigating: "In progress", waiting: "Waiting for you", solved: "Solved", closed: "Closed" };
const OPEN_STATUSES = new Set(["open", "investigating", "waiting"]);

// Open/Investigating = amber (needs our attention or yours to start), Waiting
// for you = blue (the ball's in your court), Solved = green, Closed = slate.
function statusChipClass(status: string) {
  if (status === "solved") return "bg-accent/15 text-accent";
  if (status === "closed") return "bg-surface-2 text-muted";
  if (status === "waiting") return "bg-info/15 text-info";
  return "bg-warning/15 text-warning";
}
function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Opens a ticket, or just the widget, in the floating ChatWidget - see the
 * wazap:open-chat listener in app/components/ChatWidget.tsx. This page
 * itself only lists and filters; the widget keeps all the message/reply/
 * reopen behavior so it isn't duplicated here. */
function openInWidget(ticketId?: string) {
  window.dispatchEvent(ticketId ? new CustomEvent("wazap:open-chat", { detail: { ticketId } }) : new CustomEvent("wazap:open-chat", { detail: { newTicket: true } }));
}

export default function TicketsClient() {
  const [tab, setTab] = useState<"open" | "solved">("open");
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    let visitorId = "";
    try { visitorId = localStorage.getItem("wazap_support_visitor_id") || ""; } catch { /* storage unavailable */ }
    try {
      const response = await fetch(`/api/support/tickets${visitorId ? `?visitorId=${encodeURIComponent(visitorId)}` : ""}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not load your tickets.");
      setTickets(Array.isArray(json.tickets) ? json.tickets : []);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load your tickets."); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const openCount = tickets.filter(t => OPEN_STATUSES.has(t.status)).length;
  const solvedCount = tickets.length - openCount;
  const filtered = tickets.filter(t => (tab === "open" ? OPEN_STATUSES.has(t.status) : !OPEN_STATUSES.has(t.status)));

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-5">
          <BackLink href="/support" label="Help & support" />
        </div>

        <h1 className="text-2xl font-bold text-text">My tickets</h1>
        <p className="mt-1 text-sm text-muted">Everything you&apos;ve raised with support, in one place.</p>

        <div className="mt-6 inline-flex rounded-xl border border-border bg-surface p-1">
          {(["open", "solved"] as const).map(id => (
            <button key={id} type="button" onClick={() => setTab(id)} aria-pressed={tab === id} className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${tab === id ? "bg-accent text-on-accent" : "text-muted hover:text-text"}`}>
              {id === "open" ? `Open (${openCount})` : `Solved (${solvedCount})`}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="mt-4 text-sm text-warning">{error}</p>}
        {loading ? <p className="mt-6 text-sm text-muted">Loading…</p>
          : filtered.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-10 text-center">
              <p className="text-sm text-muted">{tab === "open" ? "No open tickets right now." : "No solved tickets yet."}</p>
              {tab === "open" && (
                <button type="button" onClick={() => openInWidget()} className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover">
                  <MessageCircle className="h-4 w-4" />Start a ticket
                </button>
              )}
            </div>
          ) : (
            <ul className="mt-6 space-y-2">
              {filtered.map(t => (
                <li key={t.id}>
                  <button type="button" onClick={() => openInWidget(t.id)} aria-label={`Open ticket #${t.number}${t.unread ? `, ${t.unread} unread` : ""}`} className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-accent/40">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-text">#{t.number}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusChipClass(t.status)}`}>{STATUS_LABELS[t.status] || t.status}</span>
                        {t.urgent && <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-medium text-danger">Urgent</span>}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted">{TOPIC_LABELS[t.topic] || t.topic} · Updated {formatDate(t.updatedAt)}</span>
                    </span>
                    {t.unread > 0 && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          )}

        {filtered.length > 0 && (
          <button type="button" onClick={() => openInWidget()} className="mt-8 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent transition-colors hover:bg-accent-hover">
            <MessageCircle className="h-4 w-4" />Start a new ticket
          </button>
        )}
      </div>
    </div>
  );
}
