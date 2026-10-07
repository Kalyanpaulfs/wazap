import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentInboxContext, cleanInboxText } from "@/lib/inbox";
import { effectivePlan } from "@/lib/entitlements";
import {
  AUTOMATION_LIMITS,
  AUTOMATION_STARTER_PACKS,
  AUTOMATION_TRIGGERS,
  cleanActions,
  cleanConditions,
} from "@/lib/automations";
import { rateLimit } from "@/lib/rate-limit";
async function context() {
  const ctx = await currentInboxContext();
  if (!ctx) return null;
  const owner = await prisma.workspace.findUnique({
    where: { id: ctx.workspaceId },
    select: {
      owner: { select: { plan: true, trialPlan: true, trialEndsAt: true } },
    },
  });
  return owner ? { ...ctx, plan: effectivePlan(owner.owner) } : null;
}
export async function GET() {
  const ctx = await context();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [rules, runs, members] = await Promise.all([
    prisma.automationRule.findMany({
      where: { workspaceId: ctx.workspaceId, archivedAt: null },
      orderBy: { createdAt: "desc" },
    }),
    prisma.automationRun.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { rule: { select: { name: true } } },
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: ctx.workspaceId },
      select: {
        id: true,
        role: true,
        user: { select: { name: true, email: true } },
      },
    }),
  ]);
  return NextResponse.json({
    rules,
    runs,
    members,
    role: ctx.role,
    plan: ctx.plan,
    limit: AUTOMATION_LIMITS[ctx.plan] || 1,
    triggers: AUTOMATION_TRIGGERS,
    starterPacks: Object.entries(AUTOMATION_STARTER_PACKS).map(
      ([id, pack]) => ({
        id,
        name: pack.name,
        description: pack.description,
        rules: pack.rules.length,
      }),
    ),
    allowedActions: [
      "set_priority",
      "add_tag",
      "assign_member",
      "create_task",
      "set_lead_status",
      "schedule_follow_up",
      "create_handoff",
    ],
    safety: { outboundMessaging: false, defaultMode: "dry_run" },
  });
}
export async function POST(req: Request) {
  const ctx = await context();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`automation:${ctx.workspaceId}`, 20, 60_000))
    return NextResponse.json(
      { error: "Too many automation changes." },
      { status: 429 },
    );
  const body = await req.json().catch(() => ({}));
  const count = await prisma.automationRule.count({
      where: { workspaceId: ctx.workspaceId, archivedAt: null },
    }),
    limit = AUTOMATION_LIMITS[ctx.plan] || 1;
  if (body.packId) {
    const pack = AUTOMATION_STARTER_PACKS[String(body.packId)];
    if (!pack)
      return NextResponse.json(
        { error: "Starter pack not found." },
        { status: 404 },
      );
    if (count + pack.rules.length > limit)
      return NextResponse.json(
        {
          error: `This pack needs ${pack.rules.length} rule slots; your ${ctx.plan} plan has ${Math.max(0, limit - count)} available.`,
          upgrade: true,
        },
        { status: 403 },
      );
    const duplicate = await prisma.automationRule.findFirst({
      where: {
        workspaceId: ctx.workspaceId,
        archivedAt: null,
        name: { in: pack.rules.map((rule) => rule.name) },
      },
    });
    if (duplicate)
      return NextResponse.json(
        { error: "This starter pack is already installed." },
        { status: 409 },
      );
    await prisma.automationRule.createMany({
      data: pack.rules.map((rule) => ({
        workspaceId: ctx.workspaceId,
        createdByMemberId: ctx.memberId,
        name: rule.name,
        trigger: rule.trigger,
        conditions: cleanConditions(rule.conditions),
        actions: cleanActions(rule.actions),
        runMode: "dry_run",
        status: "draft",
      })),
    });
    return NextResponse.json(
      {
        installed: true,
        count: pack.rules.length,
        notice: `${pack.name} installed as disabled dry-run rules. Review and activate each rule when ready.`,
      },
      { status: 201 },
    );
  }
  if (count >= limit)
    return NextResponse.json(
      {
        error: `Your ${ctx.plan} plan supports ${limit} automation rule${limit === 1 ? "" : "s"}.`,
        upgrade: true,
      },
      { status: 403 },
    );
  const name = cleanInboxText(body.name, 100),
    trigger = AUTOMATION_TRIGGERS.includes(body.trigger) ? body.trigger : "";
  const actions = cleanActions(body.actions);
  if (!name || !trigger || !actions.length)
    return NextResponse.json(
      {
        error:
          "Name, supported trigger, and at least one safe action are required.",
      },
      { status: 400 },
    );
  const rule = await prisma.automationRule.create({
    data: {
      workspaceId: ctx.workspaceId,
      createdByMemberId: ctx.memberId,
      name,
      trigger,
      conditions: cleanConditions(body.conditions),
      actions,
      runMode: "dry_run",
      status: "draft",
    },
  });
  return NextResponse.json(
    {
      rule,
      notice:
        "Rule created as a disabled dry run. An owner or admin must activate it.",
    },
    { status: 201 },
  );
}
export async function PATCH(req: Request) {
  const ctx = await context();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const rule = await prisma.automationRule.findFirst({
      where: { id: String(body.id || ""), workspaceId: ctx.workspaceId, archivedAt: null },
  });
  if (!rule)
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  const activating = body.status === "active" || body.runMode === "live";
  if (activating && !["owner", "admin"].includes(ctx.role))
    return NextResponse.json(
      {
        error:
          "Workspace owner or admin approval is required to activate live automation.",
      },
      { status: 403 },
    );
  const status = ["draft", "active", "paused"].includes(body.status)
    ? body.status
    : undefined;
  const runMode = ["dry_run", "live"].includes(body.runMode)
    ? body.runMode
    : undefined;
  const updated = await prisma.automationRule.update({
    where: { id: rule.id },
    data: {
      ...(body.name !== undefined
        ? { name: cleanInboxText(body.name, 100) }
        : {}),
      ...(status ? { status } : {}),
      ...(runMode ? { runMode } : {}),
      ...(body.conditions !== undefined
        ? { conditions: cleanConditions(body.conditions) }
        : {}),
      ...(body.actions !== undefined
        ? { actions: cleanActions(body.actions) }
        : {}),
    },
  });
  return NextResponse.json({ rule: updated });
}
export async function DELETE(req: Request) {
  const ctx = await context();
  if (!ctx)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "admin"].includes(ctx.role))
    return NextResponse.json(
      { error: "Owner or admin access required." },
      { status: 403 },
    );
  const body = await req.json().catch(() => ({}));
  const result = await prisma.automationRule.deleteMany({
    where: { id: String(body.id || ""), workspaceId: ctx.workspaceId, archivedAt: null },
  });
  if (!result.count)
    return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}
