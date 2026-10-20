import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ownsSupport } from "@/lib/support-session";
export const runtime = "nodejs";

async function sessionUser() {
  const session = await getServerSession(authOptions);
  return session?.user as { id?: string; isAdmin?: boolean } | undefined;
}

/** Serves one attachment's bytes - only to the visitor who owns the conversation, a logged-in user on the message's ticket (so a customer can see their own screenshots from another device/session), or a logged-in admin. Everyone else gets 404 (never 403, so an attachment id does not confirm it exists). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const visitorId = (searchParams.get("visitorId") || "").trim().slice(0, 120);

  const attachment = await prisma.supportAttachment.findUnique({
    where: { id },
    select: {
      mimeType: true,
      data: true,
      conversation: { select: { visitorId: true } },
      message: { select: { ticket: { select: { userId: true } } } },
    },
  });
  if (!attachment) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isVisitorOwner = Boolean(visitorId) && ownsSupport(req, visitorId) && visitorId === attachment.conversation.visitorId;
  const user = isVisitorOwner ? null : await sessionUser();
  const isUserOwner = !isVisitorOwner && Boolean(user?.id) && user!.id === attachment.message?.ticket?.userId;
  const isAdmin = !isVisitorOwner && !isUserOwner && Boolean(user?.isAdmin);
  if (!isVisitorOwner && !isUserOwner && !isAdmin) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      "Content-Type": attachment.mimeType,
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=3600",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
