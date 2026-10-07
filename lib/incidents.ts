import { prisma } from "@/lib/prisma";

export const INCIDENT_SEVERITIES = ["sev1", "sev2", "sev3"] as const;
export const INCIDENT_STATUSES = ["investigating", "identified", "monitoring", "resolved"] as const;
export const INCIDENT_AUDIENCES = ["internal", "customer"] as const;

const TARGETS = {
  sev1: { acknowledgeMinutes: 15, updateMinutes: 30 },
  sev2: { acknowledgeMinutes: 30, updateMinutes: 60 },
  sev3: { acknowledgeMinutes: 240, updateMinutes: 1440 },
};

export function incidentTargets(severity: string, from = new Date()) {
  const level = INCIDENT_SEVERITIES.includes(severity as (typeof INCIDENT_SEVERITIES)[number]) ? severity as keyof typeof TARGETS : "sev3";
  return {
    severity: level,
    responseTargetAt: new Date(from.getTime() + TARGETS[level].acknowledgeMinutes * 60_000),
    nextUpdateAt: new Date(from.getTime() + TARGETS[level].updateMinutes * 60_000),
    acknowledgeMinutes: TARGETS[level].acknowledgeMinutes,
    updateMinutes: TARGETS[level].updateMinutes,
  };
}

const ISSUE_TITLES: Record<string, string> = {
  API_5XX: "Elevated API server errors",
  WEBHOOK_FAILURES: "Terminal webhook delivery failures",
  STUCK_CAMPAIGNS: "WhatsApp campaigns are stuck",
  UNCERTAIN_CAMPAIGN_DELIVERIES: "Campaign delivery state is uncertain",
  AUTOMATION_FAILURES: "Elevated automation failures",
};

export async function observeCriticalIssue(workspaceId: string, issue: { code: string; count: number }) {
  const sourceKey = `health:${issue.code}`;
  const existing = await prisma.operationalIncident.findFirst({
    where: { workspaceId, sourceKey, status: { not: "resolved" } },
    include: { ownerMember: { include: { user: { select: { id: true, email: true, name: true } } } } },
  });
  if (existing) {
    await prisma.operationalIncident.update({ where: { id: existing.id }, data: { lastObservedAt: new Date(), impact: `${issue.count} event${issue.count === 1 ? "" : "s"} detected in the current health window.` } });
    return { incident: existing, created: false };
  }
  const owner = await prisma.workspaceMember.findFirst({ where: { workspaceId, role: "owner" }, include: { user: { select: { id: true, email: true, name: true } } } });
  const now = new Date(), targets = incidentTargets("sev1", now);
  const incident = await prisma.$transaction(async (tx) => {
    const created = await tx.operationalIncident.create({ data: { workspaceId, ownerMemberId: owner?.id, title: ISSUE_TITLES[issue.code] || issue.code.replaceAll("_", " "), summary: "Automatically opened from workspace health evidence.", impact: `${issue.count} event${issue.count === 1 ? "" : "s"} detected in the current health window.`, severity: "sev1", source: "monitor", sourceKey, responseTargetAt: targets.responseTargetAt, nextUpdateAt: targets.nextUpdateAt, lastObservedAt: now } });
    await tx.incidentUpdate.create({ data: { incidentId: created.id, status: "investigating", message: `Monitor opened this incident after detecting ${issue.count} ${issue.code} event${issue.count === 1 ? "" : "s"}.`, audience: "internal" } });
    await tx.workspaceAuditEvent.create({ data: { workspaceId, eventType: "operational_incident_opened", metadata: { incidentId: created.id, sourceKey, severity: "sev1", ownerMemberId: owner?.id || null, responseTargetAt: targets.responseTargetAt } } });
    return created;
  });
  return { incident: { ...incident, ownerMember: owner }, created: true };
}

export async function escalateOverdueIncidents() {
  const now = new Date();
  const incidents = await prisma.operationalIncident.findMany({
    where: { status: { not: "resolved" }, acknowledgedAt: null, escalatedAt: null, responseTargetAt: { lte: now } },
    include: { workspace: { select: { name: true } }, ownerMember: { include: { user: { select: { id: true, email: true, name: true } } } } },
    take: 100,
  });
  for (const item of incidents) {
    await prisma.$transaction([
      prisma.operationalIncident.update({ where: { id: item.id }, data: { escalatedAt: now, nextUpdateAt: now } }),
      prisma.incidentUpdate.create({ data: { incidentId: item.id, status: item.status, message: "Acknowledgement target missed; incident escalated to the workspace owner.", audience: "internal" } }),
      prisma.workspaceAuditEvent.create({ data: { workspaceId: item.workspaceId, eventType: "operational_incident_escalated", metadata: { incidentId: item.id, severity: item.severity, responseTargetAt: item.responseTargetAt } } }),
    ]);
  }
  return incidents;
}
