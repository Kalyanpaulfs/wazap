import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordFunnelEvent } from "@/lib/funnel";
import { shortLinkLimit, PLAN_DISPLAY_NAME } from "@/lib/plan-limits";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";

export const dynamic = "force-dynamic";

function getLimit(plan: string) {
  return shortLinkLimit(plan);
}
function genCode() { return Math.random().toString(36).slice(2, 8).toLowerCase(); }
async function uniqueCode(): Promise<string> {
  let c = genCode();
  while (await prisma.shortLink.findUnique({ where: { code: c } })) c = genCode();
  return c;
}
const slugOk = (s: string) => /^[a-z0-9-]{3,30}$/.test(s);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ links: [], limit: 0, plan: "free", planLabel: PLAN_DISPLAY_NAME.free });
  const userId = (session.user as any).id;
  const entitlementUser = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true } });
  const plan = linkPlan(entitlementUser);
  const links = await prisma.shortLink.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ links, limit: getLimit(plan), plan, planLabel: accountPlanLabel(entitlementUser) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const entitlementUser = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true } });
  const plan = linkPlan(entitlementUser);
  const limit = getLimit(plan);

  if (limit === 0) {
    return NextResponse.json({ error: "Choose a plan to create short links.", upgrade: true }, { status: 403 });
  }
  const count = await prisma.shortLink.count({ where: { userId, planPausedAt: null } });
  if (count >= limit) {
    return NextResponse.json({ error: `Plan limit reached — your ${accountPlanLabel(entitlementUser)} plan allows ${limit} short link${limit !== 1 ? "s" : ""}. Upgrade for more.`, upgrade: true }, { status: 403 });
  }

  const { name, phone, message, slug } = await req.json();
  const p = String(phone ?? "").replace(/\D/g, "");
  if (!name?.trim() || p.length < 8) return NextResponse.json({ error: "A name and a valid phone number (with country code) are required." }, { status: 400 });

  let code: string;
  if (slug && String(slug).trim()) {
    const s = String(slug).trim().toLowerCase();
    if (!slugOk(s)) return NextResponse.json({ error: "Custom slug must be 3–30 characters: lowercase letters, numbers, hyphens." }, { status: 400 });
    if (await prisma.shortLink.findUnique({ where: { code: s } })) return NextResponse.json({ error: "That slug is already taken — try another." }, { status: 400 });
    code = s;
  } else {
    code = await uniqueCode();
  }

  const link = await prisma.shortLink.create({
    data: { userId, name: String(name).trim().slice(0, 60), phone: p, message: String(message ?? "").slice(0, 600), code },
  });
  await recordFunnelEvent("first_tool_success", { userId, source: "shortlink" });
  return NextResponse.json(link);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id;
  const { id } = await req.json();
  await prisma.shortLink.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}
