import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TOOL_LIMITS } from "@/lib/tool-access";
import { recordFunnelEvent } from "@/lib/funnel";

export const dynamic = "force-dynamic";

function getLimit(plan: string) {
  const l = TOOL_LIMITS.catalog;
  if (plan === "business") plan = "ultimate";
  return (l[plan as keyof typeof l] ?? l.free).uses;
}
const slugOk = (s: string) => /^[a-z0-9-]{3,40}$/.test(s);
function genSlug() { return "shop-" + Math.random().toString(36).slice(2, 7); }

type Item = { name: string; price: string; desc: string };
function cleanItems(input: unknown): Item[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((i: any) => ({ name: String(i?.name ?? "").slice(0, 80), price: String(i?.price ?? "").slice(0, 30), desc: String(i?.desc ?? "").slice(0, 200) }))
    .filter((i) => i.name.trim()).slice(0, 100);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json([]);
  const userId = (session.user as any).id;
  const cats = await prisma.catalogPage.findMany({ where: { userId }, include: { orders: { select: { status: true } } }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(cats.map((c) => ({
    id: c.id, slug: c.slug, title: c.title, views: c.views,
    count: Array.isArray(c.items) ? (c.items as unknown[]).length : 0,
    inquiries: c.orders.length,
    won: c.orders.filter((order) => order.status === "won").length,
    planPausedAt: c.planPausedAt,
  })));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const plan = (session.user as any).plan ?? "free";
  const limit = getLimit(plan);

  if (limit === 0) return NextResponse.json({ error: "Catalog pages are a paid feature. Upgrade to publish your WhatsApp order page.", upgrade: true }, { status: 403 });
  if (limit !== -1) {
    const count = await prisma.catalogPage.count({ where: { userId, planPausedAt: null } });
    if (count >= limit) return NextResponse.json({ error: `Plan limit reached — your ${plan} plan allows ${limit} catalog${limit !== 1 ? "s" : ""}. Upgrade for more.`, upgrade: true }, { status: 403 });
  }

  const { title, bio, phone, items, slug } = await req.json();
  const p = String(phone ?? "").replace(/\D/g, "");
  const cleaned = cleanItems(items);
  if (!title?.trim() || p.length < 8 || cleaned.length === 0) {
    return NextResponse.json({ error: "A title, WhatsApp number, and at least one item are required." }, { status: 400 });
  }
  let code: string;
  if (slug && String(slug).trim()) {
    const s = String(slug).trim().toLowerCase();
    if (!slugOk(s)) return NextResponse.json({ error: "Slug must be 3–40 characters: lowercase letters, numbers, hyphens." }, { status: 400 });
    if (await prisma.catalogPage.findUnique({ where: { slug: s } })) return NextResponse.json({ error: "That link is taken — try another." }, { status: 400 });
    code = s;
  } else {
    code = genSlug();
    while (await prisma.catalogPage.findUnique({ where: { slug: code } })) code = genSlug();
  }

  const cat = await prisma.catalogPage.create({
    data: { userId, slug: code, title: String(title).trim().slice(0, 80), bio: String(bio ?? "").slice(0, 200), phone: p, items: cleaned },
  });
  await recordFunnelEvent("first_tool_success", { userId, source: "catalog" });
  return NextResponse.json({ id: cat.id, slug: cat.slug });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await req.json();
  await prisma.catalogPage.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
