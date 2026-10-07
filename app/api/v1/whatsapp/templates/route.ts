import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApi, logApiRequest } from "@/lib/developer-platform";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "whatsapp:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context; const url = new URL(req.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 25, 100));
  const after = url.searchParams.get("after"); const status = url.searchParams.get("status");
  const items = await prisma.whatsAppTemplate.findMany({
    where: { workspaceId: ctx.workspaceId, ...(status ? { status: status.slice(0, 40) } : {}) },
    orderBy: { id: "asc" }, take: limit + 1,
    ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    select: { id: true, connectionId: true, externalTemplateId: true, name: true, language: true, category: true, status: true, components: true, rejectionReason: true, lastSyncedAt: true, createdAt: true, updatedAt: true },
  });
  const hasMore = items.length > limit; const data = items.slice(0, limit);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data, meta: { hasMore, nextCursor: hasMore ? data.at(-1)?.id : null, requestId: ctx.requestId } });
}
