import { NextResponse } from "next/server";
import { currentInboxContext } from "@/lib/inbox";
import { workspaceAnalytics } from "@/lib/workspace-analytics";

export async function GET() {
  const ctx = await currentInboxContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await workspaceAnalytics(ctx.workspaceId, 30));
}
