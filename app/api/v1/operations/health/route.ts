import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { workspaceOperationalHealth } from "@/lib/operations";
import { authenticateApi, logApiRequest } from "@/lib/developer-platform";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "operations:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const [current, snapshots] = await Promise.all([
    workspaceOperationalHealth(ctx.workspaceId),
    prisma.operationalSnapshot.findMany({
      where: { workspaceId: ctx.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 24,
      select: { id: true, status: true, metrics: true, issues: true, createdAt: true },
    }),
  ]);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({
    data: { current, snapshots, scope: "workspace", snapshotWindow: "latest_24" },
    meta: { requestId: ctx.requestId },
  });
}
