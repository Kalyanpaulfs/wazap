import { describe, expect, it } from "vitest";
import { shouldShowConsentBanner } from "@/lib/marketing-consent";

describe("shouldShowConsentBanner", () => {
  it("shows for a user who has never answered and has no CRM lead yet (e.g. Google sign-up)", () => {
    expect(shouldShowConsentBanner({ isAdmin: false, marketingOptOutAt: null, lead: null })).toBe(true);
  });

  it("hides for admins", () => {
    expect(shouldShowConsentBanner({ isAdmin: true, marketingOptOutAt: null, lead: null })).toBe(false);
  });

  it("hides once the user has opted out", () => {
    expect(shouldShowConsentBanner({ isAdmin: false, marketingOptOutAt: new Date(), lead: null })).toBe(false);
  });

  it("hides once the lead is already subscribed", () => {
    expect(shouldShowConsentBanner({
      isAdmin: false,
      marketingOptOutAt: null,
      lead: { marketingStatus: "subscribed", doNotContact: false, emailSuppressedAt: null },
    })).toBe(false);
  });

  it("hides for doNotContact leads", () => {
    expect(shouldShowConsentBanner({
      isAdmin: false,
      marketingOptOutAt: null,
      lead: { marketingStatus: "none", doNotContact: true, emailSuppressedAt: null },
    })).toBe(false);
  });

  it("hides for suppressed (bounced/spam) leads", () => {
    expect(shouldShowConsentBanner({
      isAdmin: false,
      marketingOptOutAt: null,
      lead: { marketingStatus: "none", doNotContact: false, emailSuppressedAt: new Date() },
    })).toBe(false);
  });

  it("still shows for a pending (double opt-in not yet confirmed) lead", () => {
    expect(shouldShowConsentBanner({
      isAdmin: false,
      marketingOptOutAt: null,
      lead: { marketingStatus: "pending", doNotContact: false, emailSuppressedAt: null },
    })).toBe(true);
  });
});
