import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordFunnelEvent } from "@/lib/funnel";
import { linkLimit, adLinksAvailable, PLAN_DISPLAY_NAME } from "@/lib/plan-limits";
import { checkLinkPoolForCreate } from "@/lib/link-pool";
import { linkPlan } from "@/lib/router-entitlements";
import { accountPlanLabel } from "@/lib/entitlements";
import { sameSiteRequest } from "@/lib/crm";
import { isPlausibleE164Digits } from "@/lib/phone";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ links: [], limit: 0, plan: "free", planLabel: PLAN_DISPLAY_NAME.free });
  const userId = (session.user as any).id;
  const entitlementUser = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true } });
  const plan = linkPlan(entitlementUser);
  const links = await prisma.adLink.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { clickEvents: true } } },
  });
  return NextResponse.json({
    links: links.map(l => ({ ...l, clicks: l._count.clickEvents })),
    limit: adLinksAvailable(plan) ? linkLimit(plan) : 0,
    plan,
    planLabel: accountPlanLabel(entitlementUser),
  });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as any).id;
  const entitlementUser = await prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true, trialPlan: true, trialEndsAt: true } });
  const plan = linkPlan(entitlementUser);
  const poolCheck = await checkLinkPoolForCreate(userId, plan, "adlink", accountPlanLabel(entitlementUser));
  if (!poolCheck.ok) {
    return NextResponse.json({ error: poolCheck.error, upgrade: true }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { name, number, message, utmSource, utmMedium, utmCampaign } = body as Record<string, unknown>;
  const n = String(number ?? "").replace(/\D/g, "");
  if (typeof name !== "string" || !name.trim() || !isPlausibleE164Digits(n)) {
    return NextResponse.json({ error: "A name and a valid phone number (with country code) are required." }, { status: 400 });
  }
  if (message !== undefined && message !== null && typeof message !== "string") {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }
  if (utmSource !== undefined && utmSource !== null && typeof utmSource !== "string") {
    return NextResponse.json({ error: "Invalid utmSource." }, { status: 400 });
  }
  if (utmMedium !== undefined && utmMedium !== null && typeof utmMedium !== "string") {
    return NextResponse.json({ error: "Invalid utmMedium." }, { status: 400 });
  }
  if (utmCampaign !== undefined && utmCampaign !== null && typeof utmCampaign !== "string") {
    return NextResponse.json({ error: "Invalid utmCampaign." }, { status: 400 });
  }
  const link = await prisma.adLink.create({
    data: {
      userId,
      name: name.trim().slice(0, 100),
      number: n,
      message: typeof message === "string" ? message.slice(0, 600) : null,
      utmSource: typeof utmSource === "string" ? utmSource.slice(0, 60) : null,
      utmMedium: typeof utmMedium === "string" ? utmMedium.slice(0, 60) : null,
      utmCampaign: typeof utmCampaign === "string" ? utmCampaign.slice(0, 60) : null,
    },
  });
  await recordFunnelEvent("first_tool_success", { userId, source: "ad_builder" });
  return NextResponse.json(link);
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as any).id;
  const { id } = await req.json().catch(() => ({}));
  if (!id || typeof id !== "string") return NextResponse.json({ error: "Missing id." }, { status: 400 });
  await prisma.adLink.deleteMany({ where: { id, userId } });
  return NextResponse.json({ success: true });
}

// UX-1 step 4: editing an existing ad link (name, number, message, UTM
// fields). The public /a/<id> redirect reads number/message straight from
// the DB, so editing here is safe - there is no separate "code" to protect.
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const userId = (session.user as any).id;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.id !== "string") return NextResponse.json({ error: "Choose a link." }, { status: 400 });

  const existing = await prisma.adLink.findFirst({ where: { id: body.id, userId } });
  if (!existing) return NextResponse.json({ error: "Link not found." }, { status: 404 });

  const data: { name?: string; number?: string; message?: string | null; utmSource?: string | null; utmMedium?: string | null; utmCampaign?: string | null; pausedAt?: Date | null } = {};
  // Manual pause (owner feature, distinct from planPausedAt): customer
  // controls this themselves, independent of the plan-pause engine, which
  // never reads/writes this field. A paused link still counts toward the
  // link pool - see lib/link-pool.ts countLiveLinks (planPausedAt only).
  if (body.paused !== undefined) {
    if (typeof body.paused !== "boolean") return NextResponse.json({ error: "Invalid paused value." }, { status: 400 });
    data.pausedAt = body.paused ? new Date() : null;
  }
  if (body.name !== undefined) {
    if (!body.name || typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Give it a name." }, { status: 400 });
    data.name = String(body.name).trim().slice(0, 100);
  }
  if (body.number !== undefined) {
    const n = String(body.number ?? "").replace(/\D/g, "");
    if (!isPlausibleE164Digits(n)) return NextResponse.json({ error: "A valid phone number (with country code) is required." }, { status: 400 });
    data.number = n;
  }
  if (body.message !== undefined) {
    data.message = typeof body.message === "string" ? body.message.slice(0, 600) : null;
  }
  if (body.utmSource !== undefined) data.utmSource = typeof body.utmSource === "string" ? body.utmSource.slice(0, 60) : null;
  if (body.utmMedium !== undefined) data.utmMedium = typeof body.utmMedium === "string" ? body.utmMedium.slice(0, 60) : null;
  if (body.utmCampaign !== undefined) data.utmCampaign = typeof body.utmCampaign === "string" ? body.utmCampaign.slice(0, 60) : null;
  if (!Object.keys(data).length) return NextResponse.json({ error: "No changes supplied." }, { status: 400 });

  const result = await prisma.adLink.updateMany({ where: { id: body.id, userId }, data });
  if (!result.count) return NextResponse.json({ error: "Link not found." }, { status: 404 });
  const updated = await prisma.adLink.findFirst({ where: { id: body.id, userId } });
  return NextResponse.json(updated);
}
