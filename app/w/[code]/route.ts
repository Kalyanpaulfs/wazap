import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { recordConversationStart } from "@/lib/conversations";

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await prisma.shortLink.findUnique({ where: { code: code.toLowerCase() } });
  if (!link) redirect("/");

  await prisma.shortLink.update({ where: { id: link!.id }, data: { clicks: { increment: 1 } } });
  await recordConversationStart({
    userId: link.userId,
    assetType: "short_link",
    assetId: link.id,
    assetName: link.name,
    source: "Wazap short link",
    destination: link.phone,
  });

  const target = `https://wa.me/${link!.phone}${link!.message ? `?text=${encodeURIComponent(link!.message)}` : ""}`;
  redirect(target);
}
