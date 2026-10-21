import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { listAdminCustomers } from "@/lib/admin-customers-service";
import { CUSTOMER_SEGMENTS, accountStatusPill, customerPlanPill, type CustomerSegment } from "@/lib/admin-customer";
import { formatAdminDate } from "@/lib/admin-format";

export const metadata = {
  title: "Customers — Admin CRM",
  robots: { index: false, follow: false },
};

const PLAN_PILL_CLASSES: Record<string, string> = {
  green: "",
  slate: "border-slate-600 text-slate-400",
  red: "border-red-500 text-red-400",
  sky: "border-sky-500 text-sky-300",
  emerald: "border-emerald-500 text-emerald-300",
  gold: "border-amber-400 text-amber-300",
};

const ACCOUNT_OPTIONS: [string, string][] = [
  ["", "All"],
  ["active", "Active"],
  ["closing", "Closing"],
  ["deleted", "Deleted"],
];
const AUTOPAY_OPTIONS: [string, string][] = [
  ["", "All"],
  ["on", "On"],
  ["off", "Off"],
];

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    segment?: string;
    status?: string;
    autopay?: string;
    page?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) redirect("/login");

  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const segment = (sp.segment || "") as CustomerSegment | "";
  const status = sp.status || "";
  const autopay = sp.autopay === "on" || sp.autopay === "off" ? sp.autopay : "";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const moreFiltersActive = Boolean(status || autopay);
  const anyFilterActive = Boolean(q || segment || status || autopay);

  const { customers, total, totalPages, segmentCounts } = await listAdminCustomers({
    q,
    segment,
    status,
    autopay,
    page,
    pageSize: 25,
  });

  const buildQs = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const next = {
      q: overrides.q !== undefined ? overrides.q : q,
      segment: overrides.segment !== undefined ? overrides.segment : segment,
      status: overrides.status !== undefined ? overrides.status : status,
      autopay: overrides.autopay !== undefined ? overrides.autopay : autopay,
      page: overrides.page !== undefined ? overrides.page : String(page),
    };
    if (next.q) params.set("q", next.q);
    if (next.segment) params.set("segment", next.segment);
    if (next.status) params.set("status", next.status);
    if (next.autopay) params.set("autopay", next.autopay);
    if (next.page && next.page !== "1") params.set("page", next.page);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  const rangeStart = total === 0 ? 0 : (page - 1) * 25 + 1;
  const rangeEnd = Math.min(total, page * 25);

  return (
    <main className="wp-growth">
      <div className="wp-admin-heading">
        <div>
          <p className="wp-eyebrow">WAZAP · ADMIN</p>
          <h1>Customers</h1>
          <p>{total} customer{total === 1 ? "" : "s"}</p>
        </div>
        <form action="/admin/crm/customers" method="GET">
          <div className="wp-crm-search">
            <Search size={16} />
            <input name="q" defaultValue={q} placeholder="Name, email or phone" maxLength={100} aria-label="Search customers" />
            {segment && <input type="hidden" name="segment" value={segment} />}
            {status && <input type="hidden" name="status" value={status} />}
            {autopay && <input type="hidden" name="autopay" value={autopay} />}
          </div>
          {q && (
            <Link prefetch={false} href={`/admin/crm/customers${buildQs({ q: null, page: "1" })}`} aria-label="Clear search" className="wp-crm-secondary inline-flex mt-2">
              <X size={13} /> Clear search
            </Link>
          )}
        </form>
      </div>

      <div className="wp-seg-chips mt-6" role="group" aria-label="Customer segment">
        {[{ key: "" as const, label: "All" }, ...CUSTOMER_SEGMENTS].map(({ key, label }) => (
          <Link
            key={key || "all"}
            prefetch={false}
            href={`/admin/crm/customers${buildQs({ segment: key || null, page: "1" })}`}
            aria-current={segment === key ? "page" : undefined}
            className="wp-seg-chip"
          >
            {label} <span>{key ? segmentCounts[key] : segmentCounts.all}</span>
          </Link>
        ))}
      </div>

      <details className="wp-more-filters" open={moreFiltersActive}>
        <summary>More filters{moreFiltersActive ? " (active)" : ""}</summary>
        <form action="/admin/crm/customers" method="GET" className="wp-more-filters-body">
          {q && <input type="hidden" name="q" value={q} />}
          {segment && <input type="hidden" name="segment" value={segment} />}
          <label className="wp-crm-label">
            Account
            <select name="status" defaultValue={status}>
              {ACCOUNT_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </label>
          <label className="wp-crm-label">
            Auto-pay
            <select name="autopay" defaultValue={autopay}>
              {AUTOPAY_OPTIONS.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </label>
          <button className="wp-crm-secondary">Apply</button>
          {moreFiltersActive && (
            <Link prefetch={false} href={`/admin/crm/customers${buildQs({ status: null, autopay: null, page: "1" })}`} className="text-xs text-slate-400 hover:text-slate-200">
              Clear filters
            </Link>
          )}
        </form>
      </details>

      <div className="wp-customers-list mt-5">
        <div className="wp-customers-head" aria-hidden="true">
          <span>Customer</span>
          <span>Plan</span>
          <span>Auto-pay</span>
          <span>Signed up</span>
          <span />
        </div>
        {customers.map((c) => {
          const pill = customerPlanPill(c);
          const statusPill = accountStatusPill({
            status: c.accountStatus,
            scheduledFor: c.scheduledDeletionFor ? new Date(c.scheduledDeletionFor) : null,
            requestedAt: null,
          });
          const initial = (c.name || c.email || "?").slice(0, 1).toUpperCase();
          return (
            <Link key={c.id} prefetch={false} href={`/admin/crm/customers/${c.id}`} className="wp-customers-row">
              <span className="wp-customers-cell wp-col-customer">
                <span className="wp-customers-name">
                  <span className="wp-avatar" aria-hidden="true">{initial}</span>
                  <span>
                    <strong>
                      {c.name || c.email}
                      {statusPill && (
                        <span className={`wp-crm-pill ml-2 ${statusPill.tone === "amber" ? "border-amber-500 text-amber-300" : "border-red-500 text-red-400"}`}>
                          {statusPill.label}
                        </span>
                      )}
                    </strong>
                    <small>{c.email}</small>
                    {c.phone && <small>{c.phone}</small>}
                  </span>
                </span>
              </span>
              <span className="wp-customers-cell wp-col-plan">
                <span className={`wp-crm-pill ${PLAN_PILL_CLASSES[pill.tone]}`}>{pill.label}</span>
                {pill.sub && <span className="wp-customers-sub">{pill.sub}</span>}
              </span>
              <span className="wp-customers-cell wp-col-autopay">
                {c.autoPay === null ? (
                  <span className="wp-autopay-dot is-off">—</span>
                ) : (
                  <span className={`wp-autopay-dot ${c.autoPay ? "" : "is-off"}`}>
                    <i /> {c.autoPay ? "On" : "Off"}
                  </span>
                )}
              </span>
              <span className="wp-customers-cell wp-col-signedup">{formatAdminDate(c.createdAt)}</span>
              <ChevronRight size={16} />
            </Link>
          );
        })}

        {!customers.length && (
          <div className="wp-growth-empty">
            <h3>No customers found</h3>
            <p>No customer accounts match the current search or filters.</p>
            {anyFilterActive && (
              <Link prefetch={false} href="/admin/crm/customers">Clear filters</Link>
            )}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="wp-crm-pagination mt-4">
          <span>{rangeStart}–{rangeEnd} of {total}</span>
          <div className="flex gap-2">
            <Link
              prefetch={false}
              href={`/admin/crm/customers${buildQs({ page: String(page - 1) })}`}
              aria-disabled={page <= 1}
              aria-label="Previous page"
              className={page <= 1 ? "opacity-50 pointer-events-none" : ""}
            >
              <ChevronLeft size={16} />
            </Link>
            <Link
              prefetch={false}
              href={`/admin/crm/customers${buildQs({ page: String(page + 1) })}`}
              aria-disabled={page >= totalPages}
              aria-label="Next page"
              className={page >= totalPages ? "opacity-50 pointer-events-none" : ""}
            >
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
