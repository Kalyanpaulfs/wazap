import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const execute = process.argv.includes("--execute");
const excludedAddress = /(?:test|paytest|example\.com|t@t\.com|joseph\+wazap-paytest)/i;

function escapeHtml(value = "") {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function welcomeHtml(name) {
  const greeting = name ? `Hi ${escapeHtml(name)},` : "Hi,";
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0b120d;border-radius:20px;overflow:hidden;border:1px solid #1d3323;box-shadow:0 18px 50px rgba(0,0,0,.24)">
    <div style="background:#0d1710;padding:22px 28px;border-bottom:1px solid #1d3323"><span style="display:inline-block;width:12px;height:12px;border:2px solid #25D366;border-radius:50%;vertical-align:-1px;margin-right:9px"></span><span style="color:#25D366;font-weight:800;font-size:20px;letter-spacing:-.4px">Wazap</span></div>
    <div style="padding:30px 28px;color:#cbd5e1;font-size:15px;line-height:1.65">
      <p style="margin:0 0 12px">${greeting}</p>
      <h1 style="margin:0 0 12px;color:#fff;font-size:28px;line-height:1.2;letter-spacing:-.7px">Turn more WhatsApp clicks into conversations.</h1>
      <p style="margin:0 0 20px;color:#9fb0a3">Your Wazap workspace is ready. Create your first professional WhatsApp workflow in a few minutes.</p>
      <div style="background:#0f1b13;border:1px solid #1d3323;border-radius:14px;padding:17px 18px;margin:0 0 22px"><div style="color:#fff;font-weight:700;margin-bottom:7px">A good first workflow</div><div style="color:#9fb0a3">Create a tracked link or QR code, add your message, then follow every click from your dashboard. Teams can also route leads automatically with the WhatsApp rotator.</div></div>
      <p style="margin:22px 0"><a href="https://wazap.lt/dashboard" style="display:inline-block;background:#25D366;color:#061008;text-decoration:none;font-weight:800;padding:13px 22px;border-radius:999px;margin:0 8px 8px 0">Create my first workflow →</a><a href="https://wazap.lt/pricing" style="display:inline-block;border:1px solid #31513a;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:999px;margin-bottom:8px">See plans</a></p>
      <p style="margin:18px 0 0;color:#718078;font-size:12px">Need help choosing a plan? Reply to this email or open Wazap support and tell us how many people handle your WhatsApp leads.</p>
    </div>
    <div style="padding:16px 28px;background:#080e09;color:#5f6f63;font-size:11px;text-align:center">Wazap.lt · Professional WhatsApp workflow software</div>
  </div>`;
}

try {
  const users = await prisma.user.findMany({
    where: { isAdmin: false },
    select: { id: true, email: true, name: true },
  });
  const eligible = users.filter(user => user.email && !excludedAddress.test(user.email));
  const existing = new Set((await prisma.outboundEmail.findMany({
    where: { type: "welcome" },
    select: { recipient: true },
  })).map(message => message.recipient.toLowerCase()));
  const pending = eligible.filter(user => !existing.has(user.email.toLowerCase()));

  if (execute && pending.length) {
    await prisma.outboundEmail.createMany({
      data: pending.map(user => ({
        userId: user.id,
        recipient: user.email.toLowerCase(),
        type: "welcome",
        subject: "Welcome to Wazap — your workspace is ready",
        html: welcomeHtml(user.name),
      })),
    });
  }

  console.log(JSON.stringify({ eligible: eligible.length, alreadyQueued: eligible.length - pending.length, queuedNow: execute ? pending.length : 0, wouldQueue: pending.length }));
} finally {
  await prisma.$disconnect();
}
