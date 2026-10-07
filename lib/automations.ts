import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const AUTOMATION_TRIGGERS = [
  "conversation.created",
  "message.received",
  "conversation.updated",
  "lead.created",
  "lead.updated",
  "scheduled.daily",
] as const;
export const AUTOMATION_ACTIONS = [
  "set_priority",
  "add_tag",
  "assign_member",
  "create_task",
  "set_lead_status",
  "schedule_follow_up",
  "create_handoff",
] as const;
export const AUTOMATION_LIMITS: Record<string, number> = {
  free: 1,
  basic: 3,
  pro: 10,
  ultimate: 30,
  business: 100,
};

export type AutomationEvent = {
  workspaceId: string;
  eventKey: string;
  trigger: string;
  conversationId?: string | null;
  leadId?: string | null;
  text?: string | null;
  channel?: string | null;
  priority?: string | null;
  source?: string | null;
  leadStatus?: string | null;
};
type Conditions = {
  channels?: string[];
  textAny?: string[];
  priorities?: string[];
  sources?: string[];
  leadStatuses?: string[];
  onlyUnassigned?: boolean;
  inactivityHours?: number;
};
type Action = {
  type: string;
  value?: string;
  memberId?: string;
  title?: string;
  dueInHours?: number;
  hours?: number;
  severity?: string;
};

export const AUTOMATION_STARTER_PACKS: Record<
  string,
  {
    name: string;
    description: string;
    rules: Array<{
      name: string;
      trigger: string;
      conditions: Conditions;
      actions: Action[];
    }>;
  }
> = {
  real_estate: {
    name: "Real estate lead desk",
    description: "Fast qualification and ownership for property inquiries.",
    rules: [
      {
        name: "Property inquiry ownership task",
        trigger: "conversation.created",
        conditions: { channels: ["whatsapp"], onlyUnassigned: true },
        actions: [
          { type: "add_tag", value: "property-inquiry" },
          { type: "set_priority", value: "high" },
          {
            type: "create_task",
            title: "Qualify area, budget, property type, and timeline",
            dueInHours: 2,
          },
        ],
      },
      {
        name: "New property lead follow-up",
        trigger: "lead.created",
        conditions: {},
        actions: [{ type: "schedule_follow_up", hours: 2 }],
      },
    ],
  },
  ecommerce: {
    name: "Ecommerce order care",
    description: "Keep order questions visible and time-bound.",
    rules: [
      {
        name: "Order inquiry response task",
        trigger: "conversation.created",
        conditions: { channels: ["whatsapp"], onlyUnassigned: true },
        actions: [
          { type: "add_tag", value: "order-inquiry" },
          {
            type: "create_task",
            title: "Confirm product, stock, delivery, and payment details",
            dueInHours: 2,
          },
        ],
      },
      {
        name: "Stale order lead recovery",
        trigger: "scheduled.daily",
        conditions: {
          inactivityHours: 48,
          leadStatuses: ["new", "contacted", "qualified"],
        },
        actions: [{ type: "schedule_follow_up", hours: 1 }],
      },
    ],
  },
  agency: {
    name: "Agency qualification pipeline",
    description: "Standardize qualification and proposal follow-up.",
    rules: [
      {
        name: "New agency lead qualification",
        trigger: "lead.created",
        conditions: {},
        actions: [{ type: "schedule_follow_up", hours: 4 }],
      },
      {
        name: "Agency inquiry ownership task",
        trigger: "conversation.created",
        conditions: { onlyUnassigned: true },
        actions: [
          { type: "add_tag", value: "discovery-needed" },
          {
            type: "create_task",
            title: "Qualify scope, budget, decision process, and target date",
            dueInHours: 4,
          },
        ],
      },
    ],
  },
  local_services: {
    name: "Local service booking",
    description: "Turn inquiries into owned booking tasks.",
    rules: [
      {
        name: "Service booking task",
        trigger: "conversation.created",
        conditions: { channels: ["whatsapp"], onlyUnassigned: true },
        actions: [
          { type: "add_tag", value: "booking-request" },
          {
            type: "create_task",
            title:
              "Confirm service, location, availability, and preferred time",
            dueInHours: 2,
          },
        ],
      },
      {
        name: "Unanswered booking recovery",
        trigger: "scheduled.daily",
        conditions: { inactivityHours: 24, leadStatuses: ["new", "contacted"] },
        actions: [{ type: "schedule_follow_up", hours: 1 }],
      },
    ],
  },
};

function stringList(value: unknown, maxItems = 20, maxLength = 80) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .map((item) =>
              String(item).trim().toLowerCase().slice(0, maxLength),
            )
            .filter(Boolean),
        ),
      ].slice(0, maxItems)
    : [];
}
export function cleanConditions(value: unknown): Conditions {
  const item =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    channels: stringList(item.channels),
    textAny: stringList(item.textAny, 20, 120),
    priorities: stringList(item.priorities),
    sources: stringList(item.sources),
    leadStatuses: stringList(item.leadStatuses),
    onlyUnassigned: item.onlyUnassigned === true,
    inactivityHours: item.inactivityHours
      ? Math.max(1, Math.min(8760, Number(item.inactivityHours) || 0))
      : undefined,
  };
}
export function cleanActions(value: unknown): Action[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 10)
    .map((raw) => {
      const item =
        raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
      return {
        type: AUTOMATION_ACTIONS.includes(
          String(item.type) as (typeof AUTOMATION_ACTIONS)[number],
        )
          ? String(item.type)
          : "",
        value: String(item.value || "")
          .trim()
          .slice(0, 80),
        memberId: String(item.memberId || "")
          .trim()
          .slice(0, 80),
        title: String(item.title || "")
          .trim()
          .slice(0, 160),
        dueInHours: Math.max(1, Math.min(8760, Number(item.dueInHours) || 24)),
        hours: Math.max(1, Math.min(8760, Number(item.hours) || 24)),
        severity: ["normal", "urgent"].includes(String(item.severity))
          ? String(item.severity)
          : "normal",
      };
    })
    .filter((item) => item.type);
}

async function matches(event: AutomationEvent, conditions: Conditions) {
  if (
    conditions.channels?.length &&
    !conditions.channels.includes(String(event.channel || "").toLowerCase())
  )
    return false;
  if (
    conditions.priorities?.length &&
    !conditions.priorities.includes(String(event.priority || "").toLowerCase())
  )
    return false;
  if (
    conditions.sources?.length &&
    !conditions.sources.some((source) =>
      String(event.source || "")
        .toLowerCase()
        .includes(source),
    )
  )
    return false;
  if (
    conditions.leadStatuses?.length &&
    !conditions.leadStatuses.includes(
      String(event.leadStatus || "").toLowerCase(),
    )
  )
    return false;
  if (
    conditions.textAny?.length &&
    !conditions.textAny.some((term) =>
      String(event.text || "")
        .toLowerCase()
        .includes(term),
    )
  )
    return false;
  if (conditions.onlyUnassigned && event.conversationId) {
    const conversation = await prisma.inboxConversation.findFirst({
      where: { id: event.conversationId, workspaceId: event.workspaceId },
      select: { assignedMemberId: true },
    });
    if (!conversation || conversation.assignedMemberId) return false;
  }
  if (conditions.inactivityHours && event.leadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: event.leadId, workspaceId: event.workspaceId },
      select: { updatedAt: true, lastContactedAt: true },
    });
    const last = lead?.lastContactedAt || lead?.updatedAt;
    if (
      !last ||
      Date.now() - last.getTime() < conditions.inactivityHours * 3_600_000
    )
      return false;
  }
  return true;
}

async function applyActions(
  tx: Prisma.TransactionClient,
  rule: { createdByMemberId: string | null },
  event: AutomationEvent,
  actions: Action[],
) {
  const results: Array<{ type: string; status: string; detail?: string }> = [];
  for (const action of actions) {
    if (
      [
        "set_priority",
        "add_tag",
        "assign_member",
        "create_task",
        "create_handoff",
      ].includes(action.type) &&
      !event.conversationId
    )
      throw new Error(`${action.type} requires a conversation.`);
    if (
      ["set_lead_status", "schedule_follow_up"].includes(action.type) &&
      !event.leadId
    )
      throw new Error(`${action.type} requires a lead.`);
    if (action.type === "set_priority") {
      if (!["low", "normal", "high", "urgent"].includes(action.value || ""))
        throw new Error("Invalid priority action.");
      await tx.inboxConversation.updateMany({
        where: { id: event.conversationId!, workspaceId: event.workspaceId },
        data: { priority: action.value },
      });
    }
    if (action.type === "add_tag") {
      const conversation = await tx.inboxConversation.findFirst({
        where: { id: event.conversationId!, workspaceId: event.workspaceId },
        select: { tags: true },
      });
      if (!conversation) throw new Error("Conversation not found.");
      const tag = String(action.value || "")
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .slice(0, 30);
      if (!tag) throw new Error("A valid tag is required.");
      await tx.inboxConversation.update({
        where: { id: event.conversationId! },
        data: { tags: [...new Set([...conversation.tags, tag])].slice(0, 10) },
      });
    }
    if (action.type === "assign_member") {
      const member = await tx.workspaceMember.findFirst({
        where: { id: action.memberId, workspaceId: event.workspaceId },
      });
      if (!member)
        throw new Error("Automation assignee is not in this workspace.");
      await tx.inboxConversation.updateMany({
        where: { id: event.conversationId!, workspaceId: event.workspaceId },
        data: { assignedMemberId: member.id },
      });
    }
    if (action.type === "create_task") {
      await tx.inboxTask.create({
        data: {
          workspaceId: event.workspaceId,
          conversationId: event.conversationId!,
          title: action.title || "Follow up with customer",
          dueAt: new Date(Date.now() + (action.dueInHours || 24) * 3_600_000),
          createdByMemberId: rule.createdByMemberId,
        },
      });
    }
    if (action.type === "set_lead_status") {
      if (
        !["new", "contacted", "qualified", "proposal", "won", "lost"].includes(
          action.value || "",
        )
      )
        throw new Error("Invalid lead status action.");
      await tx.lead.updateMany({
        where: { id: event.leadId!, workspaceId: event.workspaceId },
        data: { status: action.value },
      });
    }
    if (action.type === "schedule_follow_up") {
      await tx.lead.updateMany({
        where: { id: event.leadId!, workspaceId: event.workspaceId },
        data: {
          nextFollowUpAt: new Date(
            Date.now() + (action.hours || 24) * 3_600_000,
          ),
        },
      });
    }
    if (action.type === "create_handoff") {
      await tx.aiHandoff.create({
        data: {
          workspaceId: event.workspaceId,
          conversationId: event.conversationId!,
          reason: action.title || "Automation requested human review",
          severity: action.severity || "normal",
        },
      });
    }
    results.push({ type: action.type, status: "applied" });
  }
  return results;
}

export async function runAutomations(event: AutomationEvent) {
  const rules = await prisma.automationRule.findMany({
    where: {
      workspaceId: event.workspaceId,
      status: "active",
      trigger: event.trigger,
    },
    orderBy: { createdAt: "asc" },
  });
  const summary = {
    evaluated: rules.length,
    matched: 0,
    succeeded: 0,
    failed: 0,
    dryRun: 0,
  };
  for (const rule of rules) {
    if (!(await matches(event, cleanConditions(rule.conditions)))) continue;
    summary.matched++;
    const existing = await prisma.automationRun.findUnique({
      where: { ruleId_eventKey: { ruleId: rule.id, eventKey: event.eventKey } },
    });
    if (existing) continue;
    const context = {
      conversationId: event.conversationId || null,
      leadId: event.leadId || null,
      channel: event.channel || null,
      priority: event.priority || null,
      source: event.source || null,
      leadStatus: event.leadStatus || null,
      textPresent: Boolean(event.text),
    };
    const run = await prisma.automationRun
      .create({
        data: {
          workspaceId: event.workspaceId,
          ruleId: rule.id,
          eventKey: event.eventKey.slice(0, 200),
          trigger: event.trigger,
          entityType: event.conversationId
            ? "conversation"
            : event.leadId
              ? "lead"
              : "workspace",
          entityId: event.conversationId || event.leadId || event.workspaceId,
          context,
          status: rule.runMode === "dry_run" ? "dry_run" : "started",
        },
      })
      .catch(() => null);
    if (!run) continue;
    if (rule.runMode === "dry_run") {
      await prisma.$transaction([
        prisma.automationRun.update({
          where: { id: run.id },
          data: {
            completedAt: new Date(),
            actionResults: cleanActions(rule.actions).map((action) => ({
              type: action.type,
              status: "planned",
            })),
          },
        }),
        prisma.automationRule.update({
          where: { id: rule.id },
          data: {
            runCount: { increment: 1 },
            successCount: { increment: 1 },
            lastRunAt: new Date(),
            lastError: null,
          },
        }),
      ]);
      summary.dryRun++;
      continue;
    }
    try {
      const results = await prisma.$transaction((tx) =>
        applyActions(tx, rule, event, cleanActions(rule.actions)),
      );
      await prisma.$transaction([
        prisma.automationRun.update({
          where: { id: run.id },
          data: {
            status: "succeeded",
            actionResults: results,
            completedAt: new Date(),
          },
        }),
        prisma.automationRule.update({
          where: { id: rule.id },
          data: {
            runCount: { increment: 1 },
            successCount: { increment: 1 },
            lastRunAt: new Date(),
            lastError: null,
          },
        }),
      ]);
      summary.succeeded++;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Automation failed.";
      await prisma.$transaction([
        prisma.automationRun.update({
          where: { id: run.id },
          data: {
            status: "failed",
            errorCode: "ACTION_FAILED",
            errorMessage: message,
            completedAt: new Date(),
          },
        }),
        prisma.automationRule.update({
          where: { id: rule.id },
          data: {
            runCount: { increment: 1 },
            failureCount: { increment: 1 },
            lastRunAt: new Date(),
            lastError: message,
          },
        }),
      ]);
      summary.failed++;
    }
  }
  return summary;
}
