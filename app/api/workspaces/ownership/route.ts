import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { effectivePlan } from "@/lib/entitlements";
import { renderWorkspaceOwnershipEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getServerSession(authOptions);
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  if (!actorId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`workspace-ownership:${actorId}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many ownership attempts. Please wait." }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    workspaceId?: string;
    targetMemberId?: string;
    password?: string;
    confirmation?: string;
  };
  const workspaceId = String(body.workspaceId || "");
  const targetMemberId = String(body.targetMemberId || "");
  const [actor, workspace, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: actorId },
      select: { id: true, name: true, email: true, password: true },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, ownerId: true },
    }),
    prisma.workspaceMember.findUnique({
      where: { id: targetMemberId },
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            plan: true,
            trialPlan: true,
            trialEndsAt: true,
            accountDeletionScheduledFor: true,
          },
        },
      },
    }),
  ]);
  if (!actor || !workspace || workspace.ownerId !== actorId) {
    return NextResponse.json({ error: "Only the current workspace owner can transfer ownership." }, { status: 403 });
  }
  if (!target || target.workspaceId !== workspace.id || target.userId === actorId) {
    return NextResponse.json({ error: "Choose another current workspace member." }, { status: 400 });
  }
  if (target.user.accountDeletionScheduledFor) {
    return NextResponse.json({ error: "The selected member must cancel their pending account closure first." }, { status: 409 });
  }
  if (body.confirmation !== `TRANSFER ${workspace.name}`) {
    return NextResponse.json({ error: `Type TRANSFER ${workspace.name} exactly.` }, { status: 400 });
  }
  if (!actor.password || !body.password || !(await bcrypt.compare(body.password, actor.password))) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 403 });
  }

  const actorMembership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: actorId } },
    select: { id: true },
  });
  if (!actorMembership) return NextResponse.json({ error: "Owner membership is missing." }, { status: 409 });

  const targetPlan = effectivePlan(target.user);
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  const changedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const changed = await tx.workspace.updateMany({
        where: { id: workspace.id, ownerId: actorId },
        data: { ownerId: target.userId },
      });
      if (changed.count !== 1) throw new Error("OWNERSHIP_CHANGED");
      await tx.workspaceMember.update({ where: { id: target.id }, data: { role: "owner" } });
      await tx.workspaceMember.update({ where: { id: actorMembership.id }, data: { role: "admin" } });
      await tx.workspaceAuditEvent.create({
        data: {
          workspaceId: workspace.id,
          eventType: "ownership_transferred",
          actorUserId: actor.id,
          targetUserId: target.userId,
          metadata: { previousRole: "owner", newRole: "owner", actorNewRole: "admin", effectivePlan: targetPlan, changedAt },
        },
      });
      await tx.outboundEmail.createMany({
        data: [
          {
            userId: actor.id,
            recipient: actor.email,
            type: "workspace_ownership_transferred",
            subject: `Ownership of ${workspace.name} was transferred`,
            html: renderWorkspaceOwnershipEmail({
              name: actor.name,
              workspaceName: workspace.name,
              newOwnerName: target.user.name,
              previousOwnerName: actor.name,
              isNewOwner: false,
              workspaceUrl: `${base}/workspace`,
              effectivePlan: targetPlan,
            }),
          },
          {
            userId: target.user.id,
            recipient: target.user.email,
            type: "workspace_ownership_received",
            subject: `You now own ${workspace.name}`,
            html: renderWorkspaceOwnershipEmail({
              name: target.user.name,
              workspaceName: workspace.name,
              newOwnerName: target.user.name,
              previousOwnerName: actor.name,
              isNewOwner: true,
              workspaceUrl: `${base}/workspace`,
              effectivePlan: targetPlan,
            }),
          },
        ],
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OWNERSHIP_CHANGED") {
      return NextResponse.json({ error: "Workspace ownership changed before this request completed. Reload and try again." }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json({
    transferred: true,
    workspaceId: workspace.id,
    newOwnerUserId: target.userId,
    effectivePlan: targetPlan,
    notice: `${target.user.name || target.user.email} now owns ${workspace.name}. Workspace limits follow their ${targetPlan} plan.`,
  });
}
