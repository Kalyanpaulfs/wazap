// Static quick-answer library (SUPPORT-2 "no AI" ticket system) + the
// personal-facts builder shown to logged-in customers for payment/link
// topics. The static list and the pure fact-builder (buildPersonalFacts) are
// unit-tested directly; personalFacts() is the DB-touching wrapper used by
// app/api/support/quick-answers/route.ts.
import { PLAN_PRICES } from "./billing";
import { accountPlanLabel, isProductTrialActive } from "./entitlements";
import { LINK_LIMITS, NUMBERS_PER_ROTATOR_LIMITS } from "./plan-limits";
import { prisma } from "./prisma";
import { linkPlan } from "./router-entitlements";
import type { TicketTopic } from "./support-ticket-rules";

export type QuickAnswerAction = { label: string; href: string };

export type QuickAnswer = {
  id: string;
  topic: TicketTopic;
  title: string;
  body: string;
  action?: QuickAnswerAction;
  urgent?: boolean;
};

function planFactsLine() {
  return `Free trial: 3 days of Solo. Solo $${PLAN_PRICES.basic} (${LINK_LIMITS.basic} links, ${NUMBERS_PER_ROTATOR_LIMITS.basic} salespeople), Growth $${PLAN_PRICES.pro} (${LINK_LIMITS.pro} links incl. ad links, ${NUMBERS_PER_ROTATOR_LIMITS.pro} salespeople), Agency $${PLAN_PRICES.ultimate} (${LINK_LIMITS.ultimate} links, ${NUMBERS_PER_ROTATOR_LIMITS.ultimate} salespeople).`;
}

export const QUICK_ANSWERS: QuickAnswer[] = [
  // payment
  {
    id: "pay-not-active",
    topic: "payment",
    title: "Money deducted but my plan isn't active",
    body: "Sometimes the payment provider takes a few minutes to confirm a charge. If it's been longer than 30 minutes, raise a ticket with your payment date and amount and we'll check it urgently.",
    urgent: true,
  },
  {
    id: "pay-failed",
    topic: "payment",
    title: "My payment failed",
    body: "A failed payment is not charged. Try again from [Billing](/billing) with a different card or payment method. If it keeps failing, raise a ticket and tell us which method you tried.",
    action: { label: "Go to Billing", href: "/billing" },
  },
  {
    id: "pay-refund",
    topic: "payment",
    title: "How do refunds work?",
    body: "Refunds are available within 7 days of payment if you haven't used the plan's limits. See our [refund policy](/refund) for the full details, or raise a ticket with your payment date.",
    action: { label: "Refund policy", href: "/refund" },
  },
  {
    id: "pay-card",
    topic: "payment",
    title: "Change my card",
    body: "If you pay by card (Dodo), update it from [Billing](/billing). If you pay through PayPal, change your card in your PayPal account - Wazap never sees your card details there.",
    action: { label: "Go to Billing", href: "/billing" },
  },
  {
    id: "pay-cancel",
    topic: "payment",
    title: "Cancel my plan / turn off auto-pay",
    body: `You can cancel or turn off auto-pay any time from [Billing](/billing) - you keep access until the end of the period you already paid for. ${planFactsLine()}`,
    action: { label: "Go to Billing", href: "/billing" },
  },
  {
    id: "pay-invoice",
    topic: "payment",
    title: "Get an invoice or receipt",
    body: "You get an emailed receipt when a payment is confirmed. Check your inbox (and spam folder) for the payment date. Raise a ticket if you can't find it or need a formatted invoice for accounting.",
    action: { label: "Go to Billing", href: "/billing" },
  },
  // link
  {
    id: "link-paused",
    topic: "link",
    title: "Why is my link paused?",
    body: "A link pauses when your free trial ends, your plan expires, or you have more links than your current plan allows. Paying (or upgrading) resumes paused links automatically, as long as you're within the new plan's limit.",
  },
  {
    id: "link-wrong-number",
    topic: "link",
    title: "Link opens the wrong number",
    body: "Check the numbers and their order on the [My links](/links) page - a rotator sends each click to the next number in the list. If the numbers look correct but it still opens the wrong one, raise a ticket with the link code.",
    action: { label: "Go to My links", href: "/links" },
  },
  {
    id: "link-edit",
    topic: "link",
    title: "How do I edit a link?",
    body: "Open [My links](/links), choose the link, and edit its name, numbers or message. Changes apply to new clicks immediately.",
    action: { label: "Go to My links", href: "/links" },
  },
  {
    id: "link-limit",
    topic: "link",
    title: "I reached my link limit",
    body: `Each plan includes a set number of links (rotators, short links and ad links, any mix). ${planFactsLine()} Upgrade from [Billing](/billing#plans) for more room, or delete a link you no longer need to free up a slot - pausing a link does not free a slot.`,
    action: { label: "See plans", href: "/billing#plans" },
  },
  {
    id: "link-down",
    topic: "link",
    title: "My link doesn't open at all",
    body: "This is usually a paused or expired plan, or the link code was mistyped. Raise a ticket with the exact link (the full URL or code) so we can check it urgently.",
    urgent: true,
  },
  // account
  {
    id: "acc-code",
    topic: "account",
    title: "Login code isn't arriving",
    body: "Check spam/junk folders first - the code comes from an @wazap.lt address. Codes expire after a few minutes, so request a fresh one if it's been a while. Still nothing after a few minutes? Raise a ticket with the email you're using.",
  },
  {
    id: "acc-email",
    topic: "account",
    title: "Change my email",
    body: "Raise a ticket with your current and new email address and we'll update it for you - this isn't self-service yet, to keep your account secure.",
  },
  {
    id: "acc-google",
    topic: "account",
    title: "Google sign-in",
    body: "Sign in with the same Google account every time - Wazap matches accounts by Google's account ID, not just the email. If Google sign-in isn't linking to your existing account, raise a ticket.",
  },
  {
    id: "acc-delete",
    topic: "account",
    title: "Delete my account",
    body: "Request account deletion from [Account settings](/account). You'll get a short grace period to change your mind before it's permanent.",
    action: { label: "Go to Account", href: "/account" },
  },
];

export function quickAnswersForTopic(topic: string): QuickAnswer[] {
  return QUICK_ANSWERS.filter(a => a.topic === topic);
}

export function quickAnswerById(id: string): QuickAnswer | null {
  return QUICK_ANSWERS.find(a => a.id === id) || null;
}

// ---- Personal facts (logged-in only, payment/link topics only) ----

export type LastPaymentFact = { amount: number; currency: string; createdAt: Date; status: string };

export type PersonalFactsInput = {
  topic: string;
  quickAnswerId?: string | null;
  now: Date;
  planLabel: string; // e.g. "Growth", "Free trial", "Free trial ended"
  planActive: boolean; // effective plan resolves to a real paid/trial plan (not free)
  planExpiresAt: Date | null;
  trialEndsAt: Date | null;
  trialActive: boolean;
  lastPayment: LastPaymentFact | null;
  /** Links paused because of the plan (trial ended / expired / over the new plan's limit) - planPausedAt. */
  planPausedLinkCount: number;
  /** Links the customer paused themselves - pausedAt, and not also plan-paused. Reported separately so we never blame "your plan" for a link the customer chose to pause. */
  customerPausedLinkCount: number;
};

export type PersonalFacts = { sentences: string[]; suggestUrgentTicket: boolean };

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount}`;
  }
}

function pluralLinks(count: number): string {
  return `${count} link${count === 1 ? "" : "s"} ${count === 1 ? "is" : "are"} paused`;
}

/**
 * Pure fact-builder: given already-resolved plan/payment data, returns a
 * short set of plain-language sentences (never claiming to be "always
 * correct") plus whether this looks urgent enough to suggest raising a
 * ticket now rather than waiting. Only meaningful for payment/link topics -
 * returns null for account/other (callers should not show a personal facts
 * panel there).
 */
export function buildPersonalFacts(input: PersonalFactsInput): PersonalFacts | null {
  if (input.topic !== "payment" && input.topic !== "link") return null;
  const sentences: string[] = [];
  let suggestUrgentTicket = false;

  if (!input.planActive) {
    if (input.trialEndsAt && !input.trialActive) {
      sentences.push(`Your free trial ended on ${formatDate(input.trialEndsAt)}${input.planPausedLinkCount ? `, so your ${pluralLinks(input.planPausedLinkCount)} because of your plan` : ""}.`);
    } else {
      sentences.push(`Your plan is not currently active${input.planPausedLinkCount ? `, so your ${pluralLinks(input.planPausedLinkCount)} because of your plan` : ""}.`);
    }
  }

  if (input.lastPayment) {
    const paymentLine = `We see your ${formatMoney(input.lastPayment.amount, input.lastPayment.currency)} payment on ${formatDate(input.lastPayment.createdAt)}.`;
    const activeLine = input.planActive && input.planExpiresAt ? ` Your ${input.planLabel} plan is active until ${formatDate(input.planExpiresAt)}.` : "";
    sentences.push(paymentLine + activeLine);
    if (!input.planActive && input.now.getTime() - input.lastPayment.createdAt.getTime() <= 86_400_000) {
      suggestUrgentTicket = true;
    }
  } else {
    sentences.push("We haven't confirmed a payment on your account yet. If you paid in the last 30 minutes it may still be on its way.");
    if (input.quickAnswerId === "pay-not-active") suggestUrgentTicket = true;
  }

  if (input.customerPausedLinkCount) {
    sentences.push(`You paused ${input.customerPausedLinkCount} link${input.customerPausedLinkCount === 1 ? "" : "s"} yourself.`);
  }

  return { sentences, suggestUrgentTicket };
}

/** DB-touching wrapper for app/api/support/quick-answers - fetches this one user's own data only. */
export async function personalFacts(userId: string, topic: string, quickAnswerId: string | null, now: Date = new Date()): Promise<PersonalFacts | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, trialStartedAt: true, trialEndsAt: true, trialPlan: true } });
  if (!user) return null;

  const planLabel = accountPlanLabel(user, now);
  const planActive = linkPlan(user, now) !== "free";
  const trialActive = isProductTrialActive(user, now);

  // A "confirmed" payment is one that was actually a SUCCESSFUL charge, not
  // just one the provider once activated and later reversed. activatedAt is
  // set the moment a charge is verified (see lib/payment-integrity.ts
  // recordVerifiedCharge) but is never cleared on a later refund/chargeback
  // - lib/billing-actions.ts / lib/billing-rules.ts only flip `status` then
  // ("refunded", "charged_back", "disputed", "partially_refunded"), so the
  // status must be checked too. "active" (one-time charge) and
  // "subscription_active" (recurring) are the only "money actually landed
  // and is still ours" statuses; "pending"/"inactive"/"subscription_inactive"
  // never completed, and amount must be a real, positive charge.
  const SUCCESSFUL_CHARGE_STATUSES = ["active", "subscription_active"] as const;
  const lastPaymentRow = await prisma.payment.findFirst({
    where: { userId, activatedAt: { not: null }, amount: { gt: 0 }, status: { in: [...SUCCESSFUL_CHARGE_STATUSES] } },
    orderBy: { activatedAt: "desc" },
  });
  const lastPayment: LastPaymentFact | null = lastPaymentRow
    ? { amount: lastPaymentRow.amount, currency: lastPaymentRow.currency, createdAt: lastPaymentRow.activatedAt!, status: lastPaymentRow.status }
    : null;

  // Plan-paused and customer-paused are reported separately (never blame
  // "your plan" for a link the customer chose to pause themselves) - a link
  // with both set counts only as plan-paused, since that's the more urgent
  // fact for this conversation.
  const [rotatorsPlan, shortsPlan, adsPlan, rotatorsCustomer, shortsCustomer, adsCustomer] = await Promise.all([
    prisma.rotatorLink.count({ where: { userId, planPausedAt: { not: null } } }),
    prisma.shortLink.count({ where: { userId, planPausedAt: { not: null } } }),
    prisma.adLink.count({ where: { userId, planPausedAt: { not: null } } }),
    prisma.rotatorLink.count({ where: { userId, pausedAt: { not: null }, planPausedAt: null } }),
    prisma.shortLink.count({ where: { userId, pausedAt: { not: null }, planPausedAt: null } }),
    prisma.adLink.count({ where: { userId, pausedAt: { not: null }, planPausedAt: null } }),
  ]);

  return buildPersonalFacts({
    topic,
    quickAnswerId,
    now,
    planLabel,
    planActive,
    planExpiresAt: user.planExpiresAt,
    trialEndsAt: user.trialEndsAt,
    trialActive,
    lastPayment,
    planPausedLinkCount: rotatorsPlan + shortsPlan + adsPlan,
    customerPausedLinkCount: rotatorsCustomer + shortsCustomer + adsCustomer,
  });
}
