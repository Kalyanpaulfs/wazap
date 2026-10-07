import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordConversationStart } from "@/lib/conversations";

export async function POST(req: Request) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const [, link] = await prisma.$transaction([
      prisma.adLinkClick.create({ data: { adLinkId: id } }),
      prisma.adLink.update({ where: { id }, data: { clicks: { increment: 1 } } }),
    ]);
    await recordConversationStart({
      userId: link.userId,
      assetType: "ad_link",
      assetId: link.id,
      assetName: link.name,
      source: link.utmSource || link.utmMedium || "Wazap ad link",
      campaign: link.utmCampaign,
      destination: link.number,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
