import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { listAdminCustomers } from "@/lib/admin-customers-service";

export const metadata = {
  title: "Customers — Admin CRM — Wazap",
  robots: { index: false, follow: false },
};

export default async function AdminCustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    plan?: string;
    trial?: string;
    status?: string;
    page?: string;
  }>;
}) {
  const session = await getServerSession(authOptions);
  if (!(session?.user as { isAdmin?: boolean } | undefined)?.isAdmin) redirect("/login");

  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const plan = sp.plan || "";
  const trial = sp.trial || "";
  const status = sp.status || "";
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const { customers, total, totalPages } = await listAdminCustomers({
    q,
    plan,
    trial,
    status,
    page,
    pageSize: 25,
  });

  const buildQs = (overrides: Record<string, string | null>) => {
    const params = new URLSearchParams();
    const nextQ = overrides.q !== undefined ? overrides.q : q;
    const nextPlan = overrides.plan !== undefined ? overrides.plan : plan;
    const nextTrial = overrides.trial !== undefined ? overrides.trial : trial;
    const nextStatus = overrides.status !== undefined ? overrides.status : status;
    const nextPage = overrides.page !== undefined ? overrides.page : String(page);

    if (nextQ) params.set("q", nextQ);
    if (nextPlan) params.set("plan", nextPlan);
    if (nextTrial) params.set("trial", nextTrial);
    if (nextStatus) params.set("status", nextStatus);
    if (nextPage && nextPage !== "1") params.set("page", nextPage);

    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <main className="wp-growth">
      <div className="wp-admin-heading">
        <div>
          <p className="wp-eyebrow">CUSTOMER MANAGEMENT</p>
          <h1>Customers</h1>
          <p>Search a customer and inspect their full account, plan, links, and usage on one page.</p>
        </div>
      </div>

      <form action="/admin/crm/customers" method="GET" className="flex flex-wrap items-end gap-3 mt-6">
        <label className="wp-crm-label flex-1">
          Find a customer
          <input
            name="q"
            defaultValue={q}
            placeholder="Search customer name, email or phone"
            maxLength={100}
          />
        </label>
        {plan && <input type="hidden" name="plan" value={plan} />}
        {trial && <input type="hidden" name="trial" value={trial} />}
        {status && <input type="hidden" name="status" value={status} />}
        <button className="wp-primary">Search customers</button>
        {(q || plan || trial || status) && (
          <Link prefetch={false} href="/admin/crm/customers" className="wp-crm-secondary">
            Clear filters
          </Link>
        )}
      </form>

      <div className="flex flex-wrap gap-2 mt-4" role="group" aria-label="Plan filters">
        <span className="text-xs text-slate-400 self-center mr-1">Plan:</span>
        {[
          ["", "All plans"],
          ["free", "Trial or no plan"],
          ["basic", "Solo"],
          ["pro", "Growth"],
          ["ultimate", "Agency"],
        ].map(([val, label]) => (
          <Link
            key={val}
            prefetch={false}
            href={`/admin/crm/customers${buildQs({ plan: val || null, page: "1" })}`}
            aria-pressed={plan === val}
            className={`wp-crm-secondary ${plan === val ? "is-current" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Trial filters">
        <span className="text-xs text-slate-400 self-center mr-1">Trial:</span>
        {[
          ["", "All"],
          ["active", "Trial active"],
          ["ended", "Trial ended"],
        ].map(([val, label]) => (
          <Link
            key={val}
            prefetch={false}
            href={`/admin/crm/customers${buildQs({ trial: val || null, page: "1" })}`}
            aria-pressed={trial === val}
            className={`wp-crm-secondary ${trial === val ? "is-current" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mt-2" role="group" aria-label="Account status filters">
        <span className="text-xs text-slate-400 self-center mr-1">Account:</span>
        {[
          ["", "All accounts"],
          ["active", "Active"],
          ["closing", "Closing"],
          ["deleted", "Deleted"],
        ].map(([val, label]) => (
          <Link
            key={val}
            prefetch={false}
            href={`/admin/crm/customers${buildQs({ status: val || null, page: "1" })}`}
            aria-pressed={status === val}
            className={`wp-crm-secondary ${status === val ? "is-current" : ""}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <p className="text-xs text-slate-400 my-5">
        {total} matching customer accounts · Page {page} of {totalPages}
      </p>

      <div className="wp-growth-table-wrap">
        <table className="wp-growth-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th>Plan</th>
              <th>Trial / Plan end</th>
              <th>Signed up</th>
              <th>Last login</th>
              <th>Account status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => {
              const expiryDate = c.trialActive
                ? c.trialEndsAt
                : c.planExpiresAt;
              return (
                <tr key={c.id}>
                  <td>
                    <strong>
                      <Link
                        prefetch={false}
                        href={`/admin/crm/customers/${c.id}`}
                        className="hover:text-[#25D366] transition-colors"
                      >
                        {c.name || c.email}
                      </Link>
                    </strong>
                    <p className="text-xs text-slate-400 mt-1">{c.email}</p>
                  </td>
                  <td>{c.phone || <span className="text-slate-500">—</span>}</td>
                  <td>
                    <span className="font-semibold">{c.displayPlan}</span>
                    {c.trialActive && (
                      <p className="text-xs text-[#25D366] mt-0.5">Active trial</p>
                    )}
                  </td>
                  <td>
                    {expiryDate
                      ? new Date(expiryDate).toLocaleDateString("en-GB")
                      : <span className="text-slate-500">No expiry recorded</span>}
                  </td>
                  <td>{new Date(c.createdAt).toLocaleDateString("en-GB")}</td>
                  <td>
                    <span className="text-slate-500">{c.lastLogin || "—"}</span>
                  </td>
                  <td>
                    {c.accountStatus === "active" && (
                      <span className="wp-crm-pill">Active</span>
                    )}
                    {c.accountStatus === "closing" && (
                      <span className="wp-crm-pill border-amber-500 text-amber-300">
                        Closing {c.scheduledDeletionFor ? new Date(c.scheduledDeletionFor).toLocaleDateString("en-GB") : ""}
                      </span>
                    )}
                    {c.accountStatus === "deleted" && (
                      <span className="wp-crm-pill border-red-500 text-red-400">
                        Deleted
                      </span>
                    )}
                  </td>
                  <td>
                    <Link
                      prefetch={false}
                      href={`/admin/crm/customers/${c.id}`}
                      className="wp-crm-secondary inline-block"
                    >
                      View profile →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!customers.length && (
          <div className="wp-growth-empty">
            <h3>No customers found</h3>
            <p>No customer accounts match the current search or filters. Try adjusting your search query.</p>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="wp-crm-pagination mt-4">
          <Link
            prefetch={false}
            href={`/admin/crm/customers${buildQs({ page: String(page - 1) })}`}
            aria-disabled={page <= 1}
            className={page <= 1 ? "opacity-50 pointer-events-none" : ""}
          >
            Previous
          </Link>
          <span>Page {page} / {totalPages}</span>
          <Link
            prefetch={false}
            href={`/admin/crm/customers${buildQs({ page: String(page + 1) })}`}
            aria-disabled={page >= totalPages}
            className={page >= totalPages ? "opacity-50 pointer-events-none" : ""}
          >
            Next
          </Link>
        </div>
      )}
    </main>
  );
}
