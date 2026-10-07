import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workspaceOperationalHealth } from "@/lib/operations";
import { escalateOverdueIncidents, observeCriticalIssue } from "@/lib/incidents";
import { renderOperationalIncidentEmail } from "@/lib/email";
import { paypalRequest } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const recentCutoff = new Date(Date.now() - 50 * 60 * 1000);
  const workspaces = await prisma.workspace.findMany({
    where: { operationalSnapshots: { none: { createdAt: { gte: recentCutoff } } } },
    select: { id: true },
    orderBy: { id: "asc" },
    take: 100,
  });
  const totals = { healthy: 0, degraded: 0, critical: 0 };
  let incidentsOpened = 0;
  for (const workspace of workspaces) {
    const health = await workspaceOperationalHealth(workspace.id);
    await prisma.operationalSnapshot.create({
      data: { workspaceId: workspace.id, status: health.status, metrics: health.metrics, issues: health.issues },
    });
    totals[health.status as keyof typeof totals]++;
    for (const issue of health.issues.filter((item) => item.severity === "critical")) {
      const observed = await observeCriticalIssue(workspace.id, issue);
      if (observed.created) {
        incidentsOpened++;
        const owner = observed.incident.ownerMember?.user;
        if (owner?.email) {
          const workspaceRecord = await prisma.workspace.findUnique({ where: { id: workspace.id }, select: { name: true } });
          await prisma.outboundEmail.create({ data: { userId: owner.id, recipient: owner.email, type: `operational_incident_opened:${observed.incident.id}`, subject: `[${observed.incident.severity.toUpperCase()}] ${observed.incident.title}`, html: renderOperationalIncidentEmail({ name: owner.name, workspaceName: workspaceRecord?.name || "Workspace", title: observed.incident.title, severity: observed.incident.severity, incidentUrl: "https://wazap.lt/operations" }) } });
        }
      }
    }
  }
  const escalated = await escalateOverdueIncidents();
  for (const incident of escalated) {
    const owner = incident.ownerMember?.user;
    if (owner?.email) await prisma.outboundEmail.create({ data: { userId: owner.id, recipient: owner.email, type: `operational_incident_escalated:${incident.id}`, subject: `[OVERDUE ${incident.severity.toUpperCase()}] ${incident.title}`, html: renderOperationalIncidentEmail({ name: owner.name, workspaceName: incident.workspace.name, title: incident.title, severity: incident.severity, incidentUrl: "https://wazap.lt/operations", escalated: true }) } });
  }
  // A browser can close after PayPal creates a subscription but before approval.
  // Keep genuine pending subscriptions untouched; only close records PayPal
  // explicitly says no longer exist.
  const stalePendingPayments = await prisma.payment.findMany({
    where: {
      method: "paypal",
      status: "pending",
      txId: { startsWith: "I-" },
      createdAt: { lte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    },
    select: { id: true, txId: true },
    take: 25,
  });
  let missingPayPalSubscriptions = 0;
  for (const payment of stalePendingPayments) {
    try {
      await paypalRequest<Record<string, unknown>>(`/v1/billing/subscriptions/${payment.txId}`);
    } catch (error) {
      if (error instanceof Error && error.message.includes("failed: 404")) {
        const updated = await prisma.payment.updateMany({
          where: { id: payment.id, status: "pending" },
          data: { status: "provider_not_found" },
        });
        missingPayPalSubscriptions += updated.count;
      }
    }
  }
  const [, expiredIdempotencyRecords, expiredPartnerTouches] = await prisma.$transaction([
    prisma.operationalSnapshot.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 90 * 86_400_000) } },
    }),
    prisma.apiIdempotencyRecord.deleteMany({
      where: { expiresAt: { lte: new Date() } },
    }),
    prisma.partnerReferralTouch.deleteMany({ where: { OR: [{ expiresAt: { lte: new Date() }, claimedAt: null }, { claimedAt: { lte: new Date(Date.now() - 365 * 86_400_000) } }] } }),
  ]);
  return NextResponse.json({
    ok: true,
    workspaces: workspaces.length,
    totals,
    incidentsOpened,
    incidentsEscalated: escalated.length,
    expiredIdempotencyRecords: expiredIdempotencyRecords.count,
    expiredPartnerTouches: expiredPartnerTouches.count,
    stalePayPalChecked: stalePendingPayments.length,
    missingPayPalSubscriptions,
  });
}
