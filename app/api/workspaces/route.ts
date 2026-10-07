import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ensurePersonalWorkspace, requireWorkspaceAccess } from "@/lib/workspaces";

export const dynamic = "force-dynamic";

async function sessionUserId() {
  const session = await getServerSession(authOptions);
  return session?.user ? (session.user as { id: string }).id : null;
}

export async function GET() {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensurePersonalWorkspace(userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { activeWorkspaceId: true } });
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } },
          invitations: { where: { status: "pending" }, select: { id: true, email: true, role: true, expiresAt: true, createdAt: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const inviteEmails = [...new Set(memberships.flatMap((membership) => membership.workspace.invitations.map((invitation) => invitation.email)))];
  const deliveries = inviteEmails.length ? await prisma.outboundEmail.findMany({
    where: { type: "workspace_invite", recipient: { in: inviteEmails } },
    select: { recipient: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  }) : [];
  const deliveryByEmail = new Map<string, string>();
  for (const delivery of deliveries) if (!deliveryByEmail.has(delivery.recipient)) deliveryByEmail.set(delivery.recipient, delivery.status);
  return NextResponse.json({
    activeWorkspaceId: user?.activeWorkspaceId,
    workspaces: memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      slug: membership.workspace.slug,
      role: membership.role,
      members: membership.workspace.members.map((member) => ({ id: member.id, userId: member.user.id, name: member.user.name, email: member.user.email, role: member.role, joinedAt: member.createdAt })),
      invitations: ["owner", "admin"].includes(membership.role) ? membership.workspace.invitations.map((invitation) => ({ ...invitation, deliveryStatus: deliveryByEmail.get(invitation.email) ?? "queued" })) : [],
    })),
  });
}

export async function PATCH(req: Request) {
  const userId = await sessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const workspaceId = String(body.workspaceId ?? "");
  const membership = await requireWorkspaceAccess(userId, workspaceId);
  if (!membership) return NextResponse.json({ error: "Workspace not found." }, { status: 404 });

  if (body.name !== undefined) {
    if (!['owner', 'admin'].includes(membership.role)) return NextResponse.json({ error: "Only owners and admins can rename a workspace." }, { status: 403 });
    const name = String(body.name ?? "").trim().slice(0, 80);
    if (name.length < 2) return NextResponse.json({ error: "Workspace name is too short." }, { status: 400 });
    await prisma.workspace.update({ where: { id: workspaceId }, data: { name } });
  }
  await prisma.user.update({ where: { id: userId }, data: { activeWorkspaceId: workspaceId } });
  return NextResponse.json({ success: true, activeWorkspaceId: workspaceId });
}
