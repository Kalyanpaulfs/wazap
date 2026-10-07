import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAccess } from "@/lib/workspaces";
import { rateLimit } from "@/lib/rate-limit";

async function actorId() {
  const session = await getServerSession(authOptions);
  return session?.user ? (session.user as { id: string }).id : null;
}

function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const base = process.env.NEXTAUTH_URL || "https://wazap.lt";
  return !origin || origin === new URL(base).origin;
}

async function authorize(actor: string, memberId: string) {
  const target = await prisma.workspaceMember.findUnique({ where: { id: memberId } });
  if (!target) return { error: NextResponse.json({ error: "Member not found." }, { status: 404 }) };
  const actorMembership = await requireWorkspaceAccess(actor, target.workspaceId, ["owner", "admin"]);
  if (!actorMembership) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (target.role === "owner") return { error: NextResponse.json({ error: "The workspace owner cannot be changed or removed." }, { status: 400 }) };
  if (actorMembership.role === "admin" && target.role === "admin") return { error: NextResponse.json({ error: "Only the owner can manage admins." }, { status: 403 }) };
  return { target, actorMembership };
}

export async function PATCH(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const actor = await actorId();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`workspace-member:${actor}`, 30, 60_000)) return NextResponse.json({ error: "Too many changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const result = await authorize(actor, String(body.id ?? ""));
  if (result.error) return result.error;
  const role = body.role === "admin" ? "admin" : "member";
  if (role === "admin" && result.actorMembership?.role !== "owner") return NextResponse.json({ error: "Only the owner can promote admins." }, { status: 403 });
  const previousRole = result.target!.role;
  await prisma.$transaction([
    prisma.workspaceMember.update({ where: { id: result.target!.id }, data: { role } }),
    prisma.workspaceAuditEvent.create({
      data: {
        workspaceId: result.target!.workspaceId,
        eventType: "member_role_changed",
        actorUserId: actor,
        targetUserId: result.target!.userId,
        metadata: { previousRole, newRole: role },
      },
    }),
  ]);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const actor = await actorId();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`workspace-member:${actor}`, 30, 60_000)) return NextResponse.json({ error: "Too many changes. Please wait." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const result = await authorize(actor, String(body.id ?? ""));
  if (result.error) return result.error;
  await prisma.$transaction([
    prisma.workspaceAuditEvent.create({
      data: {
        workspaceId: result.target!.workspaceId,
        eventType: "member_removed",
        actorUserId: actor,
        targetUserId: result.target!.userId,
        metadata: { previousRole: result.target!.role },
      },
    }),
    prisma.workspaceMember.delete({ where: { id: result.target!.id } }),
    prisma.user.updateMany({ where: { id: result.target!.userId, activeWorkspaceId: result.target!.workspaceId }, data: { activeWorkspaceId: null } }),
  ]);
  return NextResponse.json({ success: true });
}
