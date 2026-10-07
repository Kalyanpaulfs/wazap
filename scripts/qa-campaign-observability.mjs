import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const stamp = Date.now();
const email = `campaign-observability-qa-${stamp}@example.com`;
const password = `Wazap-QA-${stamp}!`;
const baseUrl = "https://wazap.lt";

function responseCookies(response) {
  const values = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")];
  return values.filter(Boolean).map(value => String(value).split(";")[0]).join("; ");
}

try {
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { email, password: passwordHash, name: "Campaign Observability QA", plan: "business" } });
  const workspace = await prisma.workspace.create({ data: { name: "Campaign Observability QA", slug: `campaign-observability-qa-${stamp}`, ownerId: user.id } });
  const member = await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
  await prisma.user.update({ where: { id: user.id }, data: { activeWorkspaceId: workspace.id } });
  const connection = await prisma.channelConnection.create({
    data: {
      workspaceId: workspace.id,
      createdByMemberId: member.id,
      channel: "whatsapp",
      provider: "meta_cloud",
      displayName: "Campaign QA",
      status: "active",
      capabilities: ["send", "receive"],
      signingSecretEncrypted: "qa",
      secretPrefix: "qa",
      webhookPathToken: `campaign-observability-qa-${stamp}`,
    },
  });
  const template = await prisma.whatsAppTemplate.create({
    data: {
      workspaceId: workspace.id,
      connectionId: connection.id,
      name: `campaign_qa_${stamp}`,
      language: "en",
      category: "MARKETING",
      status: "approved",
      components: [],
    },
  });
  const old = new Date(Date.now() - 30 * 60_000);
  const campaign = await prisma.whatsAppCampaign.create({
    data: {
      workspaceId: workspace.id,
      connectionId: connection.id,
      templateId: template.id,
      createdByMemberId: member.id,
      name: "Stuck campaign QA",
      status: "scheduled",
      audience: {},
      scheduledFor: old,
      audienceCount: 11,
      eligibleCount: 10,
    },
  });
  const statuses = ["accepted", "sent", "delivered", "delivered", "read", "read", "read", "failed", "failed", "excluded", "processing"];
  await prisma.whatsAppCampaignRecipient.createMany({
    data: statuses.map((status, index) => ({
      workspaceId: workspace.id,
      campaignId: campaign.id,
      contactAddress: `9715000${String(index).padStart(5, "0")}`,
      status,
      exclusionReason: status === "excluded" ? "no_consent" : null,
      lastError: status === "failed" ? "QA failure" : null,
      updatedAt: status === "processing" ? old : new Date(),
    })),
  });

  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`, { headers: { "user-agent": "Mozilla/5.0 Wazap production QA" }, redirect: "manual" });
  const csrf = await csrfResponse.json();
  const csrfCookie = responseCookies(csrfResponse);
  const loginResponse = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: csrfCookie,
      "user-agent": "Mozilla/5.0 Wazap production QA",
    },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, json: "true", callbackUrl: `${baseUrl}/analytics` }),
  });
  const sessionCookie = responseCookies(loginResponse);
  if (!sessionCookie.includes("session-token")) throw new Error(`Login did not return a session cookie (${loginResponse.status})`);

  const headers = { cookie: sessionCookie, "user-agent": "Mozilla/5.0 Wazap production QA" };
  const [analyticsResponse, operationsResponse] = await Promise.all([
    fetch(`${baseUrl}/api/analytics`, { headers }),
    fetch(`${baseUrl}/api/operations`, { headers }),
  ]);
  const analytics = await analyticsResponse.json();
  const operations = await operationsResponse.json();
  const metric = analytics.metrics || {};
  const current = operations.current || {};
  const snapshot = await prisma.operationalSnapshot.create({
    data: { workspaceId: workspace.id, status: current.status, metrics: current.metrics, issues: current.issues },
  });
  const persistedSnapshot = await prisma.operationalSnapshot.findUnique({ where: { id: snapshot.id } });
  const snapshotMetrics = persistedSnapshot?.metrics || {};
  const issueCodes = new Set((current.issues || []).map(issue => issue.code));
  const checks = {
    analyticsStatus: analyticsResponse.status === 200,
    operationsStatus: operationsResponse.status === 200,
    campaigns: metric.campaigns === 1,
    recipients: metric.campaignRecipients === 11,
    accepted: metric.campaignAccepted === 7,
    delivered: metric.campaignDelivered === 5,
    read: metric.campaignRead === 3,
    failed: metric.campaignFailed === 2,
    excluded: metric.campaignExcluded === 1,
    deliveryRate: metric.campaignDeliveryRate === 71.4,
    readRate: metric.campaignReadRate === 60,
    campaignFailures: current.metrics?.campaignFailures === 2,
    campaignExclusions: current.metrics?.campaignExclusions === 1,
    activeCampaigns: current.metrics?.activeCampaigns === 1,
    stuckCampaigns: current.metrics?.stuckCampaigns === 1,
    uncertainDeliveries: current.metrics?.uncertainCampaignRecipients === 1,
    critical: current.status === "critical",
    failureAlert: issueCodes.has("CAMPAIGN_FAILURES"),
    stuckAlert: issueCodes.has("STUCK_CAMPAIGNS"),
    uncertainAlert: issueCodes.has("UNCERTAIN_CAMPAIGN_DELIVERIES"),
    snapshotCampaignFailures: snapshotMetrics.campaignFailures === 2,
    snapshotStuckCampaigns: snapshotMetrics.stuckCampaigns === 1,
    snapshotUncertainDeliveries: snapshotMetrics.uncertainCampaignRecipients === 1,
  };
  const failures = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  if (failures.length) throw new Error(`Campaign observability QA failed: ${failures.join(", ")}`);
  console.log(JSON.stringify({ checks, analytics: { campaigns: metric.campaigns, recipients: metric.campaignRecipients, deliveryRate: metric.campaignDeliveryRate, readRate: metric.campaignReadRate }, operations: { status: current.status, campaignFailures: current.metrics.campaignFailures, campaignExclusions: current.metrics.campaignExclusions, activeCampaigns: current.metrics.activeCampaigns, stuckCampaigns: current.metrics.stuckCampaigns, uncertainCampaignRecipients: current.metrics.uncertainCampaignRecipients, issueCodes: [...issueCodes] }, snapshot: { status: persistedSnapshot?.status, campaignFailures: snapshotMetrics.campaignFailures, stuckCampaigns: snapshotMetrics.stuckCampaigns, uncertainCampaignRecipients: snapshotMetrics.uncertainCampaignRecipients } }));
} finally {
  await prisma.user.deleteMany({ where: { email } });
  const residue = await prisma.user.count({ where: { email } });
  await prisma.$disconnect();
  if (residue) throw new Error(`Campaign observability QA residue remains: ${residue}`);
}
