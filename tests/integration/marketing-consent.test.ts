// FEAT-CONSENT integration test - exercises lib/marketing-consent.ts against
// the real local Postgres (wazap_dev), the same way the billing state-machine
// integration tests do. Covers: granting creates/updates the CrmLead as
// subscribed with evidence and clears User.marketingOptOutAt; withdrawing
// unsubscribes (and the dashboard banner then correctly stays hidden); and
// granting refuses a suppressed lead instead of silently resubscribing it.
import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { grantMarketingConsent, shouldShowConsentBanner, withdrawMarketingConsent } from "@/lib/marketing-consent";
import { cleanupUser, createTestUser } from "./helpers";

describe("FEAT-CONSENT marketing consent", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("grants consent: creates/updates the CrmLead as subscribed with dated, worded evidence and clears marketingOptOutAt", async () => {
    const user = await createTestUser();
    userId = user.id; email = user.email;
    await prisma.user.update({ where: { id: userId }, data: { marketingOptOutAt: new Date() } });

    const granted = await prisma.$transaction((tx) => grantMarketingConsent(tx, {
      userId,
      email,
      name: "Integration Test",
      source: "signup_checkbox",
      ip: "203.0.113.5",
      userAgent: "vitest-agent",
    }));
    expect(granted).toBe(true);

    const lead = await prisma.crmLead.findUnique({ where: { email: email.toLowerCase() } });
    expect(lead).toBeTruthy();
    expect(lead?.marketingStatus).toBe("subscribed");
    expect(lead?.consentSource).toBe("signup_checkbox");
    expect(lead?.consentAt).toBeTruthy();
    const evidence = JSON.parse(lead?.consentEvidence || "{}");
    expect(evidence.wording).toContain("early access");
    expect(evidence.ip).toBe("203.0.113.5");
    expect(evidence.userAgent).toBe("vitest-agent");
    expect(evidence.at).toBeTruthy();

    const refreshedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(refreshedUser.marketingOptOutAt).toBeNull();
  });

  it("withdraws consent: unsubscribes the lead, sets marketingOptOutAt, and the dashboard banner then stays hidden", async () => {
    const user = await createTestUser();
    userId = user.id; email = user.email;
    await prisma.$transaction((tx) => grantMarketingConsent(tx, { userId, email, source: "dashboard_banner" }));

    await prisma.$transaction((tx) => withdrawMarketingConsent(tx, { userId, email, reason: "Declined the dashboard marketing prompt." }));

    const lead = await prisma.crmLead.findUnique({ where: { email: email.toLowerCase() } });
    expect(lead?.marketingStatus).toBe("unsubscribed");
    const refreshedUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(refreshedUser.marketingOptOutAt).toBeTruthy();

    // "No thanks" must be sticky: the banner never reappears for this user.
    expect(shouldShowConsentBanner({
      isAdmin: false,
      marketingOptOutAt: refreshedUser.marketingOptOutAt,
      lead: lead ? { marketingStatus: lead.marketingStatus, doNotContact: lead.doNotContact, emailSuppressedAt: lead.emailSuppressedAt } : null,
    })).toBe(false);
  });

  it("refuses to grant consent to a suppressed (bounced/spam) lead", async () => {
    const user = await createTestUser();
    userId = user.id; email = user.email;
    await prisma.crmLead.create({
      data: { email: email.toLowerCase(), name: "Suppressed", source: "test", emailSuppressedAt: new Date(), suppressionReason: "hard_bounce" },
    });

    const granted = await prisma.$transaction((tx) => grantMarketingConsent(tx, { userId, email, source: "account_settings" }));
    expect(granted).toBe(false);

    const lead = await prisma.crmLead.findUnique({ where: { email: email.toLowerCase() } });
    expect(lead?.marketingStatus).toBe("none");
  });
});
