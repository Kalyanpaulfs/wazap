// Pure helpers for the admin Payments page (/admin/crm/billing,
// BillingWorkspace.tsx). Kept dependency-free (no prisma) so they can be
// unit tested directly - same convention as lib/admin-dashboard.ts.
//
// Real Payment.status values on record (grep across lib/payment-integrity.ts,
// lib/billing-actions.ts, app/api/payment/*/webhook/route.ts,
// app/api/payment/*/create/route.ts): "active", "pending", "invoice_requested",
// "refunded", "partially_refunded", "charged_back", "disputed". Plus internal
// bookkeeping rows that are never real charges: "subscription_active",
// "subscription_inactive", "inactive", "provider_not_found" - these are
// excluded by the caller's query (paymentListWhere below) before any of this
// is ever reached. "failed" / "cancelled" aren't currently written for
// Payment, but are mapped defensively since other billing tables use them.

export type PaymentStatusTone = "green" | "amber" | "red" | "slate";
export type PaymentStatusInfo = { label: string; tone: PaymentStatusTone };

// Internal rows that never represent a real charge or checkout attempt.
export const NON_CHARGE_PAYMENT_STATUSES = ["subscription_active", "subscription_inactive", "inactive", "provider_not_found"];

export function paymentStatusInfo(status: string): PaymentStatusInfo {
  switch (status) {
    case "active":
      return { label: "Paid", tone: "green" };
    case "pending":
    case "invoice_requested":
      return { label: "Pending", tone: "amber" };
    case "refunded":
      return { label: "Refunded", tone: "slate" };
    case "partially_refunded":
      return { label: "Partly refunded", tone: "amber" };
    case "charged_back":
      return { label: "Charged back", tone: "red" };
    case "disputed":
      return { label: "Disputed", tone: "red" };
    case "failed":
      return { label: "Failed", tone: "red" };
    case "cancelled":
      return { label: "Cancelled", tone: "slate" };
    default:
      return { label: status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " "), tone: "slate" };
  }
}

/** Any kind of money-back event - groups refunded/partially-refunded/charged-back for the "Refunded" filter chip. */
export function isRefundLikeStatus(status: string): boolean {
  return status === "refunded" || status === "partially_refunded" || status === "charged_back";
}

export type PaymentStatusFilter = "all" | "active" | "refunded";

export const PAYMENT_STATUS_FILTERS: { key: PaymentStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Paid" },
  { key: "refunded", label: "Refunded" },
];

export function matchesPaymentStatusFilter(status: string, filter: PaymentStatusFilter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return status === "active";
  return isRefundLikeStatus(status);
}

export function paymentMethodLabel(method: string): string {
  if (method === "paypal") return "PayPal";
  if (method === "dodo") return "Dodo";
  if (method === "paypal_invoice") return "PayPal (invoice)";
  return method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, " ");
}
