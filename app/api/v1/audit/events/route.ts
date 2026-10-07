import { NextResponse } from "next/server";
import { authenticateApi, logApiRequest } from "@/lib/developer-platform";
import { workspaceAuditEvidence } from "@/lib/workspace-audit";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "audit:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const url = new URL(req.url);
  const eventType = (url.searchParams.get("eventType") || "").trim();
  if (eventType && !/^[a-z0-9_.-]{1,80}$/.test(eventType)) {
    await logApiRequest(ctx, req, 400, "invalid_event_type");
    return error(400, "invalid_event_type", "eventType must be a valid audit event identifier.", ctx.requestId);
  }
  const result = await workspaceAuditEvidence({
    workspaceId: ctx.workspaceId,
    eventType,
    limit: Number(url.searchParams.get("limit")) || 50,
    after: url.searchParams.get("after"),
  });
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({
    data: result.data,
    meta: {
      requestId: ctx.requestId,
      hasMore: result.hasMore,
      nextCursor: result.nextCursor,
      scope: "workspace",
    },
  });
}
