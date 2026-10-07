import { PrismaClient } from "@prisma/client";
import { createHmac } from "crypto";

const prisma = new PrismaClient();
const escapeHtml = (value) => String(value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

try {
  if (!process.env.NEXTAUTH_SECRET) throw new Error("NEXTAUTH_SECRET is required.");
  const users = await prisma.user.findMany({ where: { marketingOptOutAt: null, email: { contains: "@" } }, select: { id: true, email: true, name: true } });
  let queued = 0;
  for (const user of users) {
    if (await prisma.outboundEmail.findFirst({ where: { userId: user.id, type: "marketing_flow_beta_20260814" }, select: { id: true } })) continue;
    const token = createHmac("sha256", process.env.NEXTAUTH_SECRET).update(`marketing:${user.id}`).digest("base64url");
    const unsubscribe = `https://wazap.lt/api/email/unsubscribe?u=${encodeURIComponent(user.id)}&t=${encodeURIComponent(token)}`;
    const greeting = user.name ? `Hi ${escapeHtml(user.name)},` : "Hi,";
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;max-width:620px;margin:auto;background:#0b120d;color:#cbd5e1;border:1px solid #1d3323;border-radius:20px;overflow:hidden"><div style="padding:22px 28px;border-bottom:1px solid #1d3323;color:#25D366;font-size:21px;font-weight:800">Wazap</div><div style="padding:30px 28px"><p>${greeting}</p><p style="color:#25D366;font-size:12px;font-weight:800;letter-spacing:.12em;text-transform:uppercase">Introducing Wazap Flow beta</p><h1 style="color:#fff;font-size:30px;line-height:1.2">WhatsApp conversations and customer follow-up, together.</h1><p style="line-height:1.7;color:#9fb0a3">Wazap now brings official WhatsApp API conversations into a shared team inbox and CRM. Incoming messages can create leads automatically, teams can assign owners, add notes and tasks, track pipeline stages, request AI drafts, and reply through Meta during the customer-service window.</p><div style="background:#0f1b13;border:1px solid #1d3323;border-radius:14px;padding:16px 18px;margin:20px 0"><b style="color:#fff">Included in this beta</b><p style="margin:8px 0 0;line-height:1.7;color:#9fb0a3">Shared inbox · Official WhatsApp connection · CRM stages · Follow-up dates · Team assignment · Delivery/read states · Consent and template operations</p></div><p><a href="https://wazap.lt/flow" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px">Explore Wazap Flow →</a></p><p style="font-size:12px;color:#718078;line-height:1.6">Instagram and Messenger messaging will be activated after their Meta permissions are approved. We will never present an unapproved channel as live.</p></div><div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">You received this product announcement because you have a Wazap account. <a href="${unsubscribe}" style="color:#8aa091">Unsubscribe from product announcements</a>.</div></div>`;
    await prisma.outboundEmail.create({ data: { userId: user.id, recipient: user.email, type: "marketing_flow_beta_20260814", subject: "Introducing Wazap Flow: WhatsApp CRM + shared inbox", html } });
    queued++;
  }
  console.log(JSON.stringify({ eligible: users.length, queued }));
} finally {
  await prisma.$disconnect();
}
