import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

for (const raw of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(raw)) continue;
  const separator = raw.indexOf("=");
  const key = raw.slice(0, separator);
  let value = raw.slice(separator + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
  process.env[key] = value;
}

const prisma = new PrismaClient();
const campaignType = "trial_conversion_20260813";
const base = process.env.NEXTAUTH_URL || "https://wazap.lt";

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function render(name, days) {
  const hi = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  const timeLeft = days > 0 ? `${days} day${days !== 1 ? "s" : ""} left in your Growth trial` : "your Growth trial ending today";
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323"><div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="color:#25D366;font-weight:800;font-size:20px">Wazap</span></div><div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65"><p style="margin:0 0 12px">${hi}</p><h1 style="margin:0 0 12px;color:#fff;font-size:27px;line-height:1.2">Keep your Wazap workflows working after your trial.</h1><p style="margin:0 0 20px;color:#9fb0a3">With ${timeLeft}, now is the best time to choose the plan that fits how you handle WhatsApp leads.</p><div style="background:#0f1b13;border:1px solid #1d3323;border-radius:14px;padding:17px 18px;margin:0 0 22px;color:#9fb0a3"><div style="color:#fff;font-weight:700;margin-bottom:8px">Plans start at $19/month</div>Keep your tracked links, lead pipeline, follow-up workflows, analytics and higher usage limits. Pay securely by card or PayPal.</div><p style="margin:22px 0"><a href="${base}/pricing?utm_source=trial_email&amp;utm_medium=email&amp;utm_campaign=trial_conversion_20260813" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Choose my Wazap plan →</a></p><p style="margin:18px 0 0;color:#718078;font-size:12px">No automatic charge will occur. Need help choosing? Reply to this email and tell us how many people handle your WhatsApp leads.</p></div><div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Business conversation software</div></div>`;
}

const now = new Date();
const users = await prisma.user.findMany({
  where: { isAdmin: false, plan: "free", trialEndsAt: { gt: now }, accountDeletionScheduledFor: null },
  select: { id: true, email: true, name: true, trialEndsAt: true },
});

let queued = 0;
let skipped = 0;
for (const user of users) {
  const exists = await prisma.outboundEmail.findFirst({ where: { userId: user.id, type: campaignType } });
  if (exists) { skipped++; continue; }
  const days = Math.max(1, Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / 86_400_000));
  await prisma.outboundEmail.create({ data: { userId: user.id, recipient: user.email, type: campaignType, subject: "Keep your Wazap workflows after your trial", html: render(user.name, days) } });
  queued++;
}
console.log(JSON.stringify({ eligible: users.length, queued, skipped, campaignType }));
await prisma.$disconnect();
