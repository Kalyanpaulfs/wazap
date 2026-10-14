import { sendSafeWebhook } from "@/lib/safe-webhook-request";
import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decryptSecret, webhookRetryAt } from "@/lib/developer-platform";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.$executeRaw`DELETE FROM "SecurityRateLimit" WHERE "key" IN (SELECT "key" FROM "SecurityRateLimit" WHERE "resetAt" < now() ORDER BY "resetAt" LIMIT 10000)`;
  const now = new Date();
  await prisma.webhookDelivery.updateMany({
    where: { status: "processing", updatedAt: { lte: new Date(now.getTime() - 15 * 60_000) } },
    data: { status: "queued", nextAttemptAt: now, lastError: "Recovered after an interrupted delivery worker." },
  });
  const ids = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT wd."id" FROM "WebhookDelivery" wd
      JOIN "WebhookEndpoint" we ON we."id" = wd."endpointId"
      WHERE wd."status" = 'queued' AND wd."nextAttemptAt" <= ${now} AND wd."attempts" < 8 AND we."status" = 'active'
      ORDER BY wd."createdAt" ASC FOR UPDATE OF wd SKIP LOCKED LIMIT 25
    `);
    if (rows.length) await tx.webhookDelivery.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { status: "processing" } });
    return rows.map((row) => row.id);
  });
  const deliveries = ids.length ? await prisma.webhookDelivery.findMany({ where: { id: { in: ids } }, include: { endpoint: true }, orderBy: { createdAt: "asc" } }) : [];
  let delivered = 0, failed = 0;
  for (const item of deliveries) {
    const started = Date.now();
    let responseStatus: number | undefined, lastError: string | undefined, errorCode: string | undefined;
    try {
      const body = JSON.stringify(item.payload), timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = createHmac("sha256", decryptSecret(item.endpoint.secretEncrypted)).update(`${timestamp}.${body}`).digest("hex");
      const response = await sendSafeWebhook(item.endpoint.url, body, { "content-type": "application/json", "user-agent": "Wazap-Webhooks/1.0", "x-wazap-event": item.eventType, "x-wazap-event-id": item.eventId, "x-wazap-timestamp": timestamp, "x-wazap-signature": `v1=${signature}` });
      responseStatus = response.status;
      if (response.status >= 200 && response.status < 300) {
        await prisma.$transaction([
          prisma.webhookDeliveryAttempt.create({ data: { deliveryId: item.id, attemptNumber: item.attempts + 1, outcome: "delivered", responseStatus: response.status, latencyMs: Date.now() - started } }),
          prisma.webhookDelivery.update({ where: { id: item.id }, data: { status: "delivered", attempts: { increment: 1 }, responseStatus: response.status, deliveredAt: new Date(), lastError: null } }),
          prisma.webhookEndpoint.update({ where: { id: item.endpointId }, data: { failureCount: 0, lastDeliveredAt: new Date() } }),
        ]);
        delivered++;
        continue;
      }
      errorCode = `HTTP_${response.status}`;
      lastError = `Endpoint returned HTTP ${response.status}`;
    } catch (error) {
      const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      errorCode = timedOut ? "TIMEOUT" : "DELIVERY_ERROR";
      lastError = error instanceof Error ? error.message.slice(0, 500) : "Webhook delivery failed";
    }
    const attempts = item.attempts + 1, disable = attempts >= 8;
    await prisma.$transaction([
      prisma.webhookDeliveryAttempt.create({ data: { deliveryId: item.id, attemptNumber: attempts, outcome: disable ? "failed" : "retrying", responseStatus: responseStatus ?? null, latencyMs: Date.now() - started, errorCode } }),
      prisma.webhookDelivery.update({ where: { id: item.id }, data: { attempts, responseStatus: responseStatus ?? null, lastError, status: disable ? "failed" : "queued", nextAttemptAt: disable ? new Date() : webhookRetryAt(attempts) } }),
      prisma.webhookEndpoint.update({ where: { id: item.endpointId }, data: { failureCount: { increment: 1 }, ...(disable ? { status: "disabled", disabledAt: new Date() } : {}) } }),
    ]);
    failed++;
  }
  return NextResponse.json({ attempted: deliveries.length, delivered, failed, retryScheduleMinutes: [1, 5, 15, 60, 240, 720, 1440], maxAttempts: 8 });
}
