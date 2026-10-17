// One-sentence plain-English billing status, shared by the dashboard's
// small billing box and the /billing page, so the two can never say
// different things about the same account (FEAT-BILLING-PLANS-PAGES).
export const BILLING_PLAN_LABELS: Record<string, string> = {
  free: "Free trial ended",
  basic: "Solo",
  pro: "Growth",
  ultimate: "Agency",
  business: "Business",
};

export type PendingChangeSentenceInput = {
  toPlan: string;
  effectiveAt: Date | string | null;
} | null | undefined;

export type BillingStatusSentenceInput = {
  plan: string;
  inTrial: boolean;
  trialPlan?: string | null;
  trialEndsAt?: Date | string | null;
  autoRenew: boolean;
  renewsOrExpiresAt: Date | string | null;
  provider: string | null;
  pendingChange?: PendingChangeSentenceInput;
};

function formatDate(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function providerLabel(provider: string | null): string | null {
  if (provider === "dodo") return "card";
  if (provider === "paypal") return "PayPal";
  return null;
}

// Plain-word label for a Payment row's raw status, for the /billing payment
// history table. Internal rows that are never real charges ($0 auto-pay
// pointer rows: subscription_active / subscription_inactive, plus
// provider_not_found / inactive) are filtered out by the caller's query
// (same exclusion app/api/admin/billing/payments and CustomerPaymentsPanel
// use) before this ever sees them.
// A checkout that is still "pending" after a day was abandoned (the customer
// never finished paying) - say so instead of "Pending" forever.
const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

export function paymentStatusLabel(status: string, createdAt?: Date | string | null, now = new Date()): string {
  switch (status) {
    case "active":
      return "Paid";
    case "pending":
      return createdAt && now.getTime() - new Date(createdAt).getTime() > ABANDONED_AFTER_MS ? "Not completed" : "Pending";
    case "disputed":
      return "Disputed";
    case "refunded":
    case "partially_refunded":
    case "charged_back":
      return "Refunded";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
  }
}

export function billingStatusSentence(input: BillingStatusSentenceInput): string {
  const planLabel = (plan: string) => BILLING_PLAN_LABELS[plan] || plan;

  if (input.plan === "free") {
    if (input.inTrial) {
      const trialLabel = planLabel((input.trialPlan || "basic").toLowerCase());
      const endsAt = formatDate(input.trialEndsAt);
      return `Free trial of ${trialLabel}${endsAt ? ` — ends ${endsAt}` : ""}`;
    }
    return "Free trial ended — no billing";
  }

  if (input.pendingChange) {
    const effectiveAt = formatDate(input.pendingChange.effectiveAt);
    return `Changes to ${planLabel(input.pendingChange.toPlan)} on ${effectiveAt || "your next billing date"}`;
  }

  const renewsOrExpiresAt = formatDate(input.renewsOrExpiresAt);
  if (input.autoRenew) {
    const via = providerLabel(input.provider);
    return `Renews automatically on ${renewsOrExpiresAt || "your renewal date"}${via ? ` via ${via}` : ""}`;
  }
  return `Ends on ${renewsOrExpiresAt || "your current period end"} — auto-pay is off`;
}
