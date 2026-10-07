import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOOL_LIMITS } from "@/lib/tool-access";
import { recordFunnelEvent } from "@/lib/funnel";

function getLimit(plan: string) {
  const limits = TOOL_LIMITS.adBuilder;
  if (plan === "business") plan = "ultimate";
  return (limits[plan as keyof typeof limits] ?? limits.free).uses;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json([]);
  const userId = (session.user as any).id;
  const links = await prisma.adLink.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clickEvents: true } } },
  });
  return NextResponse.json(links.map(l => ({ ...l, clicks: l._count.clickEvents })));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const plan = (session.user as any).plan ?? "free";
  const limit = getLimit(plan);

  if (limit !== -1) {
    const count = await prisma.adLink.count({ where: { userId } });
    if (count >= limit) {
      return NextResponse.json({ error: `Plan limit reached. Your ${plan} plan allows ${limit} ad link${limit !== 1 ? "s" : ""}. Upgrade for more.`, upgrade: true }, { status: 403 });
    }
  }

  const { name, number, message, utmSource, utmMedium, utmCampaign } = await req.json();
  if (!name || !number) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const link = await prisma.adLink.create({
    data: { userId, name, number, message, utmSource, utmMedium, utmCampaign },
  });
  await recordFunnelEvent("first_tool_success", { userId, source: "ad_builder" });
  return NextResponse.json(link);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await req.json();
  await prisma.adLink.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
