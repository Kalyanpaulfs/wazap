import { createCipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const stamp = Date.now();
const email = `bridge-qa-${stamp}@example.com`;
const token = `bridge-qa-${stamp}`;
const secret = `wzch_${randomBytes(32).toString("base64url")}`;
const baseUrl = "https://wazap.lt";

const envText = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split(/\r?\n/).filter(line => line && !line.startsWith("#") && line.includes("=")).map(line => {
  const index = line.indexOf("=");
  return [line.slice(0, index), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
}));

function encrypt(value) {
  const source = env.WEBHOOK_ENCRYPTION_KEY || env.NEXTAUTH_SECRET;
  const key = createHash("sha256").update(source).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function signedHeaders(raw) {
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex");
  return { "content-type": "application/json", "user-agent": "Mozilla/5.0 Wazap bridge QA", "x-wazap-timestamp": timestamp, "x-wazap-channel-signature": `v1=${signature}` };
}

async function postEvent(body) {
  const raw = JSON.stringify(body);
  const response = await fetch(`${baseUrl}/api/channels/inbound/${token}`, { method: "POST", headers: signedHeaders(raw), body: raw });
  return { response, body: await response.json() };
}

try {
  const user = await prisma.user.create({ data: { email, name: "Bridge QA", plan: "business" } });
  const workspace = await prisma.workspace.create({ data: { name: "Bridge QA", slug: `bridge-qa-${stamp}`, ownerId: user.id } });
  const member = await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
  const connection = await prisma.channelConnection.create({
    data: {
      workspaceId: workspace.id,
      createdByMemberId: member.id,
      channel: "telegram",
      provider: "custom_bridge",
      displayName: "Bidirectional QA",
      status: "pending_verification",
      capabilities: ["receive"],
      signingSecretEncrypted: encrypt(secret),
      secretPrefix: secret.slice(0, 13),
      webhookPathToken: token,
      config: { retention: "normalized_only", outbound: false },
    },
  });

  const verification = await postEvent({ eventId: `verify-${stamp}`, type: "verification", capabilities: ["send", "delivery_receipts"] });
  const verifiedConnection = await prisma.channelConnection.findUnique({ where: { id: connection.id } });
  const conversation = await prisma.inboxConversation.create({ data: { workspaceId: workspace.id, channelConnectionId: connection.id, channel: "telegram", contactName: "QA Customer", contactAddress: `qa-${stamp}` } });
  const message = await prisma.inboxMessage.create({ data: { conversationId: conversation.id, direction: "outbound", senderType: "system", text: "Bridge QA message", deliveryStatus: "queued" } });

  const getTimestamp = String(Date.now());
  const getSignature = createHmac("sha256", secret).update(`${getTimestamp}.GET`).digest("hex");
  const queueResponse = await fetch(`${baseUrl}/api/channels/outbound/${token}`, { headers: { "user-agent": "Mozilla/5.0 Wazap bridge QA", "x-wazap-timestamp": getTimestamp, "x-wazap-channel-signature": `v1=${getSignature}` } });
  const queue = await queueResponse.json();
  const badSignatureResponse = await fetch(`${baseUrl}/api/channels/outbound/${token}`, { headers: { "user-agent": "Mozilla/5.0 Wazap bridge QA", "x-wazap-timestamp": getTimestamp, "x-wazap-channel-signature": `v1=${"0".repeat(64)}` } });

  const accepted = await postEvent({ eventId: `accepted-${stamp}`, type: "message.status", localMessageId: message.id, providerMessageId: `provider-${stamp}`, status: "accepted" });
  const delivered = await postEvent({ eventId: `delivered-${stamp}`, type: "message.status", localMessageId: message.id, providerMessageId: `provider-${stamp}`, status: "delivered" });
  const read = await postEvent({ eventId: `read-${stamp}`, type: "message.status", localMessageId: message.id, providerMessageId: `provider-${stamp}`, status: "read" });
  const duplicate = await postEvent({ eventId: `read-${stamp}`, type: "message.status", localMessageId: message.id, providerMessageId: `provider-${stamp}`, status: "read" });
  const downgrade = await postEvent({ eventId: `late-sent-${stamp}`, type: "message.status", localMessageId: message.id, providerMessageId: `provider-${stamp}`, status: "sent" });
  const lateFailure = await postEvent({ eventId: `late-failed-${stamp}`, type: "message.status", localMessageId: message.id, providerMessageId: `provider-${stamp}`, status: "failed", error: "late provider failure" });

  const [storedMessage, eventCount, receiptEventCount] = await Promise.all([
    prisma.inboxMessage.findUnique({ where: { id: message.id } }),
    prisma.channelEvent.count({ where: { connectionId: connection.id } }),
    prisma.inboxEvent.count({ where: { conversationId: conversation.id, type: { startsWith: "channel_message_" } } }),
  ]);
  const checks = {
    verificationStatus: verification.response.status === 200,
    capabilities: JSON.stringify(verifiedConnection?.capabilities) === JSON.stringify(["receive", "send", "delivery_receipts"]),
    outboundConfig: verifiedConnection?.config?.outbound === true,
    queueStatus: queueResponse.status === 200,
    queueContainsMessage: queue.messages?.length === 1 && queue.messages[0].localMessageId === message.id,
    invalidSignatureRejected: badSignatureResponse.status === 401,
    accepted: accepted.response.status === 200 && accepted.body.status === "accepted",
    delivered: delivered.response.status === 200 && delivered.body.status === "delivered",
    read: read.response.status === 200 && read.body.status === "read",
    duplicate: duplicate.response.status === 200 && duplicate.body.duplicate === true,
    downgradeIgnored: downgrade.response.status === 200 && downgrade.body.ignored === true && downgrade.body.status === "read",
    lateFailureIgnored: lateFailure.response.status === 200 && lateFailure.body.ignored === true && lateFailure.body.status === "read",
    finalStatusRead: storedMessage?.deliveryStatus === "read" && Boolean(storedMessage.readAt),
    providerIdPersisted: storedMessage?.providerMessageId === `provider-${stamp}`,
    eventIdempotency: eventCount === 6,
    receiptAuditTrail: receiptEventCount === 5,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length) throw new Error(`Bidirectional bridge QA failed: ${failures.join(", ")}`);
  console.log(JSON.stringify({ checks, queue: { count: queue.messages.length, localMessageId: queue.messages[0].localMessageId }, finalMessage: { status: storedMessage.deliveryStatus, providerMessageId: storedMessage.providerMessageId, readAt: storedMessage.readAt }, audit: { channelEvents: eventCount, receiptEvents: receiptEventCount } }));
} finally {
  await prisma.user.deleteMany({ where: { email } });
  const residue = await Promise.all([
    prisma.user.count({ where: { email } }),
    prisma.workspace.count({ where: { slug: `bridge-qa-${stamp}` } }),
    prisma.channelConnection.count({ where: { webhookPathToken: token } }),
  ]);
  await prisma.$disconnect();
  if (residue.some(Boolean)) throw new Error(`Bidirectional bridge QA residue remains: ${residue.join(",")}`);
}
