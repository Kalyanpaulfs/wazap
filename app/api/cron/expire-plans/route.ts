import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Daily: downgrade any paid plan whose paid period has ended. Runs on a
// schedule so expiry is automatic (not only when the admin page loads).
// Active card subscriptions get their planExpiresAt extended by the LS
// renewal webhook BEFORE it lapses, so this only catches genuinely-ended ones.
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await prisma.user.updateMany({
    where: { plan: { not: "free" }, planExpiresAt: { not: null, lte: new Date() } },
    data: { plan: "free", planExpiresAt: null },
  });
  return NextResponse.json({ ok: true, expired: result.count });
}
