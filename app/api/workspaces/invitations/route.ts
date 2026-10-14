import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderWorkspaceInviteEmail } from "@/lib/email";
import { getActiveWorkspace, requireWorkspaceAccess, workspaceMemberLimit } from "@/lib/workspaces";
import { rateLimit } from "@/lib/rate-limit";

async function sessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return { id: (session.user as { id: string }).id, email: session.user.email?.toLowerCase() || "", name: session.user.name || null };
}

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`workspace-invite:${user.id}`, 20, 60_000)) return NextResponse.json({ error: "Too many invitation changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const active = await getActiveWorkspace(user.id);
  const workspaceId = String(body.workspaceId || active.workspaceId);
  const membership = await requireWorkspaceAccess(user.id, workspaceId, ["owner", "admin"]);
  if (!membership) return NextResponse.json({ error: "Only workspace owners and admins can invite members." }, { status: 403 });
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
  const role = body.role === "admin" ? "admin" : "member";
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });

  const [memberCount, existingUser] = await Promise.all([
    prisma.workspaceMember.count({ where: { workspaceId, planPausedAt: null } }),
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);
  const limit = workspaceMemberLimit(membership.workspace.owner.plan);
  if (memberCount >= limit) return NextResponse.json({ error: `This plan supports ${limit} workspace member${limit === 1 ? "" : "s"}. Upgrade to add more.`, upgrade: true }, { status: 403 });
  if (existingUser && await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId: existingUser.id } } })) {
    return NextResponse.json({ error: "That person is already a workspace member." }, { status: 409 });
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const acceptUrl = `${process.env.NEXTAUTH_URL || "https://wazap.lt"}/workspace/invite/${token}`;
  const html = renderWorkspaceInviteEmail({ inviterName: user.name, workspaceName: membership.workspace.name, acceptUrl });
  const invitation = await prisma.$transaction(async (tx) => {
    const superseded = await tx.workspaceInvitation.updateMany({ where: { workspaceId, email, status: "pending" }, data: { status: "superseded" } });
    const created = await tx.workspaceInvitation.create({
      data: { workspaceId, email, role, token, expiresAt, invitedById: user.id },
    });
    await tx.outboundEmail.create({
      data: { userId: user.id, recipient: email, type: "workspace_invite", subject: `Join ${membership.workspace.name} on Wazap`, html },
    });
    await tx.workspaceAuditEvent.create({
      data: {
        workspaceId,
        eventType: "invitation_created",
        actorUserId: user.id,
        targetUserId: existingUser?.id ?? null,
        metadata: { targetEmail: email, role, expiresAt, supersededInvitations: superseded.count },
      },
    });
    return created;
  });
  return NextResponse.json({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }, { status: 201 });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const user = await sessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`workspace-invite:${user.id}`, 20, 60_000)) return NextResponse.json({ error: "Too many invitation changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const invitation = await prisma.workspaceInvitation.findUnique({ where: { id: String(body.id ?? "") } });
  if (!invitation) return NextResponse.json({ error: "Invitation not found." }, { status: 404 });
  const membership = await requireWorkspaceAccess(user.id, invitation.workspaceId, ["owner", "admin"]);
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await prisma.$transaction([
    prisma.workspaceInvitation.update({ where: { id: invitation.id }, data: { status: "cancelled" } }),
    prisma.workspaceAuditEvent.create({
      data: {
        workspaceId: invitation.workspaceId,
        eventType: "invitation_cancelled",
        actorUserId: user.id,
        metadata: { targetEmail: invitation.email, role: invitation.role },
      },
    }),
  ]);
  return NextResponse.json({ success: true });
}
