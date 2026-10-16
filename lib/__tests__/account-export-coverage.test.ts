import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Guards the GDPR account export (lib/account-lifecycle.ts buildAccountExport)
// against silently losing a data category the next time its shape gets
// reorganized. This mirrors scripts/qa-account-export.mjs's source check but
// runs as part of the fast, DB-free `npm test` suite instead of only the
// manual `npm run qa:account-export` script.
describe("buildAccountExport coverage", () => {
  it("still queries or re-exports every category the pre-reorg export covered", async () => {
    const source = await readFile(path.join(__dirname, "..", "account-lifecycle.ts"), "utf8");

    // Every Prisma relation/field name the export included before it was
    // reorganized around the current product (2026-08-03 shape). Each one
    // must still appear somewhere in the file, whether at the top level
    // (current product) or nested under `olderFeatures` (retired features).
    const previouslyExportedFields = [
      // account
      "workspaceMemberships",
      // owned workspaces shell
      "members", "invitations",
      // CRM leads
      "leads", "activities", "catalogOrders",
      // inbox
      "inboxConversations", "inboxTasks", "inboxEvents",
      // AI governance
      "aiAgents", "aiKnowledge", "aiRuns", "aiDrafts", "aiHandoffs", "aiEvaluations",
      // developer platform
      "apiKeys", "apiRequestLogs", "apiIdempotencyRecords", "webhookEndpoints", "deliveryAttempts",
      // marketplace
      "marketplacePublisher", "marketplaceInstalls", "marketplaceReviews", "marketplaceAbuseReports",
      // partners
      "partnerAccount", "partnerAttributions", "referralTouches",
      // channels
      "channelConnections", "channelEvents",
      // WhatsApp platform
      "whatsappTemplates", "whatsappConsents", "whatsappCampaigns", "whatsappMigrations",
      // automations
      "automationRules",
      // operations
      "operationalSnapshots", "operationalIncidents",
      "auditEvents",
      // current-product tool data
      "rotators", "shortLinks", "adLinks", "linktreePages", "contactLists", "scheduledSends", "catalogs",
      // conversation starts (now the current-product chatsStarted key)
      "conversationStart",
      // billing / usage / notices
      "payments", "dailyUsage", "funnelEvents", "siteVisits", "outboundEmail",
    ];

    const missing = previouslyExportedFields.filter((field) => !source.includes(field));
    expect(missing).toEqual([]);
  });

  it("only attaches olderFeatures when it actually has a non-empty sub-key", async () => {
    const source = await readFile(path.join(__dirname, "..", "account-lifecycle.ts"), "utf8");
    expect(source).toContain("omitEmptyExportKeys");
    expect(source).toMatch(/Object\.keys\(olderFeatures\)\.length/);
  });
});
