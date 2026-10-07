import { NextResponse } from "next/server";
import { authenticateApi, logApiRequest } from "@/lib/developer-platform";
import { ANALYTICS_WINDOWS, workspaceAnalytics } from "@/lib/workspace-analytics";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "analytics:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const requested = Number(new URL(req.url).searchParams.get("days")) || 30;
  if (!ANALYTICS_WINDOWS.includes(requested as typeof ANALYTICS_WINDOWS[number])) {
    await logApiRequest(ctx, req, 400, "validation_error");
    return error(400, "validation_error", "days must be 7, 30, or 90.", ctx.requestId);
  }
  const data = await workspaceAnalytics(ctx.workspaceId, requested);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({ data, meta: { requestId: ctx.requestId } });
}
