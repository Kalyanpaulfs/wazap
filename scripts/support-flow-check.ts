// Integration-style check for the "AI first, human when needed, reply
// within 12 hours" support flow, against the LOCAL wazap_dev database only.
// Calls the same service functions the routes call (lib/support-chat-
// service.ts, lib/support-admin-service.ts) directly, so it does not need a
// real signed support-session cookie or an admin session.
//
// Simulates: a normal question (not flagged, no alert email), "I want a
// refund" (flagged, exactly one alert email, handoff message saved to
// history), a second message while still flagged (no new alert), an admin
// reply (customer gets an email with a working continue-chat link), the
// visitor writing again (re-flag, one new alert), then marking the chat
// solved. Cleans up every row it creates when it's done, pass or fail.
//
// Usage: npx tsx scripts/support-flow-check.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { recordChatbotTurn } from "@/lib/support-chat-service";
import { replyToConversation, setConversationStatus } from "@/lib/support-admin-service";
import { verifyContinueToken } from "@/lib/support-session";

const checks: string[] = [];
async function check(name: string, fn: () => Promise<void> | void) {
  await fn();
  checks.push(name);
}

// queueSupportAlert (lib/support-notify.ts) writes one OutboundEmail row per
// team recipient (support@wazap.lt, joseph@wazap.lt) for every alert event,
// so "N alerts" means 2*N rows. This counts alert EVENTS, not raw rows.
const TEAM_RECIPIENTS = 2;
async function countTeamAlerts(since: Date) {
  const rows = await prisma.outboundEmail.count({ where: { type: "support_live_team_alert", createdAt: { gte: since } } });
  assert.equal(rows % TEAM_RECIPIENTS, 0, "team alert rows should always come in pairs, one per recipient");
  return rows / TEAM_RECIPIENTS;
}

async function main() {
  const scriptStart = new Date();
  const visitorId = randomUUID();
  const testEmail = `flow-check-${Date.now()}@example.invalid`;
  let conversationId = "";

  try {
    await check("normal question: not flagged, no alert email", async () => {
      const result = await recordChatbotTurn({
        visitorId,
        message: "How do I create a QR code for my link?",
        answer: { handoff: false, reason: "" },
        reply: "Open Tools > QR code and paste your link.",
        intent: "feature",
        leadScore: 25,
      });
      conversationId = result.conversationId;
      assert.equal(result.supportRequest, false);
      assert.equal(result.handoff, null);
      const conversation = await prisma.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.status, "ai");
      assert.equal(await countTeamAlerts(scriptStart), 0);
    });

    // Simulates the profile-capture step (app/api/support/profile/route.ts)
    // that normally happens before any chat message, so the admin-reply
    // step below has a customer email address to send to.
    await prisma.supportConversation.update({ where: { id: conversationId }, data: { email: testEmail, name: "Flow Check" } });

    await check("'I want a refund': flagged, exactly one alert, handoff message saved", async () => {
      const result = await recordChatbotTurn({
        visitorId,
        message: "I want a refund, this charge is wrong",
        answer: { handoff: false, reason: "" },
        reply: "Let me look into that for you.",
        intent: "support",
        leadScore: 40,
      });
      assert.equal(result.supportRequest, true);
      assert.ok(result.handoff);
      assert.equal(result.handoff!.replyWithinHours, 12);
      assert.match(result.handoff!.reference, /^#[A-Z0-9]{6}$/);
      const conversation = await prisma.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.status, "open");
      assert.equal(await countTeamAlerts(scriptStart), 1);
      const handoffMessages = await prisma.supportChatMessage.count({ where: { conversationId, sender: "bot", body: { contains: "passed this to our team" } } });
      assert.equal(handoffMessages, 1);
    });

    await check("second message while still flagged: no new alert", async () => {
      const result = await recordChatbotTurn({
        visitorId,
        message: "Still waiting on that refund",
        answer: { handoff: false, reason: "" },
        reply: "I understand, let me flag this.",
        intent: "support",
        leadScore: 40,
      });
      assert.equal(result.supportRequest, true);
      assert.equal(await countTeamAlerts(scriptStart), 1);
      const handoffMessages = await prisma.supportChatMessage.count({ where: { conversationId, sender: "bot", body: { contains: "passed this to our team" } } });
      assert.equal(handoffMessages, 1, "the handoff text should not be re-saved on every message while still flagged");
    });

    await check("admin reply: customer gets an email with a working continue link", async () => {
      const result = await replyToConversation(conversationId, "We've refunded the duplicate charge, sorry about that.");
      assert.ok(result);
      assert.ok(result!.outboundEmailId);
      const outbound = await prisma.outboundEmail.findUniqueOrThrow({ where: { id: result!.outboundEmailId! } });
      assert.equal(outbound.recipient, testEmail);
      assert.equal(outbound.type, "support_chat_reply");
      const match = outbound.html.match(/\/support\/continue\?t=([^"&]+)/);
      assert.ok(match, "reply email should contain a /support/continue link");
      const token = decodeURIComponent(match![1]);
      assert.equal(verifyContinueToken(token), visitorId);
      const conversation = await prisma.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.status, "open");
    });

    await check("visitor writes again after the admin replied: re-flag, one new alert", async () => {
      const result = await recordChatbotTurn({
        visitorId,
        message: "Thanks, but I still see the duplicate charge on my statement",
        answer: { handoff: false, reason: "" },
        reply: "Let me take another look.",
        intent: "support",
        leadScore: 40,
      });
      assert.equal(result.supportRequest, true);
      assert.equal(await countTeamAlerts(scriptStart), 2);
      const handoffMessages = await prisma.supportChatMessage.count({ where: { conversationId, sender: "bot", body: { contains: "passed this to our team" } } });
      assert.equal(handoffMessages, 2, "re-flagging should save the handoff text again");
    });

    await check("mark solved: status closes", async () => {
      await setConversationStatus(conversationId, "closed");
      const conversation = await prisma.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.status, "closed");
    });

    await check("writing again after solved re-flags and re-alerts", async () => {
      const result = await recordChatbotTurn({
        visitorId,
        message: "One more thing",
        answer: { handoff: false, reason: "" },
        reply: "Sure, go ahead.",
        intent: "support",
        leadScore: 40,
      });
      assert.equal(result.supportRequest, true);
      assert.equal(await countTeamAlerts(scriptStart), 3);
      const conversation = await prisma.supportConversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.status, "open");
    });

    console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
  } finally {
    if (conversationId) {
      await prisma.supportChatMessage.deleteMany({ where: { conversationId } });
      await prisma.supportConversation.delete({ where: { id: conversationId } }).catch(() => {});
      await prisma.outboundEmail.deleteMany({ where: { createdAt: { gte: scriptStart }, OR: [{ type: "support_live_team_alert" }, { type: "support_chat_reply", recipient: testEmail }] } });
    }
  }
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
