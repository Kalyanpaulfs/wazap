"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Code2,
  Copy,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  Webhook,
} from "lucide-react";
import PlanPausedBadge from "@/app/components/PlanPausedBadge";
type Key = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: string;
  planPausedAt?: string | null;
  lastUsedAt: string | null;
  expiresAt: string;
};
type Log = {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  createdAt: string;
};
type Endpoint = {
  id: string;
  url: string;
  events: string[];
  status: string;
  planPausedAt?: string | null;
  secretPrefix: string;
  failureCount: number;
  lastDeliveredAt: string | null;
  deliveries: {
    id: string;
    eventType: string;
    status: string;
    attempts: number;
    responseStatus: number | null;
    lastError: string | null;
  }[];
};
type Reliability={window:{days:number;measuredAt:string};objectives:{apiAvailabilityPct:number;apiP95LatencyMs:number;webhookTerminalSuccessPct:number;webhookWithin15MinutesPct:number};metrics:{apiRequestCount:number;apiAvailabilityPct:number|null;apiP95LatencyMs:number|null;webhookDeliveryCount:number;webhookTerminalSuccessPct:number|null;webhookWithin15MinutesPct:number|null};evidence:{api:string;webhooks:string}};
export default function DeveloperClient() {
  const [keys, setKeys] = useState<Key[]>([]),
    [logs, setLogs] = useState<Log[]>([]),
    [endpoints, setEndpoints] = useState<Endpoint[]>([]),
    [scopes, setScopes] = useState<string[]>([]),
    [events, setEvents] = useState<string[]>([]),
    [reliability,setReliability]=useState<Reliability|null>(null),
    [limit, setLimit] = useState(0),
    [error, setError] = useState(""),
    [revealed, setRevealed] = useState<{ label: string; value: string } | null>(
      null,
    ),
    [loading, setLoading] = useState(true);
  const [name, setName] = useState("Production integration"),
    [url, setUrl] = useState(""),
    [showKey, setShowKey] = useState(false),
    [showWebhook, setShowWebhook] = useState(false);
  const load = useCallback(async () => {
    const [a, w, r] = await Promise.all([
      fetch("/api/developer/keys", { cache: "no-store" }),
      fetch("/api/developer/webhooks", { cache: "no-store" }),
      fetch("/api/developer/reliability", { cache: "no-store" }),
    ]);
    if (a.status === 401) {
      location.href = "/login?redirect=/developers";
      return;
    }
    const ad = await a.json(),
      wd = await w.json(),rd=await r.json();
    setKeys(ad.keys ?? []);
    setLogs(ad.requestLogs ?? []);
    setScopes(ad.availableScopes ?? []);
    setLimit(ad.limit ?? 0);
    setEndpoints(wd.endpoints ?? []);
    setEvents(wd.availableEvents ?? []);
    if(r.ok)setReliability(rd);
    setLoading(false);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function mutate(path: string, method: string, body: object) {
    setError("");
    const r = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "That change could not be saved.");
      return null;
    }
    await load();
    return d;
  }
  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    const d = await mutate("/api/developer/keys", "POST", {
      name,
      scopes,
      expiresInDays: 90,
    });
    if (d) {
      setRevealed({ label: "API key", value: d.secret });
      setShowKey(false);
    }
  }
  async function createHook(e: React.FormEvent) {
    e.preventDefault();
    const d = await mutate("/api/developer/webhooks", "POST", {
      url,
      events,
      description: "Production webhook",
    });
    if (d) {
      setRevealed({ label: "Webhook signing secret", value: d.secret });
      setUrl("");
      setShowWebhook(false);
    }
  }
  if (loading)
    return (
      <div className="min-h-[70vh] px-4 py-20 text-center text-muted">
        Loading developer platform…
      </div>
    );
  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-accent">
              Wazap Platform
            </p>
            <h1 className="mt-2 text-3xl font-bold text-text">
              Build on business conversations
            </h1>
            <p className="mt-2 text-muted">
              Versioned APIs, least-privilege keys, signed events, and
              observable delivery.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="rounded-full border border-border-strong px-4 py-2 text-sm text-text"
          >
            Open dashboard
          </Link>
        </header>
        {revealed && (
          <div className="mt-6 rounded-2xl border border-warning/30 bg-highlight-soft p-5">
            <p className="font-bold text-warning">
              Copy your {revealed.label} now
            </p>
            <p className="mt-1 text-xs text-muted">
              It will not be displayed again.
            </p>
            <div className="mt-3 flex gap-2">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-bg/40 p-3 text-xs text-text">
                {revealed.value}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(revealed.value)}
                className="rounded-lg bg-highlight px-3 text-ink"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <button
              onClick={() => setRevealed(null)}
              className="mt-3 text-xs text-muted"
            >
              I saved it
            </button>
          </div>
        )}
        {error && (
          <p className="mt-4 rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-text">
                <KeyRound className="text-accent" />
                API keys
              </h2>
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-sm text-accent"
              >
                <Plus className="mr-1 inline h-4 w-4" />
                Create
              </button>
            </div>
            <p className="mt-1 text-xs text-muted">
              {keys.filter((k) => k.status === "active").length}/{limit} active
            </p>
            {showKey && (
              <form
                onSubmit={createKey}
                className="mt-4 rounded-xl bg-bg/50 p-3"
              >
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    "conversations:read",
                    "conversations:write",
                    "messages:write",
                    "leads:read",
                    "leads:write",
                    "tasks:read",
                    "tasks:write",
                    "automations:read",
                    "automations:write",
                    "agents:read",
                    "agents:write",
                    "channels:read",
                    "channels:write",
                    "whatsapp:read",
                    "whatsapp:write",
                    "analytics:read",
                    "operations:read",
                    "partners:read",
                    "audit:read",
                  ].map((scope) => (
                    <label key={scope} className="text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={scopes.includes(scope)}
                        onChange={(e) =>
                          setScopes(
                            e.target.checked
                              ? [...scopes, scope]
                              : scopes.filter((x) => x !== scope),
                          )
                        }
                        className="mr-1"
                      />
                      {scope}
                    </label>
                  ))}
                </div>
                <button className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-on-accent">
                  Generate once
                </button>
              </form>
            )}
            <div className="mt-4 space-y-2">
              {keys.map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-xl border border-border p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text">
                        {key.name}
                      </p>
                      {key.planPausedAt && <PlanPausedBadge />}
                    </div>
                    <p className="text-xs text-muted">
                      {key.prefix}… · {key.status}
                    </p>
                  </div>
                  {key.status === "active" && (
                    <button
                      onClick={() =>
                        mutate("/api/developer/keys", "DELETE", { id: key.id })
                      }
                      className="text-muted hover:text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-bold text-text">
                <Webhook className="text-accent" />
                Webhooks
              </h2>
              <button
                onClick={() => {
                  setShowWebhook(!showWebhook);
                  setEvents([
                    "conversation.created",
                    "conversation.updated",
                    "message.recorded",
                    "lead.created",
                  ]);
                }}
                className="text-sm text-accent"
              >
                <Plus className="mr-1 inline h-4 w-4" />
                Add
              </button>
            </div>
            {showWebhook && (
              <form
                onSubmit={createHook}
                className="mt-4 rounded-xl bg-bg/50 p-3"
              >
                <input
                  required
                  type="url"
                  placeholder="https://example.com/wazap-webhook"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full rounded-lg border border-border-strong bg-bg px-3 py-2 text-sm text-text"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {[
                    "conversation.created",
                    "conversation.updated",
                    "message.recorded",
                    "lead.created",
                    "lead.updated",
                    "task.created",
                    "task.updated",
                    "task.archived",
                    "automation.created",
                    "automation.updated",
                    "automation.archived",
                    "agent.created",
                    "agent.updated",
                    "agent.archived",
                    "channel.created",
                    "channel.rotated",
                    "channel.paused",
                    "channel.resumed",
                    "channel.disabled",
                    "channel.verified",
                    "channel.message_received",
                    "whatsapp.consent_updated",
                    "whatsapp.campaign_created",
                    "whatsapp.campaign_scheduled",
                    "whatsapp.campaign_cancelled",
                    "partner.trial_attributed",
                    "partner.customer_converted",
                    "handoff.created",
                  ].map((event) => (
                    <label key={event} className="text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={events.includes(event)}
                        onChange={(e) =>
                          setEvents(
                            e.target.checked
                              ? [...events, event]
                              : events.filter((x) => x !== event),
                          )
                        }
                        className="mr-1"
                      />
                      {event}
                    </label>
                  ))}
                </div>
                <button className="mt-3 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-on-accent">
                  Create endpoint
                </button>
              </form>
            )}
            <div className="mt-4 space-y-3">
              {endpoints.map((endpoint) => (
                <div
                  key={endpoint.id}
                  className="rounded-xl border border-border p-3"
                >
                  <div className="flex justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-text">
                        {endpoint.url}
                      </p>
                      {endpoint.planPausedAt && <PlanPausedBadge />}
                    </div>
                    {endpoint.status === "active" && (
                      <button
                        onClick={() =>
                          mutate("/api/developer/webhooks", "DELETE", {
                            id: endpoint.id,
                          })
                        }
                        className="text-muted hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {endpoint.status} · failures {endpoint.failureCount} ·{" "}
                    {endpoint.events.length} events
                  </p>
                  {endpoint.deliveries.slice(0, 3).map((d) => (
                    <p key={d.id} className="mt-1 text-[10px] text-muted">
                      {d.eventType} · {d.status} · attempt {d.attempts}
                      {d.responseStatus ? ` · HTTP ${d.responseStatus}` : ""}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="mt-5 grid gap-5 lg:grid-cols-[1fr_.9fr]">
          <div className="rounded-3xl border border-border bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-bold text-text">
                <Code2 className="text-accent" />
                API v1 quick start
              </h2>
              <a
                href="/api/v1/openapi"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-accent"
              >
                OpenAPI 3.1 JSON →
              </a>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-xl bg-bg/40 p-4 text-xs text-muted">
              <code>{`curl https://wazap.lt/api/v1/conversations \\\n  -H "Authorization: Bearer $WAZAP_API_KEY"\n\n# Idempotent outbound reply through the conversation's verified transport:\ncurl -X POST https://wazap.lt/api/v1/conversations/$ID/messages \\\n  -H "Authorization: Bearer $WAZAP_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: order-123-reply-1" \\\n  -d '{"text":"Thanks — we are checking that now."}'\n\n# Webhook signature verification input:\nHMAC_SHA256(secret, timestamp + "." + rawBody)\nHeader: x-wazap-signature: v1=<hex>`}</code>
            </pre>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
              <span className="rounded-full bg-surface px-3 py-1">
                120 requests/minute/key
              </span>
              <span className="rounded-full bg-surface px-3 py-1">
                Idempotent API writes
              </span>
              <span className="rounded-full bg-surface px-3 py-1">
                Recoverable lead/task/automation/agent archives
              </span>
              <span className="rounded-full bg-surface px-3 py-1">
                Provider delivery states
              </span>
              <span className="rounded-full bg-surface px-3 py-1">
                Cursor pagination
              </span>
              <span className="rounded-full bg-surface px-3 py-1">
                HTTPS only
              </span>
            </div>
          </div>
          <div className="rounded-3xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-bold text-text">
              <Activity className="text-accent" />
              Recent API requests
            </h2>
            <div className="mt-3 space-y-2">
              {logs.length ? (
                logs.slice(0, 10).map((log) => (
                  <div
                    key={log.requestId}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="truncate text-muted">
                      {log.method} {log.path}
                    </span>
                    <span
                      className={
                        log.statusCode < 400 ? "text-accent" : "text-danger"
                      }
                    >
                      {log.statusCode} · {log.latencyMs}ms
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">
                  Requests will appear here without bearer tokens or payloads.
                </p>
              )}
            </div>
          </div>
        </section>
        {reliability&&<section className="mt-5 rounded-3xl border border-border bg-surface p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-text">30-day reliability evidence</h2><p className="mt-1 text-xs text-muted">API evidence: {reliability.evidence.api} · webhook evidence: {reliability.evidence.webhooks}</p></div><Link href="/api-policy" className="text-xs font-semibold text-accent">Compatibility and SLO policy →</Link></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["API availability",reliability.metrics.apiAvailabilityPct===null?"No data":`${reliability.metrics.apiAvailabilityPct}%`,`${reliability.objectives.apiAvailabilityPct}% objective`],["API p95 latency",reliability.metrics.apiP95LatencyMs===null?"No data":`${reliability.metrics.apiP95LatencyMs}ms`,`${reliability.objectives.apiP95LatencyMs}ms objective`],["Webhook success",reliability.metrics.webhookTerminalSuccessPct===null?"No data":`${reliability.metrics.webhookTerminalSuccessPct}%`,`${reliability.objectives.webhookTerminalSuccessPct}% objective`],["Delivered ≤15 min",reliability.metrics.webhookWithin15MinutesPct===null?"No data":`${reliability.metrics.webhookWithin15MinutesPct}%`,`${reliability.objectives.webhookWithin15MinutesPct}% objective`]].map(([label,value,target])=><div key={label} className="rounded-xl bg-bg p-3"><p className="text-xs text-muted">{label}</p><p className="mt-1 text-xl font-bold text-text">{value}</p><p className="text-[10px] text-muted">{target}</p></div>)}</div></section>}
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-accent/20 bg-accent-soft p-4">
          <ShieldCheck className="shrink-0 text-accent" />
          <p className="text-sm text-muted">
            Keys are hashed, webhook secrets are encrypted, private-network
            destinations are blocked, and outbound records are never labelled
            delivered without provider confirmation.
          </p>
        </div>
      </div>
    </main>
  );
}
