import { prisma } from "@/lib/prisma";
import { effectivePlan } from "@/lib/entitlements";

function workspaceName(name: string | null, email: string) {
  const base = name?.trim() || email.split("@")[0] || "My";
  return `${base.slice(0, 70)}'s workspace`;
}

export async function ensurePersonalWorkspace(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, activeWorkspaceId: true },
  });
  if (!user) throw new Error("User not found");

  if (user.activeWorkspaceId) {
    const active = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: user.activeWorkspaceId, userId } },
      include: { workspace: true },
    });
    // A plan-paused member loses access to that workspace without being
    // removed (billing spec 12g); the owner is never plan-paused. Fall
    // through to another (non-paused) membership instead of returning a
    // workspace they can no longer use.
    if (active && (active.role === "owner" || !active.planPausedAt)) return active;
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId, planPausedAt: null },
    orderBy: { createdAt: "asc" },
    include: { workspace: true },
  });
  if (membership) {
    await prisma.user.update({ where: { id: userId }, data: { activeWorkspaceId: membership.workspaceId } });
    return membership;
  }

  return prisma.$transaction(async (tx) => {
    const workspace = await tx.workspace.create({
      data: {
        name: workspaceName(user.name, user.email),
        slug: `workspace-${user.id.slice(-12).toLowerCase()}`,
        ownerId: user.id,
      },
    });
    const created = await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "owner" },
      include: { workspace: true },
    });
    await tx.user.update({ where: { id: user.id }, data: { activeWorkspaceId: workspace.id } });
    return created;
  });
}

export async function getActiveWorkspace(userId: string) {
  return ensurePersonalWorkspace(userId);
}

export function workspaceOwnerPlan(owner: { plan: string; trialPlan?: string | null; trialEndsAt?: Date | null }) {
  return effectivePlan(owner);
}
