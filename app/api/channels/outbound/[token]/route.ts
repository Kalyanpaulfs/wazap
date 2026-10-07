import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyChannelSignature } from "@/lib/channels";
import { rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!rateLimit(`channel-outbound:${token}`, 120, 60_000)) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  const connection = await prisma.channelConnection.findUnique({ where: { webhookPathToken: token } });
  if (!connection || connection.status !== "active" || !connection.capabilities.includes("send") || !connection.capabilities.includes("delivery_receipts")) return NextResponse.json({ error: "Verified outbound connection not found." }, { status: 404 });
  const timestamp = req.headers.get("x-wazap-timestamp") || ""; const signature = req.headers.get("x-wazap-channel-signature") || "";
  if (!verifyChannelSignature(connection.signingSecretEncrypted, timestamp, "GET", signature)) return NextResponse.json({ error: "Invalid or expired signature." }, { status: 401 });
  const messages = await prisma.inboxMessage.findMany({ where: { direction: "outbound", deliveryStatus: "queued", conversation: { workspaceId: connection.workspaceId, channelConnectionId: connection.id } }, orderBy: { createdAt: "asc" }, take: 25, select: { id: true, text: true, createdAt: true, conversation: { select: { id: true, channel: true, contactAddress: true, externalThreadId: true } } } });
  return NextResponse.json({ messages: messages.map(message => ({ localMessageId: message.id, text: message.text, createdAt: message.createdAt, conversationId: message.conversation.id, channel: message.conversation.channel, destination: message.conversation.contactAddress, externalThreadId: message.conversation.externalThreadId })), idempotency: "Use localMessageId as the provider idempotency key. Report message.status to the inbound endpoint." });
}
