import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOOL_LIMITS } from "@/lib/tool-access";
import { recordFunnelEvent } from "@/lib/funnel";
import { rateLimit } from "@/lib/rate-limit";
import { getActiveWorkspace } from "@/lib/workspaces";
import { enqueueWebhookEvent } from "@/lib/developer-platform";
import { effectivePlan } from "@/lib/entitlements";
import { runAutomations } from "@/lib/automations";

export const dynamic = "force-dynamic";

const STATUSES = ["new", "contacted", "qualified", "proposal", "won", "lost"] as const;
type LeadStatus = (typeof STATUSES)[number];

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanPhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "").slice(0, 15);
}

function cleanDate(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function cleanValue(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(parsed, 1_000_000_000) : null;
}

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = (session.user as { id?: string }).id;
  if (!id) return null;
  const membership = await getActiveWorkspace(id);
  const owner = await prisma.user.findUnique({ where: { id: membership.workspace.ownerId }, select: { plan: true, trialPlan: true, trialEndsAt: true } });
  return { id, workspaceId: membership.workspaceId, workspaceName: membership.workspace.name, role: membership.role, plan: effectivePlan(owner) };
}

export async function GET() {
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "Sign in to use Wazap Flow." }, { status: 401 });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [leads, wonLeads, conversationStarts, sourceStarts] = await Promise.all([
    prisma.lead.findMany({
      where: { workspaceId: user.workspaceId, archivedAt: null },
      orderBy: [{ nextFollowUpAt: "asc" }, { updatedAt: "desc" }],
      include: { activities: { orderBy: { createdAt: "desc" }, take: 5 } },
    }),
    prisma.lead.findMany({
      where: { workspaceId: user.workspaceId, status: "won" },
      select: { estimatedValue: true },
    }),
    prisma.conversationStart.count({ where: { workspaceId: user.workspaceId, createdAt: { gte: since } } }),
    prisma.conversationStart.groupBy({
      by: ["source"],
      where: { workspaceId: user.workspaceId, createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
      take: 5,
    }),
  ]);
  const open = leads.filter((lead) => !["won", "lost"].includes(lead.status));
  return NextResponse.json({
    leads,
    plan: user.plan,
    workspace: { id: user.workspaceId, name: user.workspaceName, role: user.role },
    limit: leadLimit(user.plan),
    metrics: {
      conversationStarts30d: conversationStarts,
      openPipelineValue: open.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0), 0),
      wonValue: wonLeads.reduce((sum, lead) => sum + (lead.estimatedValue ?? 0), 0),
      wonCount: wonLeads.length,
      sourceStarts: sourceStarts.map((row) => ({ source: row.source || "Direct", count: row._count._all })),
    },
  });
}

function leadLimit(plan: string) {
  const limits = TOOL_LIMITS.leads;
  if (plan === "business") plan = "ultimate";
  return (limits[plan as keyof typeof limits] ?? limits.free).uses;
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "Sign in to save and track leads." }, { status: 401 });
  if (!rateLimit(`leads:create:${user.id}`, 30, 60_000)) return NextResponse.json({ error: "Too many lead changes. Please wait a minute." }, { status: 429 });

  const limit = leadLimit(user.plan);
  if (limit !== -1) {
    const count = await prisma.lead.count({ where: { workspaceId: user.workspaceId, archivedAt: null, status: { notIn: ["won", "lost"] } } });
    if (count >= limit) {
      return NextResponse.json({ error: `Your ${user.plan} plan supports ${limit} active leads. Archive a lead or upgrade for more.`, upgrade: true }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const name = cleanText(body.name, 100);
  const phone = cleanPhone(body.phone);
  if (!name || phone.length < 7) {
    return NextResponse.json({ error: "A lead name and valid WhatsApp number are required." }, { status: 400 });
  }

  const status = STATUSES.includes(body.status as LeadStatus) ? body.status as LeadStatus : "new";
  const lead = await prisma.lead.create({
    data: {
      userId: user.id,
      workspaceId: user.workspaceId,
      name,
      phone,
      email: cleanText(body.email, 160) || null,
      source: cleanText(body.source, 80) || "Manual",
      campaign: cleanText(body.campaign, 100) || null,
      status,
      owner: cleanText(body.owner, 100) || null,
      estimatedValue: cleanValue(body.estimatedValue),
      currency: cleanText(body.currency, 3).toUpperCase() || "USD",
      nextFollowUpAt: cleanDate(body.nextFollowUpAt),
      notes: cleanText(body.notes, 2000),
      activities: {
        create: { type: "created", body: "Lead added to Wazap Flow" },
      },
    },
    include: { activities: true },
  });
  await recordFunnelEvent("first_tool_success", { userId: user.id, source: "lead_tracker" });
  await enqueueWebhookEvent(user.workspaceId, "lead.created", { leadId: lead.id, name: lead.name, source: lead.source });
  await runAutomations({ workspaceId: user.workspaceId, eventKey: `lead-created:${lead.id}`, trigger: "lead.created", leadId: lead.id, source: lead.source, leadStatus: lead.status });
  return NextResponse.json(lead, { status: 201 });
}

export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = user.id;
  if (!rateLimit(`leads:update:${user.id}`, 120, 60_000)) return NextResponse.json({ error: "Too many lead changes. Please wait a minute." }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const id = cleanText(body.id, 64);
  if (!id) return NextResponse.json({ error: "Lead ID is required." }, { status: 400 });

  const existing = await prisma.lead.findFirst({ where: { id, workspaceId: user.workspaceId, archivedAt: null } });
  if (!existing) return NextResponse.json({ error: "Lead not found." }, { status: 404 });

  const status = STATUSES.includes(body.status as LeadStatus) ? body.status as LeadStatus : undefined;
  const effectiveStatus = body.markContacted
    ? (status ?? (["won", "lost"].includes(existing.status) ? existing.status : "contacted"))
    : (status ?? existing.status);
  const activityType = body.markContacted ? "conversation_started" : status && status !== existing.status ? "status_changed" : "updated";
  const activityBody = body.markContacted
    ? "WhatsApp follow-up opened"
    : status && status !== existing.status
      ? `Stage changed from ${existing.status} to ${status}`
      : cleanText(body.activityBody, 500) || "Lead details updated";

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.lead.update({
      where: { id },
      data: {
      ...(body.name !== undefined ? { name: cleanText(body.name, 100) } : {}),
      ...(body.phone !== undefined ? { phone: cleanPhone(body.phone) } : {}),
      ...(body.email !== undefined ? { email: cleanText(body.email, 160) || null } : {}),
      ...(body.source !== undefined ? { source: cleanText(body.source, 80) || "Manual" } : {}),
      ...(body.campaign !== undefined ? { campaign: cleanText(body.campaign, 100) || null } : {}),
      ...(status ? { status } : {}),
      ...(body.owner !== undefined ? { owner: cleanText(body.owner, 100) || null } : {}),
      ...(body.estimatedValue !== undefined ? { estimatedValue: cleanValue(body.estimatedValue) } : {}),
      ...(body.currency !== undefined ? { currency: cleanText(body.currency, 3).toUpperCase() || "USD" } : {}),
      ...(body.nextFollowUpAt !== undefined ? { nextFollowUpAt: cleanDate(body.nextFollowUpAt) } : {}),
      ...(body.notes !== undefined ? { notes: cleanText(body.notes, 2000) } : {}),
      ...(body.lostReason !== undefined ? { lostReason: cleanText(body.lostReason, 500) || null } : {}),
      ...(body.markContacted ? { lastContactedAt: new Date(), status: effectiveStatus } : {}),
      ...(status ? { status, closedAt: ["won", "lost"].includes(status) ? new Date() : null } : {}),
      },
    });
    await tx.leadActivity.create({ data: { leadId: id, type: activityType, body: activityBody } });
    if (body.markContacted) {
      await tx.conversationStart.create({
        data: {
          userId,
          workspaceId: user.workspaceId,
          leadId: id,
          assetType: "direct",
          assetName: "Lead follow-up",
          source: existing.source,
          campaign: existing.campaign,
          destination: existing.phone,
        },
      });
    }
    return updated;
  });
  await enqueueWebhookEvent(user.workspaceId, "lead.updated", { leadId: result.id, status: result.status, owner: result.owner });
  await runAutomations({ workspaceId: user.workspaceId, eventKey: `lead-updated:${result.id}:${Date.now()}`, trigger: "lead.updated", leadId: result.id, source: result.source, leadStatus: result.status });
  return NextResponse.json({ success: true, lead: result });
}

export async function DELETE(req: Request) {
  const user = await currentUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`leads:delete:${user.id}`, 30, 60_000)) return NextResponse.json({ error: "Too many lead changes. Please wait a minute." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const id = cleanText(body.id, 64);
  const result = await prisma.lead.updateMany({ where: { id, workspaceId: user.workspaceId, archivedAt: null }, data: { archivedAt: new Date() } });
  if (!result.count) return NextResponse.json({ error: "Lead not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
