import { NextResponse } from "next/server";
import { authenticateApi, logApiRequest } from "@/lib/developer-platform";
import { partnerSummary } from "@/lib/partner-metrics";

function error(status: number, code: string, message: string, requestId?: string) {
  return NextResponse.json({ error: { code, message }, meta: requestId ? { requestId } : undefined }, { status });
}

export async function GET(req: Request) {
  const auth = await authenticateApi(req, "partners:read");
  if (!auth.context) return error(auth.error!.status, auth.error!.code, auth.error!.message);
  const ctx = auth.context;
  const data = await partnerSummary(ctx.workspaceId);
  await logApiRequest(ctx, req, 200);
  return NextResponse.json({
    data: {
      ...data,
      referralUrl: data.partner ? `https://wazap.lt/?partner=${encodeURIComponent(data.partner.referralCode)}` : null,
    },
    meta: { requestId: ctx.requestId },
  });
}
