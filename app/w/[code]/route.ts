import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recordConversationStart } from "@/lib/conversations";
import { rateLimit } from "@/lib/rate-limit";
import { requestIp } from "@/lib/request-ip";

// Bot protection (FEAT-PLAN-LIMITS): see app/r/[code]/route.ts for the
// rationale. A real visitor is always redirected; over ~10 hits/minute for
// the same IP+code we just stop counting the click.
export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await prisma.shortLink.findUnique({ where: { code: code.toLowerCase() } });
  if (!link) redirect("/");
  if (link.planPausedAt) redirect("/link-paused?type=shortlink");

  const ip = requestIp(req.headers);
  if (rateLimit(`redirect:w:${code.toLowerCase()}:${ip}`, 10, 60_000)) {
    await prisma.shortLink.update({ where: { id: link!.id }, data: { clicks: { increment: 1 } } });
    await recordConversationStart({
      userId: link.userId,
      assetType: "short_link",
      assetId: link.id,
      assetName: link.name,
      source: "Wazap short link",
      destination: link.phone,
    });
  }

  const target = `https://wa.me/${link!.phone}${link!.message ? `?text=${encodeURIComponent(link!.message)}` : ""}`;
  redirect(target);
}
