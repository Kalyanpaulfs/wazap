import { describe, expect, it } from "vitest";
import { detectDevice, summarizeAudience, periodEndsBeforeAudienceTracking, AUDIENCE_TRACKING_START } from "@/lib/audience";

const UA = {
  windowsChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  androidPhone:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  facebookBot: "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  whatsappPreview: "WhatsApp/2.23.20.0 A",
};

describe("detectDevice", () => {
  it("detects Windows desktop Chrome", () => {
    expect(detectDevice(UA.windowsChrome)).toEqual({ device: "Desktop", os: "Windows", isBot: false });
  });

  it("detects an Android phone as Mobile/Android", () => {
    expect(detectDevice(UA.androidPhone)).toEqual({ device: "Mobile", os: "Android", isBot: false });
  });

  it("detects an Android tablet (no 'Mobile' token) as Tablet/Android", () => {
    expect(detectDevice(UA.androidTablet)).toEqual({ device: "Tablet", os: "Android", isBot: false });
  });

  it("detects an iPhone as Mobile/iOS", () => {
    expect(detectDevice(UA.iphone)).toEqual({ device: "Mobile", os: "iOS", isBot: false });
  });

  it("detects an iPad as Tablet/iOS", () => {
    expect(detectDevice(UA.ipad)).toEqual({ device: "Tablet", os: "iOS", isBot: false });
  });

  it("detects a Mac as Desktop/Mac OS", () => {
    expect(detectDevice(UA.mac)).toEqual({ device: "Desktop", os: "Mac OS", isBot: false });
  });

  it("detects Linux as Desktop/Linux", () => {
    expect(detectDevice(UA.linux)).toEqual({ device: "Desktop", os: "Linux", isBot: false });
  });

  it("flags facebookexternalhit as a bot", () => {
    expect(detectDevice(UA.facebookBot)).toEqual({ device: "Bot", os: "Other", isBot: true });
  });

  it("flags a WhatsApp link-preview fetch as a bot", () => {
    expect(detectDevice(UA.whatsappPreview)).toEqual({ device: "Bot", os: "Other", isBot: true });
  });

  it("falls back to Desktop/Other for an empty user-agent", () => {
    expect(detectDevice("")).toEqual({ device: "Desktop", os: "Other", isBot: false });
    expect(detectDevice(null)).toEqual({ device: "Desktop", os: "Other", isBot: false });
    expect(detectDevice(undefined)).toEqual({ device: "Desktop", os: "Other", isBot: false });
  });

  it("prefers sec-ch-ua-platform over the user-agent string when both are present", () => {
    // UA alone would say Mac OS; the Client Hint says Windows and must win.
    const result = detectDevice(UA.mac, "Windows");
    expect(result.os).toBe("Windows");
  });

  it("falls back to the user-agent when sec-ch-ua-platform is absent/unrecognized", () => {
    expect(detectDevice(UA.mac, "").os).toBe("Mac OS");
    expect(detectDevice(UA.mac, undefined).os).toBe("Mac OS");
  });

  it("reads sec-ch-ua-platform quoted and case-insensitively, as real browsers send it", () => {
    expect(detectDevice(UA.windowsChrome, '"Windows"').os).toBe("Windows");
    expect(detectDevice(UA.windowsChrome, "ANDROID").os).toBe("Android");
  });
});

describe("summarizeAudience", () => {
  it("sorts each dimension by count, descending", () => {
    const rows = [
      { device: "Mobile", os: "Android", country: "IN", city: "Mumbai" },
      { device: "Mobile", os: "Android", country: "IN", city: "Mumbai" },
      { device: "Desktop", os: "Windows", country: "US", city: "New York" },
    ];
    const summary = summarizeAudience(rows);
    expect(summary.devices[0]).toMatchObject({ label: "Mobile", count: 2 });
    expect(summary.devices[1]).toMatchObject({ label: "Desktop", count: 1 });
  });

  it("computes a rounded percentage per row", () => {
    const rows = [
      { device: "Mobile", os: "Android", country: "IN", city: "Mumbai" },
      { device: "Mobile", os: "Android", country: "IN", city: "Mumbai" },
      { device: "Desktop", os: "Windows", country: "US", city: "New York" },
    ];
    const summary = summarizeAudience(rows);
    // 2 of 3 -> 67%, 1 of 3 -> 33%
    expect(summary.devices.find((row) => row.label === "Mobile")?.pct).toBe(67);
    expect(summary.devices.find((row) => row.label === "Desktop")?.pct).toBe(33);
  });

  it("never shows Unknown: private network, privacy browser, elsewhere in country", () => {
    const summary = summarizeAudience([
      { device: "Mobile", os: null, country: null, city: null },
      { device: "Desktop", os: "Other", country: "IN", city: null },
    ]);
    expect(summary.os).toEqual([{ label: "Private browser", count: 2, pct: 100 }]);
    expect(summary.countries.map((row) => row.label).sort()).toEqual(["India", "Private network"]);
    expect(summary.cities.map((row) => row.label).sort()).toEqual(["Elsewhere in India", "Private network"]);
    expect(JSON.stringify(summary)).not.toContain("Unknown");
  });

  it("expands an ISO2 country code to its display name", () => {
    const rows = [{ device: "Desktop", os: "Windows", country: "IN", city: "Mumbai" }];
    const summary = summarizeAudience(rows);
    expect(summary.countries).toEqual([{ label: "India", count: 1, pct: 100, code: "IN" }]);
  });

  it("falls back to the raw code if Intl.DisplayNames can't expand it", () => {
    // Not a valid region subtag - Intl.DisplayNames#of throws for this, which
    // summarizeAudience must catch and fall back to the raw value.
    const rows = [{ device: "Desktop", os: "Windows", country: "ZZZ", city: null }];
    const summary = summarizeAudience(rows);
    expect(summary.countries[0].label).toBe("ZZZ");
  });

  it("excludes bot clicks (device 'Bot') entirely from every panel", () => {
    const rows = [
      { device: "Bot", os: "Other", country: "US", city: "New York" },
      { device: "Mobile", os: "Android", country: "IN", city: "Mumbai" },
    ];
    const summary = summarizeAudience(rows);
    expect(summary.devices).toEqual([{ label: "Mobile", count: 1, pct: 100 }]);
    expect(summary.countries).toEqual([{ label: "India", count: 1, pct: 100, code: "IN" }]);
  });

  it("returns empty lists for no rows", () => {
    const summary = summarizeAudience([]);
    expect(summary).toEqual({ devices: [], os: [], countries: [], cities: [] });
  });
});

describe("periodEndsBeforeAudienceTracking", () => {
  const NOW = new Date("2026-10-25T12:00:00.000Z");

  it(`is true for a period that ends well before ${AUDIENCE_TRACKING_START}`, () => {
    // Period [Oct 1, Oct 11) - ends 10 days before tracking started.
    expect(periodEndsBeforeAudienceTracking(new Date("2026-10-11T00:00:00.000Z"), "UTC", NOW)).toBe(true);
  });

  it("is false for a period that overlaps the tracking start date", () => {
    // Period [Oct 1, Oct 26) - includes Oct 21 onward.
    expect(periodEndsBeforeAudienceTracking(new Date("2026-10-26T00:00:00.000Z"), "UTC", NOW)).toBe(false);
  });

  it("is false for a period entirely after the tracking start date", () => {
    expect(periodEndsBeforeAudienceTracking(new Date("2026-10-25T12:00:00.000Z"), "UTC", NOW)).toBe(false);
  });

  it("is true when the period ends exactly at tracking-start local midnight (the day before is the last included day)", () => {
    expect(periodEndsBeforeAudienceTracking(new Date("2026-10-21T00:00:00.000Z"), "UTC", NOW)).toBe(true);
  });

  it("uses the visitor's tz, not UTC, to place the tracking-start boundary", () => {
    // In Asia/Dubai (UTC+4), tracking-start local midnight is 2026-10-20T20:00Z.
    // A period ending at 2026-10-20T21:00Z (after that instant) already overlaps Oct 21 Dubai time.
    expect(periodEndsBeforeAudienceTracking(new Date("2026-10-20T21:00:00.000Z"), "Asia/Dubai", NOW)).toBe(false);
    // A period ending right at 2026-10-20T20:00Z does not yet reach Oct 21 Dubai time.
    expect(periodEndsBeforeAudienceTracking(new Date("2026-10-20T20:00:00.000Z"), "Asia/Dubai", NOW)).toBe(true);
  });
});
