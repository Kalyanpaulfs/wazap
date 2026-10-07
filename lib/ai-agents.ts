import { prisma } from "@/lib/prisma";
import { currentInboxContext, cleanInboxText } from "@/lib/inbox";
import { effectivePlan } from "@/lib/entitlements";

export const AI_AGENT_LIMITS: Record<string, number> = { free: 1, basic: 1, pro: 3, ultimate: 10, business: 25 };
export const AI_KNOWLEDGE_LIMITS: Record<string, number> = { free: 3, basic: 10, pro: 50, ultimate: 200, business: 1000 };
export const AI_AGENT_ROLES = ["sales_rep", "receptionist", "support_agent", "recruiter", "appointment_setter", "collections_agent", "real_estate_agent"] as const;

export async function currentAiContext() {
  const ctx = await currentInboxContext();
  if (!ctx) return null;
  const workspace = await prisma.workspace.findUnique({ where: { id: ctx.workspaceId }, include: { owner: { select: { plan: true, trialPlan: true, trialEndsAt: true } } } });
  if (!workspace) return null;
  const plan = effectivePlan(workspace.owner);
  return { ...ctx, plan, agentLimit: AI_AGENT_LIMITS[plan] ?? 1, knowledgeLimit: AI_KNOWLEDGE_LIMITS[plan] ?? 3 };
}

export function cleanStringList(value: unknown, maxItems = 20) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => cleanInboxText(item, 80)).filter(Boolean))].slice(0, maxItems);
}

export function aiProviderConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function globalAiExecutionPaused() {
  return ["1", "true", "yes", "on"].includes((process.env.AI_EXECUTION_DISABLED || "").trim().toLowerCase());
}

export async function aiExecutionState(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { aiExecutionPaused: true, aiExecutionPausedAt: true, aiExecutionPauseReason: true },
  });
  const globalPaused = globalAiExecutionPaused();
  const workspacePaused = Boolean(workspace?.aiExecutionPaused);
  const providerConfigured = aiProviderConfigured();
  return {
    enabled: providerConfigured && !globalPaused && !workspacePaused,
    providerConfigured, globalPaused, workspacePaused,
    pausedAt: workspace?.aiExecutionPausedAt ?? null,
    reason: globalPaused ? "AI execution is disabled by the platform emergency switch."
      : workspacePaused ? workspace?.aiExecutionPauseReason || "AI execution is paused for this workspace."
      : providerConfigured ? "Draft generation is enabled. Human review remains required."
      : "OPENAI_API_KEY is not configured.",
  };
}
