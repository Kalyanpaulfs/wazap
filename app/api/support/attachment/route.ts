import { ownsSupport } from "@/lib/support-session";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { capturedChat, sameSiteRequest } from "@/lib/crm";
import { requestIp } from "@/lib/request-ip";
import { checkAttachment } from "@/lib/support-attachment";
import { recordAttachmentTurn } from "@/lib/support-chat-service";
export const runtime = "nodejs";

const MAX_CAPTION = 4000;
const MAX_PER_CONVERSATION_PER_HOUR = 10;

export async function POST(req: Request) {
  if (!sameSiteRequest(req)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const ip = requestIp(req.headers);
  if (!rateLimit(`support-attachment-ip:${ip}`, 40, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Please wait a moment before sending another screenshot." }, { status: 429 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });

  const visitorId = typeof form.get("visitorId") === "string" ? (form.get("visitorId") as string).trim().slice(0, 120) : "";
  const captionRaw = form.get("caption");
  const caption = typeof captionRaw === "string" ? captionRaw.trim().slice(0, MAX_CAPTION) : null;
  const file = form.get("file");

  if (!ownsSupport(req, visitorId)) return NextResponse.json({ error: "Support session required." }, { status: 403 });
  if (!(file instanceof Blob)) return NextResponse.json({ error: "A screenshot is required." }, { status: 400 });

  const profile = await capturedChat(visitorId);
  if (!profile) return NextResponse.json({ error: "Please enter your name, email and phone number before starting chat.", contactRequired: true }, { status: 422 });

  if (!rateLimit(`support-attachment:${profile.id}`, MAX_PER_CONVERSATION_PER_HOUR, 60 * 60 * 1000)) {
    return NextResponse.json({ error: "Too many screenshots in this chat. Please wait before sending another." }, { status: 429 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  const check = checkAttachment(bytes.byteLength, bytes);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });

  const result = await recordAttachmentTurn({
    visitorId,
    caption,
    mimeType: check.mimeType,
    size: bytes.byteLength,
    data: Buffer.from(bytes),
  });

  return NextResponse.json({
    supportRequest: true,
    conversationId: result.conversationId,
    messageId: result.messageId,
    attachmentId: result.attachmentId,
    mimeType: check.mimeType,
    handoff: result.handoff,
  });
}
