import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildSafeBrowsingRequest,
  parseSafeBrowsingResponse,
  checkSafeBrowsing,
  _resetSafeBrowsingWarningForTests,
} from "@/lib/safe-browsing";

describe("buildSafeBrowsingRequest (pure request builder)", () => {
  it("builds the threatMatches:find request with every required threat type", () => {
    const { endpoint, body } = buildSafeBrowsingRequest("https://example.com/x", "KEY123");
    expect(endpoint).toBe("https://safebrowsing.googleapis.com/v4/threatMatches:find?key=KEY123");
    const threatInfo = body.threatInfo as { threatTypes: string[]; threatEntries: { url: string }[] };
    expect(threatInfo.threatTypes).toEqual(["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"]);
    expect(threatInfo.threatEntries).toEqual([{ url: "https://example.com/x" }]);
  });

  it("URL-encodes the API key in the endpoint", () => {
    const { endpoint } = buildSafeBrowsingRequest("https://example.com", "a b/c");
    expect(endpoint).toContain("key=a%20b%2Fc");
  });
});

describe("parseSafeBrowsingResponse (pure response parser)", () => {
  it("is not blocked when the response has no matches", () => {
    expect(parseSafeBrowsingResponse({})).toEqual({ blocked: false });
    expect(parseSafeBrowsingResponse({ matches: [] })).toEqual({ blocked: false });
    expect(parseSafeBrowsingResponse(null)).toEqual({ blocked: false });
  });

  it("is blocked with the threat type when matches are present", () => {
    expect(parseSafeBrowsingResponse({ matches: [{ threatType: "MALWARE" }] })).toEqual({ blocked: true, threatType: "MALWARE" });
  });
});

describe("checkSafeBrowsing", () => {
  beforeEach(() => {
    _resetSafeBrowsingWarningForTests();
  });

  it("allows (fail-open) and warns once when no API key is configured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn();
    const first = await checkSafeBrowsing("https://example.com", { apiKey: "", fetchImpl });
    const second = await checkSafeBrowsing("https://example.com", { apiKey: "", fetchImpl });
    expect(first).toEqual({ blocked: false, failOpen: true, reason: "no_api_key" });
    expect(second).toEqual({ blocked: false, failOpen: true, reason: "no_api_key" });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("blocks when the API reports a match", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ matches: [{ threatType: "SOCIAL_ENGINEERING" }] }) });
    const verdict = await checkSafeBrowsing("https://bad.example.com", { apiKey: "KEY", fetchImpl });
    expect(verdict).toEqual({ blocked: true, threatType: "SOCIAL_ENGINEERING" });
  });

  it("allows when the API reports no match", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const verdict = await checkSafeBrowsing("https://good.example.com", { apiKey: "KEY", fetchImpl });
    expect(verdict).toEqual({ blocked: false });
  });

  it("fails open and logs when the API returns a non-OK status", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const verdict = await checkSafeBrowsing("https://example.com", { apiKey: "KEY", fetchImpl });
    expect(verdict).toEqual({ blocked: false, failOpen: true, reason: "http_500" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("fails open and logs when the request throws (e.g. timeout)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockRejectedValue(new Error("timed out"));
    const verdict = await checkSafeBrowsing("https://example.com", { apiKey: "KEY", fetchImpl });
    expect(verdict).toEqual({ blocked: false, failOpen: true, reason: "error" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
