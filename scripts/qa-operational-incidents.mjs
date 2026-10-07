import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient(), base = (process.env.WAZAP_QA_BASE_URL || "https://wazap.lt").replace(/\/$/, "");
const stamp = `${Date.now()}-${randomBytes(3).toString("hex")}`, email = `incident-${stamp}@qa.invalid`, password = `Qa-${randomBytes(12).toString("base64url")}`;
let userId;
function addCookies(jar, headers) { const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie")].filter(Boolean); for (const value of values) { const pair = value.split(";", 1)[0]; jar.set(pair.slice(0, pair.indexOf("=")), pair.slice(pair.indexOf("=") + 1)); } }
const cookieHeader = jar => [...jar].map(([key,value]) => `${key}=${value}`).join("; ");
async function api(path, jar, options={}) { const response = await fetch(`${base}${path}`, { ...options, headers: { "user-agent": "Wazap-Incident-QA/1.0", cookie: cookieHeader(jar), ...(options.body ? { "content-type": "application/json" } : {}), ...(options.headers || {}) } }); return { response, data: await response.json() }; }

try {
  const user = await prisma.user.create({ data: { email, name: "Incident QA", password: await bcrypt.hash(password, 10), plan: "business" } }); userId = user.id;
  const workspace = await prisma.workspace.create({ data: { name: "Incident QA", slug: `incident-${stamp}`.slice(0, 60), ownerId: user.id } });
  const member = await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
  await prisma.user.update({ where: { id: user.id }, data: { activeWorkspaceId: workspace.id } });
  const jar = new Map(), csrfResponse = await fetch(`${base}/api/auth/csrf`, { headers: { "user-agent": "Wazap-Incident-QA/1.0" } }); addCookies(jar, csrfResponse.headers); const { csrfToken } = await csrfResponse.json();
  const login = await fetch(`${base}/api/auth/callback/credentials?json=true`, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookieHeader(jar), "user-agent": "Wazap-Incident-QA/1.0" }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/operations`, json: "true" }) }); addCookies(jar, login.headers); assert([200,302].includes(login.status));
  const created = await api("/api/operations/incidents", jar, { method: "POST", body: JSON.stringify({ title: "Provider delivery degradation", summary: "Delivery confirmations are delayed for a controlled QA workflow.", impact: "One disposable QA workflow only.", severity: "sev2", ownerMemberId: member.id }) });
  assert.equal(created.response.status, 201); const incidentId = created.data.incident.id;
  const targetMinutes = (new Date(created.data.incident.responseTargetAt).getTime() - new Date(created.data.incident.createdAt).getTime()) / 60_000;
  assert(targetMinutes >= 29 && targetMinutes <= 31, `SEV-2 acknowledgement target was ${targetMinutes} minutes`);
  const identified = await api("/api/operations/incidents", jar, { method: "PATCH", body: JSON.stringify({ id: incidentId, status: "identified", message: "Controlled QA identified a delayed provider acknowledgement." }) });
  assert.equal(identified.response.status, 200); assert(identified.data.incident.acknowledgedAt);
  const tooShort = await api("/api/operations/incidents", jar, { method: "PATCH", body: JSON.stringify({ id: incidentId, status: "resolved", message: "fixed", resolution: "fixed" }) });
  assert.equal(tooShort.response.status, 400, "Weak resolution evidence was accepted");
  const resolved = await api("/api/operations/incidents", jar, { method: "PATCH", body: JSON.stringify({ id: incidentId, status: "resolved", message: "Controlled delivery acknowledgement recovered and retained QA evidence was reconciled.", resolution: "Controlled delivery acknowledgement recovered and retained QA evidence was reconciled." }) });
  assert.equal(resolved.response.status, 200); assert(resolved.data.incident.resolvedAt);
  const listing = await api("/api/operations/incidents", jar); assert.equal(listing.response.status, 200); assert.equal(listing.data.incidents[0].updates.length, 3);
  const auditCount = await prisma.workspaceAuditEvent.count({ where: { workspaceId: workspace.id, eventType: { in: ["operational_incident_opened", "operational_incident_updated", "operational_incident_resolved"] } } });
  assert.equal(auditCount, 3);
  console.log(JSON.stringify({ ok: true, created: 1, acknowledged: true, weakResolutionRejected: true, resolved: true, retainedUpdates: 3, auditEvents: auditCount }));
} finally {
  await prisma.outboundEmail.deleteMany({ where: { recipient: email } }).catch(() => {});
  if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  const residue = await prisma.user.count({ where: { email } }); await prisma.$disconnect(); if (residue) throw new Error("Incident QA cleanup failed");
}
