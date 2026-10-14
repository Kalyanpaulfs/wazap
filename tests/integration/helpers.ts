// Shared helpers for the billing state-machine integration tests. No network
// calls happen from here - lib/paypal and lib/dodo are mocked with vi.mock in
// each test file; this module only talks to the real local Postgres (wazap_dev).
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { ensurePersonalWorkspace } from "@/lib/workspaces";
import type { ChargeResult, LifecycleResult } from "./typed-calls";

// Type-narrowing assertions for the discriminated-union results returned by
// tests/integration/typed-calls.ts (chargeOnce/lifecycleOnce), so tests can
// access e.g. `.cancelOld` or `.scheduledActivated` without `as any` while
// still failing loudly (via a normal vitest assertion) if the event was
// unexpectedly a duplicate/stale.
export function assertNotDuplicate(result: ChargeResult): asserts result is Extract<ChargeResult, { duplicate: false }> {
  expect(result.duplicate).toBe(false);
}

export function assertLifecycleApplied(result: LifecycleResult): asserts result is Extract<LifecycleResult, { duplicate: false; stale: false }> {
  expect(result.duplicate).toBe(false);
  expect(result.stale).toBe(false);
}

export function uid(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

export function testEmail() {
  return `itest+${randomUUID()}@example.test`;
}

export type TestUser = {
  id: string;
  email: string;
  name: string | null;
  plan: string;
  planExpiresAt: Date | null;
};

export async function createTestUser(opts: {
  plan?: string;
  planExpiresAt?: Date | null;
  trialEndsAt?: Date | null;
  trialPlan?: string | null;
} = {}): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      email: testEmail(),
      name: "Integration Test",
      plan: opts.plan ?? "free",
      planExpiresAt: opts.planExpiresAt ?? null,
      trialEndsAt: opts.trialEndsAt ?? null,
      trialPlan: opts.trialPlan ?? null,
    },
  });
  return user;
}

// Deletes every row a test may have created for this user, in FK-safe order.
// Payment -> SecurityPaymentCharge has an ON DELETE RESTRICT FK, so charges
// must go first. BillingPlanChange/BillingRefund/BillingAuditLog/
// BillingAttention carry a bare userId string (no DB-level FK) and must be
// cleaned up explicitly - deleting the User row does not touch them.
export async function cleanupUser(userId: string, opts: { email?: string; billingEventIds?: string[] } = {}) {
  const payments = await prisma.payment.findMany({ where: { userId }, select: { id: true } });
  const paymentIds = payments.map((p) => p.id);
  if (paymentIds.length) {
    await prisma.securityPaymentCharge.deleteMany({ where: { paymentId: { in: paymentIds } } });
    await prisma.billingRefund.deleteMany({ where: { paymentId: { in: paymentIds } } });
  }
  await prisma.payment.deleteMany({ where: { userId } });
  await prisma.billingPlanChange.deleteMany({ where: { userId } });
  await prisma.billingAuditLog.deleteMany({ where: { userId } });
  await prisma.billingAttention.deleteMany({ where: { userId } });
  await prisma.outboundEmail.deleteMany({ where: { userId } });
  if (opts.billingEventIds?.length) {
    await prisma.securityBillingEvent.deleteMany({ where: { eventId: { in: opts.billingEventIds } } });
  }
  const email = opts.email;
  if (email) {
    const lead = await prisma.crmLead.findUnique({ where: { email: email.toLowerCase() } });
    if (lead) await prisma.crmLead.delete({ where: { id: lead.id } }); // cascades CrmActivity
  }
  // User delete cascades: Workspace (owner), WorkspaceMember, RotatorLink,
  // ShortLink, AdLink, LinktreePage, CatalogPage, SecuritySubscriptionState,
  // SecurityUserBilling, AutomationRule (via Workspace cascade), etc.
  await prisma.user.deleteMany({ where: { id: userId } });
}

export async function getWorkspaceId(userId: string) {
  const membership = await ensurePersonalWorkspace(userId);
  return membership.workspaceId;
}

// process.env mutation scoped to a single test; always restored, even on
// failure, so one test's flags never leak into the next.
export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 86_400_000);
}

export async function getUser(userId: string) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId } });
}

export async function getPointer(userId: string) {
  return prisma.securityUserBilling.findUnique({ where: { userId } });
}

export async function getPlanChange(userId: string) {
  return prisma.billingPlanChange.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function paymentByTx(userId: string, method: string, txId: string) {
  return prisma.payment.findFirst({ where: { userId, method, txId }, orderBy: { createdAt: "desc" } });
}
