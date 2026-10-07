import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const stamp = Date.now();
const email = `api-qa-${stamp}@example.com`;

try {
  const user = await prisma.user.create({ data: { email, name: "API QA", plan: "business" } });
  const workspace = await prisma.workspace.create({ data: { name: "API QA", slug: `api-qa-${stamp}`, ownerId: user.id } });
  const member = await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });
  const token = `wz_live_${randomBytes(5).toString("hex")}_${randomBytes(24).toString("base64url")}`;
  await prisma.apiKey.create({ data: { workspaceId: workspace.id, createdByMemberId: member.id, name: "Production QA", prefix: token.split("_").slice(0, 3).join("_"), keyHash: createHash("sha256").update(token).digest("hex"), scopes: ["leads:read", "leads:write"] } });
  const response = await fetch("https://wazap.lt/api/v1/leads", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "user-agent": "Wazap production QA" }, body: JSON.stringify({ name: "API QA Lead", phone: "+971500000001", source: "Production QA" }) });
  const body = await response.json();
  const [leadCount, activityCount, requestLogCount] = await Promise.all([
    prisma.lead.count({ where: { workspaceId: workspace.id, id: body?.data?.id } }),
    prisma.leadActivity.count({ where: { lead: { workspaceId: workspace.id }, type: "created" } }),
    prisma.apiRequestLog.count({ where: { workspaceId: workspace.id, statusCode: 201 } }),
  ]);
  if (response.status !== 201 || leadCount !== 1 || activityCount !== 1 || requestLogCount !== 1) throw new Error(`API QA failed (${response.status}, ${leadCount}, ${activityCount}, ${requestLogCount})`);
  console.log(JSON.stringify({ status: response.status, leadCount, activityCount, requestLogCount }));
} finally {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
}
