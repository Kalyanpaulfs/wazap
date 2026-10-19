import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAdminCustomerDetails } from "@/lib/admin-customers-service";
import ChangePlanControl from "@/app/admin/crm/ChangePlanControl";
import CustomerPaymentsPanel from "@/app/admin/crm/CustomerPaymentsPanel";
import { ArrowLeft, ArrowUpRight, AlertTriangle, ExternalLink } from "lucide-react";

export const metadata = {
  title: "Customer Detail — Admin CRM — Wazap",
  robots: { index: false, follow: false },
};

export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) redirect("/login");

  const { id } = await params;
  if (!id) notFound();

  const customer = await getAdminCustomerDetails(id);
  if (!customer) notFound();

  const {
    profile,
    plan,
    planHistory,
    rotators,
    links,
    widget,
    leads,
    usageVsLimits,
    supportChats,
    accountStatus,
  } = customer;

  return (
    <main className="wp-growth max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-2 text-xs text-muted">
        <Link prefetch={false} href="/admin/crm/customers" className="hover:text-text flex items-center gap-1">
          <ArrowLeft size={14} /> Back to Customers
        </Link>
        <span>/</span>
        <span className="text-text">{profile.name || profile.email}</span>
      </div>

      <div className="wp-admin-heading">
        <div>
          <p className="wp-eyebrow">CUSTOMER PROFILE</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1>{profile.name || profile.email}</h1>
            {accountStatus.status === "active" && (
              <span className="wp-crm-pill">Active</span>
            )}
            {accountStatus.status === "closing" && (
              <span className="wp-crm-pill border-warning text-warning">
                {accountStatus.label}
              </span>
            )}
            {accountStatus.status === "deleted" && (
              <span className="wp-crm-pill border-danger text-danger">
                Deleted
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-1">{profile.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CustomerPaymentsPanel userId={profile.id} />
          <Link
            prefetch={false}
            href={`/admin/crm/support?email=${encodeURIComponent(profile.email)}`}
            className="wp-crm-secondary flex items-center gap-1"
          >
            Support inbox <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>

      {accountStatus.status === "closing" && (
        <div className="rounded-xl border border-warning/40 bg-highlight-soft p-4 text-xs text-warning flex items-center gap-3">
          <AlertTriangle size={18} className="shrink-0 text-warning" />
          <div>
            <strong>Account scheduled for deletion</strong>
            <p className="mt-0.5">
              Deletion was requested on{" "}
              {accountStatus.requestedAt ? new Date(accountStatus.requestedAt).toLocaleDateString("en-GB") : "recently"}.
              Customer data will be permanently wiped on{" "}
              {accountStatus.scheduledFor ? new Date(accountStatus.scheduledFor).toLocaleDateString("en-GB") : "the scheduled date"} (7 days grace period).
            </p>
          </div>
        </div>
      )}

      {/* Leads Stats Banner */}
      <section className="wp-growth-stats" aria-label="Lead performance stats">
        <div className="wp-crm-stat">
          <span>Clicks today</span>
          <strong>{leads.today}</strong>
          <small>Since midnight UTC</small>
        </div>
        <div className="wp-crm-stat">
          <span>Last 7 days</span>
          <strong>{leads.last7d}</strong>
          <small>Rolling 7 days</small>
        </div>
        <div className="wp-crm-stat">
          <span>Last 30 days</span>
          <strong>{leads.last30d}</strong>
          <small>Rolling 30 days</small>
        </div>
        <div className="wp-crm-stat">
          <span>Total routed leads</span>
          <strong>{leads.total}</strong>
          <small>All-time, across all links</small>
        </div>
      </section>

      {/* Profile & Plan Section */}
      <div className="wp-growth-two">
        {/* Profile Card */}
        <section className="wp-growth-panel" aria-label="Customer profile details">
          <div className="flex justify-between items-center mb-4">
            <h2>Profile</h2>
            <span className="text-xs text-muted">ID: {profile.id}</span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted">Name</span>
              <span className="font-semibold text-text">{profile.name || "—"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted">Email</span>
              <span className="font-semibold text-text break-all">{profile.email}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted">Phone</span>
              <span className="font-semibold text-text">{profile.phone || "Not recorded"}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted">Sign-up date</span>
              <span className="text-text">{new Date(profile.createdAt).toLocaleDateString("en-GB")}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted">Login method</span>
              <span className="wp-crm-pill">{profile.loginMethod}</span>
            </div>

            {profile.workspace && (
              <div className="pt-2">
                <span className="text-muted block mb-2 font-medium">
                  Workspace: {profile.workspace.name} ({profile.workspace.memberCount} members)
                </span>
                <div className="space-y-1.5 pl-2 border-l border-border-strong">
                  {profile.workspace.members.map((m) => (
                    <div key={m.id} className="flex justify-between text-[11px] text-muted">
                      <span>{m.name || m.email}</span>
                      <span className="text-muted capitalize">{m.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Plan & Usage Card */}
        <section className="wp-growth-panel" aria-label="Plan and limits">
          <div className="flex justify-between items-center mb-4">
            <h2>Plan & access</h2>
            <ChangePlanControl userId={profile.id} currentPlan={plan.plan} />
          </div>
          <div className="space-y-3 text-xs">
            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted">Current plan</span>
              <span className="font-bold text-text text-sm">{plan.displayPlan}</span>
            </div>

            {plan.trialActive ? (
              <div className="flex justify-between py-1.5 border-b border-border text-accent">
                <span>Free trial active</span>
                <span>
                  {plan.trialDaysLeft} days left · ends{" "}
                  {plan.trialEndsAt ? new Date(plan.trialEndsAt).toLocaleDateString("en-GB") : ""}
                </span>
              </div>
            ) : plan.trialEndsAt ? (
              <div className="flex justify-between py-1.5 border-b border-border text-muted">
                <span>Free trial</span>
                <span>Ended {new Date(plan.trialEndsAt).toLocaleDateString("en-GB")}</span>
              </div>
            ) : null}

            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted">Paid until</span>
              <span className="text-text">
                {plan.planExpiresAt
                  ? `${new Date(plan.planExpiresAt).toLocaleDateString("en-GB")} (${plan.paidDaysLeft ?? 0} days left)`
                  : "No expiry recorded"}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted">Auto-pay</span>
              <span className="text-text">
                {plan.autoPay === null ? "—" : plan.autoPay ? "On" : "Off"}
              </span>
            </div>

            <div className="flex justify-between py-1.5 border-b border-border">
              <span className="text-muted">Routing status</span>
              <span className={plan.linksPaused ? "text-danger font-semibold" : "text-accent font-semibold"}>
                {plan.linksPaused ? "Links paused (expired)" : "Links active"}
              </span>
            </div>

            {/* Usage vs Limits Sub-block */}
            <div className="pt-2">
              <span className="text-muted block mb-2 font-medium">Usage vs plan limits</span>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded border border-border bg-surface/50 p-2">
                  <span className="text-muted block">Links (lead rotators, WhatsApp &amp; ad links)</span>
                  <strong className="text-text">{usageVsLimits.links.label}</strong>
                </div>
                <div className="rounded border border-border bg-surface/50 p-2">
                  <span className="text-muted block">Max salespeople / lead rotator</span>
                  <strong className="text-text">{usageVsLimits.maxSalespeoplePerRotator.label}</strong>
                </div>
                <div className="rounded border border-border bg-surface/50 p-2">
                  <span className="text-muted block">Ad links</span>
                  <strong className="text-text">{usageVsLimits.adLinksAvailable.label}</strong>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Lead Rotators & Salespeople Block */}
      <section className="wp-growth-panel" aria-label="Customer lead rotators">
        <div className="flex justify-between items-center mb-4">
          <h2>Lead rotators ({rotators.length})</h2>
          <span className="text-xs text-muted">Lead distribution pages</span>
        </div>
        {rotators.length ? (
          <div className="wp-growth-table-wrap">
            <table className="wp-growth-table">
              <thead>
                <tr>
                  <th>Lead rotator</th>
                  <th>Status</th>
                  <th>Clicks</th>
                  <th>Salespeople</th>
                  <th>Public Link</th>
                </tr>
              </thead>
              <tbody>
                {rotators.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name}</strong>
                      <p className="text-xs text-muted font-mono mt-0.5">{r.code}</p>
                    </td>
                    <td>
                      <span className={`wp-crm-pill ${r.status === "Live" ? "text-accent border-accent" : "text-warning border-warning"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>{r.totalClicks}</td>
                    <td>
                      <div className="space-y-1">
                        {r.salespeople.map((s, idx) => (
                          <div key={idx} className="text-xs flex items-center gap-1.5">
                            <span className="text-text font-medium">{s.name}</span>
                            <span className="text-muted font-mono text-[11px]">{s.number}</span>
                          </div>
                        ))}
                        {!r.salespeople.length && (
                          <span className="text-xs text-muted">No salespeople configured</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <a
                        href={r.publicUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-accent hover:underline inline-flex items-center gap-1"
                      >
                        /r/{r.code} <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted py-3">No lead rotators created yet.</p>
        )}
      </section>

      {/* WhatsApp Links & Ad Links Block */}
      <div className="wp-growth-two">
        {/* WhatsApp Links */}
        <section className="wp-growth-panel" aria-label="WhatsApp links">
          <div className="flex justify-between items-center mb-3">
            <h2>WhatsApp links ({links.shortLinks.length})</h2>
          </div>
          {links.shortLinks.length ? (
            <div className="space-y-2.5 text-xs">
              {links.shortLinks.map((s) => (
                <div key={s.id} className="border border-border rounded-lg p-2.5 flex justify-between items-center">
                  <div>
                    <strong className="text-text block">{s.name}</strong>
                    <span className="text-muted font-mono">{s.phone}</span>
                  </div>
                  <div className="text-right">
                    <span className={`wp-crm-pill mr-2 ${s.status === "Live" ? "text-accent" : "text-warning"}`}>
                      {s.status}
                    </span>
                    <span className="text-muted">{s.clicks} clicks</span>
                    <a
                      href={s.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent ml-2"
                    >
                      /s/{s.code}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted py-2">No WhatsApp links created.</p>
          )}
        </section>

        {/* Ad Links */}
        <section className="wp-growth-panel" aria-label="Ad links">
          <div className="flex justify-between items-center mb-3">
            <h2>Ad links ({links.adLinks.length})</h2>
          </div>
          {links.adLinks.length ? (
            <div className="space-y-2.5 text-xs">
              {links.adLinks.map((a) => (
                <div key={a.id} className="border border-border rounded-lg p-2.5 flex justify-between items-center">
                  <div>
                    <strong className="text-text block">{a.name}</strong>
                    <span className="text-muted font-mono">{a.number}</span>
                    {(a.utmSource || a.utmCampaign) && (
                      <p className="text-[10px] text-muted mt-0.5">
                        UTM: {a.utmSource || "—"} / {a.utmCampaign || "—"}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`wp-crm-pill mr-2 ${a.status === "Live" ? "text-accent" : "text-warning"}`}>
                      {a.status}
                    </span>
                    <span className="text-muted">{a.clicks} clicks</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted py-2">No ad links created.</p>
          )}
        </section>
      </div>

      {/* Website Button & Support Section */}
      <div className="wp-growth-two">
        {/* Website Button Card */}
        <section className="wp-growth-panel" aria-label="Website button">
          <div className="flex justify-between items-center mb-3">
            <h2>Website button</h2>
            <span className={`wp-crm-pill ${widget.available ? "text-accent" : "text-muted"}`}>
              {widget.available ? "Plan eligible" : "Unavailable"}
            </span>
          </div>
          <div className="text-xs space-y-2">
            <p className="text-muted">{widget.statusLabel}</p>
            <div className="flex justify-between py-1 border-t border-border">
              <span className="text-muted">Embed snippets generated</span>
              <strong className="text-text">{widget.copiesCount}</strong>
            </div>
          </div>
        </section>

        {/* Support Chats Card */}
        <section className="wp-growth-panel" aria-label="Customer support history">
          <div className="flex justify-between items-center mb-3">
            <h2>Support conversations ({supportChats.length})</h2>
            <Link
              prefetch={false}
              href={`/admin/crm/support?email=${encodeURIComponent(profile.email)}`}
              className="text-xs text-accent hover:underline"
            >
              Open inbox →
            </Link>
          </div>
          {supportChats.length ? (
            <div className="space-y-2 text-xs">
              {supportChats.map((chat) => (
                <div key={chat.id} className="border border-border rounded-lg p-2 flex justify-between items-center">
                  <div>
                    <Link
                      prefetch={false}
                      href={`/admin/crm/support?chat=${encodeURIComponent(chat.id)}`}
                      className="font-medium text-text hover:text-accent block"
                    >
                      {chat.subject}
                    </Link>
                    <p className="text-[11px] text-muted truncate max-w-xs mt-0.5">
                      {chat.lastMessageSnippet || "No messages"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="wp-crm-pill">{chat.status}</span>
                    <span className="text-[11px] text-muted block mt-1">
                      {new Date(chat.lastMessageAt).toLocaleDateString("en-GB")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted py-2">No support conversations recorded.</p>
          )}
        </section>
      </div>

      {/* Plan History (BillingAuditLog) */}
      <section className="wp-growth-panel" aria-label="Billing audit history">
        <div className="flex justify-between items-center mb-4">
          <h2>Plan change history</h2>
          <span className="text-xs text-muted">Audit trail (BillingAuditLog)</span>
        </div>
        {planHistory.length ? (
          <div className="wp-growth-table-wrap">
            <table className="wp-growth-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Action</th>
                  <th>Before → After</th>
                  <th>Changed by</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {planHistory.map((log) => (
                  <tr key={log.id}>
                    <td>{new Date(log.createdAt).toLocaleString("en-GB")}</td>
                    <td>
                      <span className="wp-crm-pill">{log.action.replaceAll("_", " ")}</span>
                    </td>
                    <td>
                      {log.beforePlan && log.afterPlan ? (
                        <span>
                          {log.beforePlan} → <strong className="text-text">{log.afterPlan}</strong>
                        </span>
                      ) : (
                        log.afterPlan || log.beforePlan || "—"
                      )}
                    </td>
                    <td>{log.actor}</td>
                    <td className="text-muted">{log.reason || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted py-3">No manual plan changes recorded in the audit log.</p>
        )}
      </section>
    </main>
  );
}
