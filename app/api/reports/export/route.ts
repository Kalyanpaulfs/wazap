import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getAssetDirectory } from "@/lib/performance";
import { salespersonName } from "@/lib/salesperson-names";
import { reportsTier } from "@/lib/plan-limits";
import { resolveResultsSelection, parseLinkFilter, LINK_FILTER_TYPE_TO_ASSET_TYPE, sanitizeTimeZone, toCsv } from "@/lib/reports";

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
  const cookieStore = await cookies();
  const tz = sanitizeTimeZone(cookieStore.get("tz")?.value);

  // Today/7 days/30 days + Custom range (full tier), same rules and the same
  // helper the /results page uses - basic exports now honour the chosen
  // period chip too (they used to always be a fixed last-30-days window).
  const selection = resolveResultsSelection(
    tier,
    {
      period: url.searchParams.get("period"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      compare: url.searchParams.get("compare"),
    },
    new Date(),
    tz
  );
  const current = selection.current;
  const linkFilter = parseLinkFilter(url.searchParams.get("link"));
  const filenamePart = selection.isCustom ? `${selection.fromValue}_to_${selection.toValue}` : selection.period;

  const [{ index: assetIndex }, starts] = await Promise.all([
    getAssetDirectory(workspace.ownerId),
    prisma.conversationStart.findMany({
      where: {
        workspaceId: membership.workspaceId,
        createdAt: { gte: current.start, lt: current.end },
        ...(linkFilter ? { assetId: linkFilter.id, assetType: LINK_FILTER_TYPE_TO_ASSET_TYPE[linkFilter.type] } : {}),
      },
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
      "Content-Disposition": `attachment; filename="wazap-results-${filenamePart}.csv"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
