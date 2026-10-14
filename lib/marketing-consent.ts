// Shared "email consent for broadcasts" logic (FEAT-CONSENT). Every entry
// point that grants or withdraws marketing consent (signup checkbox,
// dashboard banner, account settings switch, admin CRM editing) goes through
// grantMarketingConsent / withdrawMarketingConsent so the proof trail and the
// suppression rules stay consistent. See lib/crm-marketing.ts for the
// existing broadcast-eligibility and unsubscribe plumbing this builds on.
import type { Prisma } from "@prisma/client";
import { captureCrmLead } from "./crm";
import { unsubscribeLead } from "./crm-marketing";

export type ConsentSource = "signup_checkbox" | "dashboard_banner" | "account_settings";

// The exact, user-facing wording for each entry point. Stored verbatim in the
// consent evidence so "what did the person actually agree to" is provable.
export const CONSENT_WORDING: Record<ConsentSource, string> = {
  signup_checkbox: "Send me early access to new features and member-only offers. You can stop anytime.",
  dashboard_banner: "Get early access to new features and member-only offers?",
  account_settings: "Product news and offers by email",
};

export type GrantConsentInput = {
  userId?: string | null;
  email: string;
  name?: string | null;
  source: ConsentSource;
  wording?: string;
  ip?: string | null;
  userAgent?: string | null;
};

// Upserts the CrmLead (reusing the same helper every public form uses),
// records dated + worded consent evidence, marks it subscribed, and clears
// User.marketingOptOutAt. Refuses (no-op, returns false) for a lead that
// bounced/complained (emailSuppressedAt) or is marked doNotContact - those
// must never be silently resubscribed.
export async function grantMarketingConsent(tx: Prisma.TransactionClient, input: GrantConsentInput): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const lead = await captureCrmLead(tx, { name: input.name || email, email, source: input.source });
  if (lead.emailSuppressedAt || lead.doNotContact) return false;
  const evidence = JSON.stringify({
    wording: input.wording || CONSENT_WORDING[input.source],
    ip: input.ip || null,
    userAgent: input.userAgent || null,
    at: new Date().toISOString(),
  });
  await tx.crmLead.update({
    where: { id: lead.id },
    data: { marketingStatus: "subscribed", consentAt: new Date(), consentSource: input.source, consentEvidence: evidence, unsubscribedAt: null },
  });
  await tx.crmActivity.create({ data: { leadId: lead.id, kind: "permission", body: `Marketing consent granted through ${input.source}.` } });
  if (input.userId) await tx.user.update({ where: { id: input.userId }, data: { marketingOptOutAt: null } });
  else await tx.user.updateMany({ where: { email: { equals: email, mode: "insensitive" } }, data: { marketingOptOutAt: null } });
  return true;
}

export type WithdrawConsentInput = { userId?: string | null; email: string; reason?: string };

// Mirrors the unsubscribe-link behaviour: if a CrmLead exists it is marked
// unsubscribed (which itself sets User.marketingOptOutAt); otherwise this
// just sets the opt-out flag directly so "No thanks" is recorded even before
// any lead exists.
export async function withdrawMarketingConsent(tx: Prisma.TransactionClient, input: WithdrawConsentInput): Promise<boolean> {
  const email = input.email.trim().toLowerCase();
  const lead = await tx.crmLead.findUnique({ where: { email } });
  if (lead) {
    await unsubscribeLead(tx, lead.id, input.reason || "Marketing consent withdrawn.");
    return true;
  }
  if (input.userId) await tx.user.update({ where: { id: input.userId }, data: { marketingOptOutAt: new Date() } });
  else await tx.user.updateMany({ where: { email: { equals: email, mode: "insensitive" } }, data: { marketingOptOutAt: new Date() } });
  return true;
}

// Pure decision helper for the dashboard banner: show it only to a logged-in,
// non-admin user who has never answered - no active subscription, no
// recorded opt-out, and not suppressed/doNotContact. A missing lead (e.g. a
// Google sign-up, which never goes through the CRM capture helper) counts as
// "not answered" too, so the banner covers that path.
export function shouldShowConsentBanner(input: {
  isAdmin?: boolean | null;
  marketingOptOutAt?: Date | null;
  lead?: { marketingStatus: string; doNotContact: boolean; emailSuppressedAt: Date | null } | null;
}): boolean {
  if (input.isAdmin) return false;
  if (input.marketingOptOutAt) return false;
  if (input.lead?.doNotContact) return false;
  if (input.lead?.emailSuppressedAt) return false;
  if (input.lead?.marketingStatus === "subscribed") return false;
  return true;
}
