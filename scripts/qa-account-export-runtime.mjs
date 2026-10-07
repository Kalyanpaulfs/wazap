import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const base = (process.env.WAZAP_QA_BASE_URL || "https://wazap.lt").replace(/\/$/, "");
const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const email = `account-export-${stamp}@qa.invalid`;
const password = `Qa-${randomBytes(12).toString("base64url")}`;
const marker = `secret-${randomBytes(12).toString("hex")}`;
let userId;

function addCookies(jar, headers) {
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean);
  for (const value of values) {
    const pair = value.split(";", 1)[0];
    jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1));
  }
}
const cookieHeader = (jar) => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");

try {
  const user = await prisma.user.create({ data: { email, name: "Account Export QA", password: await bcrypt.hash(password, 10), plan: "business" } });
  userId = user.id;
  const workspace = await prisma.workspace.create({ data: { name: "Account Export QA", slug: `account-export-${stamp}`.slice(0, 60), ownerId: user.id } });
  const member = await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
  await prisma.user.update({ where: { id: user.id }, data: { activeWorkspaceId: workspace.id } });
  const apiKey = await prisma.apiKey.create({ data: { workspaceId: workspace.id, createdByMemberId: member.id, name: "Export QA", prefix: `qa_${stamp}`.slice(0, 40), keyHash: createHash("sha256").update(marker).digest("hex"), scopes: ["operations:read"] } });
  await prisma.apiRequestLog.create({ data: { workspaceId: workspace.id, apiKeyId: apiKey.id, requestId: `req-${stamp}`, method: "GET", path: "/api/v1/reliability", statusCode: 200, latencyMs: 12 } });
  await prisma.apiIdempotencyRecord.create({ data: { workspaceId: workspace.id, apiKeyId: apiKey.id, keyHash: createHash("sha256").update(`key-${marker}`).digest("hex"), requestHash: createHash("sha256").update(`body-${marker}`).digest("hex"), method: "POST", path: "/api/v1/tasks", statusCode: 201, response: { data: { safe: "kept", apiKey: marker } }, expiresAt: new Date(Date.now() + 3_600_000) } });
  const endpoint = await prisma.webhookEndpoint.create({ data: { workspaceId: workspace.id, createdByMemberId: member.id, url: `https://example.com/hook?token=${marker}&view=full`, secretEncrypted: marker, secretPrefix: "qa_visible", events: ["task.created"] } });
  const delivery = await prisma.webhookDelivery.create({ data: { endpointId: endpoint.id, eventId: `evt-${stamp}`, eventType: "task.created", payload: { safe: "kept", authorization: marker }, status: "delivered", attempts: 1, deliveredAt: new Date() } });
  await prisma.webhookDeliveryAttempt.create({ data: { deliveryId: delivery.id, attemptNumber: 1, outcome: "delivered", responseStatus: 200, latencyMs: 8 } });
  await prisma.inboxTask.create({ data: { workspaceId: workspace.id, createdByMemberId: member.id, title: "Standalone export task" } });
  await prisma.channelConnection.create({ data: { workspaceId: workspace.id, createdByMemberId: member.id, channel: "email", displayName: "Export QA", signingSecretEncrypted: marker, accessTokenEncrypted: marker, secretPrefix: "qa_channel", webhookPathToken: `qa-${randomBytes(16).toString("hex")}`, config: { clientSecret: marker, safe: "kept" } } });

  const jar = new Map();
  const csrfResponse = await fetch(`${base}/api/auth/csrf`, { headers: { "user-agent": "Wazap-Account-Export-QA/1.0" } });
  addCookies(jar, csrfResponse.headers);
  const { csrfToken } = await csrfResponse.json();
  const loginResponse = await fetch(`${base}/api/auth/callback/credentials?json=true`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(jar), "user-agent": "Wazap-Account-Export-QA/1.0" },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/account`, json: "true" }),
  });
  addCookies(jar, loginResponse.headers);
  assert([200, 302].includes(loginResponse.status), `Login returned ${loginResponse.status}`);
  const exportResponse = await fetch(`${base}/api/account/export`, { headers: { cookie: cookieHeader(jar), "user-agent": "Wazap-Account-Export-QA/1.0" } });
  assert.equal(exportResponse.status, 200, `Export returned ${exportResponse.status}`);
  assert.match(exportResponse.headers.get("content-disposition") || "", /wazap-account-export/);
  const body = await exportResponse.text();
  const data = JSON.parse(body);
  assert.equal(data.exportVersion, "2026-08-03");
  const owned = data.ownedWorkspaces?.[0];
  assert.equal(owned.inboxTasks?.[0]?.title, "Standalone export task");
  assert.equal(owned.apiRequestLogs?.[0]?.requestId, `req-${stamp}`);
  assert.equal(owned.webhookEndpoints?.[0]?.deliveries?.[0]?.deliveryAttempts?.[0]?.outcome, "delivered");
  assert.equal(owned.channelConnections?.[0]?.config?.safe, "kept");
  assert(!body.includes(marker), "Secret marker leaked from the runtime export");
  assert(!body.includes("signingSecretEncrypted") && !body.includes("webhookPathToken") && !body.includes('"keyHash"'), "Secret fields were present in the runtime export");
  console.log(JSON.stringify({ ok: true, authenticatedExport: true, secretLeak: false, webhookAttempts: 1, standaloneTasks: 1 }));
} finally {
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  const residue = await prisma.user.count({ where: { email } });
  await prisma.$disconnect();
  if (residue) throw new Error("Ephemeral account-export QA cleanup failed");
}
