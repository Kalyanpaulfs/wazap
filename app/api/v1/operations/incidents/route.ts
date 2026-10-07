import { NextResponse } from "next/server";
import { authenticateApi, logApiRequest } from "@/lib/developer-platform";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "operations:read");
  if (!auth.context) return NextResponse.json({ error: auth.error }, { status: auth.error!.status });
  const ctx = auth.context;
  const incidents = await prisma.operationalIncident.findMany({
    where: { workspaceId: ctx.workspaceId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: { id: true, title: true, summary: true, impact: true, severity: true, status: true, source: true, responseTargetAt: true, nextUpdateAt: true, acknowledgedAt: true, escalatedAt: true, lastObservedAt: true, resolvedAt: true, resolution: true, createdAt: true, updatedAt: true, ownerMember: { select: { id: true, user: { select: { name: true } } } }, updates: { orderBy: { createdAt: "desc" }, take: 20, select: { id: true, status: true, message: true, audience: true, createdAt: true } } },
  });
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data: incidents, meta: { requestId: ctx.requestId } });
}
