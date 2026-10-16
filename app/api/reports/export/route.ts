import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getAssetDirectory } from "@/lib/performance";
import { salespersonName } from "@/lib/salesperson-names";
import { reportsTier } from "@/lib/plan-limits";
import { lastNDaysRange, resolveFullTierSelection, toCsv } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const plan = (session.user as { plan?: string }).plan ?? "free";
  const tier = reportsTier(plan);
  if (tier === "none") return NextResponse.json({ error: "Reports are a paid feature. Upgrade to export." }, { status: 403 });

  const userId = (session.user as { id: string }).id;
  const membership = await getActiveWorkspace(userId);
  const workspace = membership.workspace as { ownerId: string } | undefined;
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const url = new URL(request.url);
  // Basic (Solo) exports are always the fixed last-30-days window, regardless
  // of what period/from/to query params are passed, matching the Reports
  // page — from/to (custom range) only ever apply to the full tier.
  const selection = tier === "full"
    ? resolveFullTierSelection({
        period: url.searchParams.get("period"),
        from: url.searchParams.get("from"),
        to: url.searchParams.get("to"),
      })
    : null;
  const current = selection ? selection.current : lastNDaysRange(30);
  const filenamePart = selection?.isCustom ? `${selection.fromValue}_to_${selection.toValue}` : selection?.period ?? "last-30-days";

  const [{ index: assetIndex }, starts] = await Promise.all([
    getAssetDirectory(workspace.ownerId),
    prisma.conversationStart.findMany({
      where: { workspaceId: membership.workspaceId, createdAt: { gte: current.start, lt: current.end } },
      select: { assetType: true, assetId: true, assetName: true, source: true, campaign: true, destination: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const rows = starts.map((item) => {
    const entry = item.assetId ? assetIndex.get(item.assetId) : undefined;
    const linkName = entry?.name || item.assetName?.trim() || "Unknown";
    const linkType = entry?.typeLabel || item.assetType.replaceAll("_", " ");
    const salesperson = item.destination ? salespersonName(entry?.numberNames, item.destination) : null;
    return [
      item.createdAt.toISOString(),
      linkName,
      linkType,
      item.source?.trim() || "Direct / untagged",
      item.campaign?.trim() || "",
      item.destination || "",
      salesperson || "",
    ];
  });

  const csv = toCsv([["date", "link name", "link type", "source", "campaign", "destination", "salesperson"], ...rows]);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="wazap-reports-${filenamePart}.csv"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
