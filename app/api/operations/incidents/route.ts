import { NextResponse } from "next/server";
import { currentInboxContext, cleanInboxText, validWorkspaceMember } from "@/lib/inbox";
import { INCIDENT_AUDIENCES, INCIDENT_SEVERITIES, INCIDENT_STATUSES, incidentTargets } from "@/lib/incidents";
import { marketplaceMutationAllowed } from "@/lib/marketplace";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const incidents = await prisma.operationalIncident.findMany({ where: { workspaceId: ctx.workspaceId }, orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100, include: { ownerMember: { select: { id: true, user: { select: { name: true, email: true } } } }, updates: { orderBy: { createdAt: "desc" }, take: 20, include: { actorMember: { select: { user: { select: { name: true } } } } } } } });
  return NextResponse.json({ incidents, policy: { severities: INCIDENT_SEVERITIES, statuses: INCIDENT_STATUSES, audiences: INCIDENT_AUDIENCES, targets: { sev1: { acknowledgeMinutes: 15, updateMinutes: 30 }, sev2: { acknowledgeMinutes: 30, updateMinutes: 60 }, sev3: { acknowledgeMinutes: 240, updateMinutes: 1440 } } }, role: ctx.role, memberId: ctx.memberId });
}

export async function POST(req: Request) {
  if (!marketplaceMutationAllowed(req)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
  if (!rateLimit(`incident-create:${ctx.workspaceId}`, 10, 60_000)) return NextResponse.json({ error: "Too many incident changes." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const title = cleanInboxText(body.title, 160), summary = cleanInboxText(body.summary, 2000), impact = cleanInboxText(body.impact, 2000);
  if (title.length < 5 || summary.length < 10) return NextResponse.json({ error: "Provide a clear title and summary." }, { status: 400 });
  const targets = incidentTargets(String(body.severity || "sev3"));
  const owner = body.ownerMemberId ? await validWorkspaceMember(ctx.workspaceId, body.ownerMemberId) : await validWorkspaceMember(ctx.workspaceId, ctx.memberId);
  if (!owner) return NextResponse.json({ error: "Assign an incident owner from this workspace." }, { status: 400 });
  const incident = await prisma.$transaction(async (tx) => {
    const created = await tx.operationalIncident.create({ data: { workspaceId: ctx.workspaceId, ownerMemberId: owner.id, title, summary, impact, severity: targets.severity, source: "manual", responseTargetAt: targets.responseTargetAt, nextUpdateAt: targets.nextUpdateAt } });
    await tx.incidentUpdate.create({ data: { incidentId: created.id, actorMemberId: ctx.memberId, status: "investigating", message: summary, audience: "internal" } });
    await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: "operational_incident_opened", actorUserId: ctx.userId, metadata: { incidentId: created.id, severity: created.severity, ownerMemberId: owner.id, responseTargetAt: created.responseTargetAt } } });
    return created;
  });
  return NextResponse.json({ incident }, { status: 201 });
}

export async function PATCH(req: Request) {
  if (!marketplaceMutationAllowed(req)) return NextResponse.json({ error: "Cross-site request rejected." }, { status: 403 });
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`incident-update:${ctx.workspaceId}`, 30, 60_000)) return NextResponse.json({ error: "Too many incident changes." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const incident = await prisma.operationalIncident.findFirst({ where: { id: String(body.id || ""), workspaceId: ctx.workspaceId } });
  if (!incident) return NextResponse.json({ error: "Incident not found." }, { status: 404 });
  if (!['owner', 'admin'].includes(ctx.role) && incident.ownerMemberId !== ctx.memberId) return NextResponse.json({ error: "Only the incident owner or a workspace administrator can update it." }, { status: 403 });
  const status = INCIDENT_STATUSES.includes(body.status) ? String(body.status) : incident.status;
  const message = cleanInboxText(body.message, 3000), resolution = cleanInboxText(body.resolution, 3000);
  if (!message && status === incident.status && body.ownerMemberId === undefined) return NextResponse.json({ error: "Provide an update, status change, or owner assignment." }, { status: 400 });
  if (status === "resolved" && resolution.length < 20) return NextResponse.json({ error: "A specific resolution of at least 20 characters is required." }, { status: 400 });
  const assigned = body.ownerMemberId !== undefined ? await validWorkspaceMember(ctx.workspaceId, body.ownerMemberId) : null;
  if (body.ownerMemberId !== undefined && !assigned) return NextResponse.json({ error: "Incident owner must belong to this workspace." }, { status: 400 });
  const audience = INCIDENT_AUDIENCES.includes(body.audience) ? String(body.audience) : "internal";
  const now = new Date(), target = incidentTargets(incident.severity, now);
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.operationalIncident.update({ where: { id: incident.id }, data: { status, ...(assigned ? { ownerMemberId: assigned.id } : {}), acknowledgedAt: incident.acknowledgedAt || now, nextUpdateAt: status === "resolved" ? now : target.nextUpdateAt, resolvedAt: status === "resolved" ? now : null, resolution: status === "resolved" ? resolution : null } });
    await tx.incidentUpdate.create({ data: { incidentId: incident.id, actorMemberId: ctx.memberId, status, message: message || (status === "resolved" ? resolution : `Incident assigned to ${assigned?.id}.`), audience } });
    await tx.workspaceAuditEvent.create({ data: { workspaceId: ctx.workspaceId, eventType: status === "resolved" ? "operational_incident_resolved" : "operational_incident_updated", actorUserId: ctx.userId, metadata: { incidentId: incident.id, status, audience, ownerMemberId: assigned?.id || incident.ownerMemberId } } });
    return changed;
  });
  return NextResponse.json({ incident: updated });
}
