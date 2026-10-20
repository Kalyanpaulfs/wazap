import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordFunnelEvent } from "@/lib/funnel";
import { linkLimit, PLAN_DISPLAY_NAME } from "@/lib/plan-limits";
import { checkLinkPoolForCreate } from "@/lib/link-pool";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { sameSiteRequest } from "@/lib/crm";
import { isPlausibleE164Digits } from "@/lib/phone";

export const dynamic = "force-dynamic";

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
  return NextResponse.json({ links, limit: linkLimit(plan), plan, planLabel: accountPlanLabel(entitlementUser) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as any).id;
  const entitlementUser = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true } });
  const plan = linkPlan(entitlementUser);
  const poolCheck = await checkLinkPoolForCreate(userId, plan, "shortlink", accountPlanLabel(entitlementUser));
  if (!poolCheck.ok) {
    return NextResponse.json({ error: poolCheck.error, upgrade: true }, { status: 403 });
  }

  const { name, phone, message, slug } = await req.json();
  const p = String(phone ?? "").replace(/\D/g, "");
  if (!name?.trim() || !isPlausibleE164Digits(p)) return NextResponse.json({ error: "A name and a valid phone number (with country code) are required." }, { status: 400 });

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
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as any).id;
  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string") return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await prisma.shortLink.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}

// UX-1 step 4: editing an existing brand/WhatsApp link (name, number,
// message) - the address (code) can never change via this route, so printed
// QR codes and shared links keep working. Same validation as POST.
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as any).id;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Choose a link." }, { status: 400 });

  const existing = await prisma.shortLink.findFirst({ where: { id: body.id, userId } });
  if (!existing) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const data: { name?: string; phone?: string; message?: string; pausedAt?: Date | null } = {};
  // Manual pause (owner feature, distinct from planPausedAt): customer
  // controls this themselves, independent of the plan-pause engine, which
  // never reads/writes this field. A paused link still counts toward the
  // link pool - see lib/link-pool.ts countLiveLinks (planPausedAt only).
  if (body.paused !== undefined) {
    if (typeof body.paused !== "boolean") return NextResponse.json({ error: "Invalid paused value." }, { status: 400 });
    data.pausedAt = body.paused ? new Date() : null;
  }
  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Give it a name." }, { status: 400 });
    data.name = String(body.name).trim().slice(0, 60);
  }
  if (body.phone !== undefined) {
    const p = String(body.phone ?? "").replace(/\D/g, "");
    if (!isPlausibleE164Digits(p)) return NextResponse.json({ error: "A valid phone number (with country code) is required." }, { status: 400 });
    data.phone = p;
  }
  if (body.message !== undefined) {
    if (typeof body.message !== "string") return NextResponse.json({ error: "Invalid message." }, { status: 400 });
    data.message = body.message.slice(0, 600);
  }
  if (!Object.keys(data).length) return NextResponse.json({ error: "No changes supplied." }, { status: 400 });

  const result = await prisma.shortLink.updateMany({ where: { id: body.id, userId }, data });
  if (!result.count) return NextResponse.json({ error: "Link not found." }, { status: 404 });
  const updated = await prisma.shortLink.findFirst({ where: { id: body.id, userId } });
  return NextResponse.json(updated);
}
