import { describe, expect, it } from "vitest";
import {
  isValidBrandSlug,
  sanitizeBrandSlugInput,
  digitsOnly,
  isValidPhoneDigits,
  buildRotatorNumbers,
  salespeopleCounterText,
  sourceToUtmSource,
  kindFromCreatedType,
  createdTypeFromKind,
  buildCreatedUrl,
} from "@/lib/link-create-forms";

describe("isValidBrandSlug (must match app/api/shortlinks/route.ts slugOk exactly)", () => {
  it("accepts 3-30 chars of lowercase letters, numbers, hyphens", () => {
    expect(isValidBrandSlug("acme")).toBe(true);
    expect(isValidBrandSlug("acme-dubai-2026")).toBe(true);
    expect(isValidBrandSlug("ab")).toBe(false); // too short
    expect(isValidBrandSlug("a".repeat(31))).toBe(false); // too long
    expect(isValidBrandSlug("Acme")).toBe(false); // uppercase
    expect(isValidBrandSlug("acme_co")).toBe(false); // underscore
    expect(isValidBrandSlug("acme co")).toBe(false); // space
  });
});

describe("sanitizeBrandSlugInput", () => {
  it("lowercases and strips invalid characters while typing", () => {
    expect(sanitizeBrandSlugInput("Acme Co!")).toBe("acmeco");
    expect(sanitizeBrandSlugInput("my-brand_01")).toBe("my-brand01");
  });
  it("caps length at 30", () => {
    expect(sanitizeBrandSlugInput("a".repeat(40)).length).toBe(30);
  });
});

describe("digitsOnly / isValidPhoneDigits", () => {
  it("strips non-digits", () => {
    expect(digitsOnly("+971 50-000-0000")).toBe("971500000000");
  });
  it("requires at least 8 digits, same floor as the APIs", () => {
    expect(isValidPhoneDigits("9715000")).toBe(false); // 7 digits
    expect(isValidPhoneDigits("97150000")).toBe(true); // 8 digits
  });
});

describe("buildRotatorNumbers", () => {
  it("drops rows with a too-short number and keeps valid ones with names", () => {
    const result = buildRotatorNumbers("971", [
      { name: "Ravi", number: "500000001" },
      { name: "", number: "500000002" },
      { name: "Bad", number: "123" },
    ]);
    expect(result).toEqual({
      numbers: ["971500000001", "971500000002"],
      numberNames: { "971500000001": "Ravi" },
    });
  });
  it("returns null when fewer than MIN_SALESPEOPLE (2) rows are valid", () => {
    expect(buildRotatorNumbers("971", [{ name: "Solo", number: "500000001" }])).toBeNull();
    expect(buildRotatorNumbers("971", [])).toBeNull();
  });
});

describe("salespeopleCounterText", () => {
  it("includes the upgrade hint when not on the top plan", () => {
    expect(salespeopleCounterText(2, 10, "Solo", "Growth allows 50")).toBe(
      "2 of 10 salespeople (Solo). Need more? Growth allows 50.",
    );
  });
  it("omits the upgrade hint on the top plan", () => {
    expect(salespeopleCounterText(5, 100, "Agency", "")).toBe("5 of 100 salespeople (Agency).");
  });
});

describe("sourceToUtmSource", () => {
  it("lowercases known presets", () => {
    expect(sourceToUtmSource("Facebook", "")).toBe("facebook");
    expect(sourceToUtmSource("TikTok", "")).toBe("tiktok");
  });
  it("uses the free-text field for Other", () => {
    expect(sourceToUtmSource("Other", "  Snapchat Ads ")).toBe("snapchat ads");
  });
});

describe("created type <-> link kind mapping", () => {
  it("maps the URL-friendly type to the internal LinkKind and back", () => {
    expect(kindFromCreatedType("rotator")).toBe("rotator");
    expect(kindFromCreatedType("brand")).toBe("shortlink");
    expect(kindFromCreatedType("ad")).toBe("adlink");
    expect(kindFromCreatedType("bogus")).toBeNull();
    expect(kindFromCreatedType(undefined)).toBeNull();

    expect(createdTypeFromKind("rotator")).toBe("rotator");
    expect(createdTypeFromKind("shortlink")).toBe("brand");
    expect(createdTypeFromKind("adlink")).toBe("ad");
  });
});

describe("buildCreatedUrl", () => {
  it("builds the success screen URL", () => {
    expect(buildCreatedUrl("rotator", "abc123")).toBe("/links/created?type=rotator&id=abc123");
  });
  it("encodes the id", () => {
    expect(buildCreatedUrl("brand", "a b/c")).toBe("/links/created?type=brand&id=a%20b%2Fc");
  });
});
