import { describe, expect, it, afterEach, vi } from "vitest";

// 'server-only' is resolved by Next's own bundler without the package
// actually being installed (same as lib/site-country.ts) - stub it here so
// vitest (plain Vite resolution) can still import this module directly.
vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = process.env.GEOIP_CITY_DB_PATH;

describe("geoForIp", () => {
  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.GEOIP_CITY_DB_PATH;
    else process.env.GEOIP_CITY_DB_PATH = ORIGINAL_ENV;
  });

  it("falls back to the country-only lookup (and a null city) when GEOIP_CITY_DB_PATH is unset", async () => {
    delete process.env.GEOIP_CITY_DB_PATH;
    const { geoForIp } = await import("@/lib/geo-city");
    const { countryForIp } = await import("@/lib/site-country");
    // Never throws; city is always null without the city DB, country falls
    // back to the existing country-only mmdb (lib/site-country.ts).
    expect(geoForIp("8.8.8.8")).toEqual({ country: countryForIp("8.8.8.8"), city: null });
  });

  it("falls back the same way when GEOIP_CITY_DB_PATH points at a file that doesn't exist", async () => {
    process.env.GEOIP_CITY_DB_PATH = "Z:/does/not/exist.mmdb";
    const { geoForIp } = await import("@/lib/geo-city");
    const { countryForIp } = await import("@/lib/site-country");
    expect(geoForIp("8.8.8.8")).toEqual({ country: countryForIp("8.8.8.8"), city: null });
  });

  it("returns nulls for a non-IP string instead of throwing", async () => {
    delete process.env.GEOIP_CITY_DB_PATH;
    const { geoForIp } = await import("@/lib/geo-city");
    expect(geoForIp("not-an-ip")).toEqual({ country: null, city: null });
  });
});
