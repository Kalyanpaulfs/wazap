import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOOL_LIMITS } from "@/lib/tool-access";
import { recordFunnelEvent } from "@/lib/funnel";

function getLimit(plan: string) {
  const limits = TOOL_LIMITS.linktree;
  if (plan === "business") plan = "ultimate";
  return (limits[plan as keyof typeof limits] ?? limits.free).uses;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json([]);
  const userId = (session.user as any).id;
  const pages = await prisma.linktreePage.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(pages);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const plan = (session.user as any).plan ?? "free";
  const limit = getLimit(plan);

  if (limit === 0) {
    return NextResponse.json({ error: "Linktree pages require a paid plan. Upgrade to publish your first page.", upgrade: true }, { status: 403 });
  }
  if (limit !== -1) {
    const count = await prisma.linktreePage.count({ where: { userId } });
    if (count >= limit) {
      return NextResponse.json({ error: `Plan limit reached. Your ${plan} plan allows ${limit} page${limit !== 1 ? "s" : ""}. Upgrade for more.`, upgrade: true }, { status: 403 });
    }
  }

  const { slug, title, bio, color, links } = await req.json();
  if (!slug || !title) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  const exists = await prisma.linktreePage.findUnique({ where: { slug } });
  if (exists) return NextResponse.json({ error: "That URL slug is already taken. Try another." }, { status: 409 });
  const page = await prisma.linktreePage.create({ data: { userId, slug, title, bio, color, links } });
  await recordFunnelEvent("first_tool_success", { userId, source: "link_page" });
  return NextResponse.json(page);
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const { id, title, bio, color, links } = await req.json();
  const page = await prisma.linktreePage.updateMany({ where: { id, userId }, data: { title, bio, color, links } });
  return NextResponse.json(page);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await req.json();
  await prisma.linktreePage.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
