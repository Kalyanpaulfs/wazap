import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAccess } from "@/lib/workspaces";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`workspace-audit:${userId}`, 60, 60_000)) {
    return NextResponse.json({ error: "Too many activity requests. Please wait." }, { status: 429 });
  }
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspaceId") || "";
  const membership = await requireWorkspaceAccess(userId, workspaceId, ["owner", "admin"]);
  if (!membership) return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });

  const events = await prisma.workspaceAuditEvent.findMany({
    where: { workspaceId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 100,
  });
  const userIds = [...new Set(events.flatMap((event) => [event.actorUserId, event.targetUserId]).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : [];
  const byId = new Map(users.map((user) => [user.id, user]));
  return NextResponse.json({
    events: events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      actor: event.actorUserId ? byId.get(event.actorUserId) ?? { id: event.actorUserId, name: "Former member", email: null } : null,
      target: event.targetUserId ? byId.get(event.targetUserId) ?? { id: event.targetUserId, name: "Former member", email: null } : null,
      metadata: event.metadata,
      createdAt: event.createdAt,
    })),
  });
}
