import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { workspaceMemberLimit } from "@/lib/workspaces";
import { rateLimit } from "@/lib/rate-limit";

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Sign in with the invited email address first." }, { status: 401 });
  const userId = (session.user as { id: string }).id;
  const email = session.user.email?.toLowerCase() || "";
  if (!rateLimit(`workspace-accept:${userId}`, 10, 60_000)) return NextResponse.json({ error: "Too many attempts. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const invitation = await prisma.workspaceInvitation.findUnique({
    where: { token },
    include: { workspace: { include: { owner: { select: { plan: true } } } } },
  });
  if (!invitation || invitation.status !== "pending") return NextResponse.json({ error: "This invitation is no longer valid." }, { status: 404 });
  if (invitation.expiresAt <= new Date()) {
    await prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "expired" } });
    return NextResponse.json({ error: "This invitation has expired." }, { status: 410 });
  }
  if (invitation.email !== email) return NextResponse.json({ error: `Sign in as ${invitation.email} to accept this invitation.` }, { status: 403 });

  const memberCount = await prisma.workspaceMember.count({ where: { workspaceId: invitation.workspaceId } });
  const limit = workspaceMemberLimit(invitation.workspace.owner.plan);
  const existing = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } } });
  if (!existing && memberCount >= limit) return NextResponse.json({ error: "This workspace has reached its member limit." }, { status: 403 });

  await prisma.$transaction([
    prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId } },
      update: { role: invitation.role },
      create: { workspaceId: invitation.workspaceId, userId, role: invitation.role },
    }),
    prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "accepted", acceptedById: userId, acceptedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: { activeWorkspaceId: invitation.workspaceId } }),
    prisma.workspaceAuditEvent.create({
      data: {
        workspaceId: invitation.workspaceId,
        eventType: "invitation_accepted",
        actorUserId: userId,
        targetUserId: userId,
        metadata: { role: invitation.role },
      },
    }),
  ]);
  return NextResponse.json({ success: true, workspaceId: invitation.workspaceId, workspaceName: invitation.workspace.name });
}
