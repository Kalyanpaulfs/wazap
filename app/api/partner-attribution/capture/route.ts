import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanText, marketplaceMutationAllowed } from "@/lib/marketplace";
import { PARTNER_ATTRIBUTION_WINDOW_DAYS, PARTNER_TERMS_VERSION, PARTNER_TOUCH_COOKIE, partnerToken, partnerTokenHash, readPartnerTouchCookie } from "@/lib/partner-attribution";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  if (!marketplaceMutationAllowed(req)) return NextResponse.json({ recorded: false }, { status: 202 });
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!rateLimit(`partner-touch:${ip}`, 10, 60_000)) return NextResponse.json({ recorded: false, limited: true }, { status: 202 });
  const existingToken = readPartnerTouchCookie(req);
  if (existingToken) {
    const existing = await prisma.partnerReferralTouch.findUnique({ where: { tokenHash: partnerTokenHash(existingToken) }, select: { expiresAt: true, claimedAt: true, partner: { select: { status: true, termsVersion: true, termsAcceptedAt: true } } } });
    if (existing && !existing.claimedAt && existing.expiresAt > new Date() && existing.partner.status === "active" && existing.partner.termsVersion === PARTNER_TERMS_VERSION && existing.partner.termsAcceptedAt) return NextResponse.json({ recorded: true, firstTouchPreserved: true });
  }
  const body = await req.json().catch(() => ({}));
  const referralCode = cleanText(body.partnerCode, 80).toLowerCase();
  if (!/^wz-[a-f0-9]{10}$/.test(referralCode)) return NextResponse.json({ recorded: false }, { status: 202 });
  const partner = await prisma.partnerAccount.findFirst({ where: { referralCode, status: "active", termsVersion: PARTNER_TERMS_VERSION, termsAcceptedAt: { not: null }, attributionWindowDays: PARTNER_ATTRIBUTION_WINDOW_DAYS }, select: { id: true } });
  if (!partner) return NextResponse.json({ recorded: false }, { status: 202 });
  const token = partnerToken(), expiresAt = new Date(Date.now() + PARTNER_ATTRIBUTION_WINDOW_DAYS * 86_400_000);
  await prisma.partnerReferralTouch.create({ data: { partnerId: partner.id, tokenHash: partnerTokenHash(token), source: cleanText(body.source, 100) || "partner", landingPage: cleanText(body.landingPage, 200) || null, expiresAt } });
  const response = NextResponse.json({ recorded: true, windowDays: PARTNER_ATTRIBUTION_WINDOW_DAYS });
  response.cookies.set({ name: PARTNER_TOUCH_COOKIE, value: token, httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: PARTNER_ATTRIBUTION_WINDOW_DAYS * 86_400 });
  return response;
}
