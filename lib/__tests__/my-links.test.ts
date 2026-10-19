import { describe, expect, it } from "vitest";
import {
  addressDisplay,
  buildPublicUrl,
  derivePauseReason,
  statusLabel,
  combinedStatusText,
  formatUsageLine,
  poolFullMessage,
  mergeLinks,
  filterLinks,
  renameLinkTypeLabel,
  linkKindFromFilterParam,
  linkDetailsHref,
} from "@/lib/my-links";

describe("linkDetailsHref (UX-1 step 4)", () => {
  it("builds the details route for each kind using the URL-friendly type", () => {
    expect(linkDetailsHref("rotator", "r1")).toBe("/links/rotator/r1");
    expect(linkDetailsHref("shortlink", "s1")).toBe("/links/brand/s1");
    expect(linkDetailsHref("adlink", "a1")).toBe("/links/ad/a1");
  });
});

describe("addressDisplay (UX-1 step 2)", () => {
  it("builds a short display address per kind, no protocol", () => {
    expect(addressDisplay("https://wazap.lt", "rotator", "AB12C")).toBe("wazap.lt/r/AB12C");
    expect(addressDisplay("https://wazap.lt", "shortlink", "acme")).toBe("wazap.lt/w/acme");
    expect(addressDisplay("https://wazap.lt", "adlink", "clxyz123")).toBe("wazap.lt/a/clxyz123");
  });
});

describe("buildPublicUrl", () => {
  it("rotator and short link URLs are plain code paths", () => {
    expect(buildPublicUrl("https://wazap.lt", "rotator", { code: "AB12C" })).toBe("https://wazap.lt/r/AB12C");
    expect(buildPublicUrl("https://wazap.lt", "shortlink", { code: "acme" })).toBe("https://wazap.lt/w/acme");
  });
  it("ad link URL embeds the wa.me destination as ?to=, with message", () => {
    const url = buildPublicUrl("https://wazap.lt", "adlink", { id: "clxyz", number: "971500000000", message: "Hi there" });
    expect(url).toBe(`https://wazap.lt/a/clxyz?to=${encodeURIComponent("https://wa.me/971500000000?text=Hi%20there")}`);
  });
  it("ad link URL without a message omits ?text=", () => {
    const url = buildPublicUrl("https://wazap.lt", "adlink", { id: "clxyz", number: "971500000000", message: null });
    expect(url).toBe(`https://wazap.lt/a/clxyz?to=${encodeURIComponent("https://wa.me/971500000000")}`);
  });
});

describe("derivePauseReason / statusLabel", () => {
  it("free (no plan, no active trial) is always 'trial ended'", () => {
    expect(derivePauseReason("rotator", "free")).toBe("trial ended");
    expect(derivePauseReason("adlink", "free")).toBe("trial ended");
  });
  it("an ad link on a plan without ad links is 'ad links need Growth'", () => {
    expect(derivePauseReason("adlink", "basic")).toBe("ad links need Growth");
  });
  it("anything else paused on a real plan is 'over your plan limit'", () => {
    expect(derivePauseReason("rotator", "basic")).toBe("over your plan limit");
    expect(derivePauseReason("shortlink", "pro")).toBe("over your plan limit");
    expect(derivePauseReason("adlink", "pro")).toBe("over your plan limit");
  });
  it("statusLabel is Live when not paused, else 'Paused: <reason>'", () => {
    expect(statusLabel(false, "rotator", "basic")).toBe("Live");
    expect(statusLabel(true, "rotator", "free")).toBe("Paused: trial ended");
    expect(statusLabel(true, "adlink", "basic")).toBe("Paused: ad links need Growth");
    expect(statusLabel(true, "shortlink", "basic")).toBe("Paused: over your plan limit");
  });
});

describe("combinedStatusText (manual pause, owner feature)", () => {
  it("is Live when neither flag is set", () => {
    expect(combinedStatusText(null, null, "rotator", "basic")).toBe("Live");
  });
  it("shows 'Paused by you' for a manual pause with no plan pause", () => {
    expect(combinedStatusText(null, new Date("2026-01-01"), "rotator", "basic")).toBe("⏸ Paused by you");
  });
  it("plan pause wins over manual pause in the label when both are set", () => {
    expect(combinedStatusText(new Date("2026-01-01"), new Date("2026-01-01"), "adlink", "basic")).toBe("Paused: ad links need Growth");
  });
  it("plan-pause-only still uses the existing derived reason", () => {
    expect(combinedStatusText(new Date("2026-01-01"), null, "shortlink", "basic")).toBe("Paused: over your plan limit");
  });
});

describe("formatUsageLine / poolFullMessage", () => {
  it("formats the plan + usage line", () => {
    expect(formatUsageLine("Solo", 3, 5)).toBe("Solo plan · 3 of 5 links used");
  });
  it("suggests the next plan's total when the pool is full", () => {
    expect(poolFullMessage("basic", 5, 5)).toBe("5 of 5 links used · Upgrade to Growth for 20.");
    expect(poolFullMessage("pro", 20, 20)).toBe("20 of 20 links used · Upgrade to Agency for 55.");
  });
  it("has no upgrade to suggest at Agency's limit", () => {
    expect(poolFullMessage("ultimate", 55, 55)).toBe("55 of 55 links used.");
  });
  it("free/no plan points at choosing a plan instead", () => {
    expect(poolFullMessage("free", 0, 0)).toBe("0 of 0 links used · Choose a plan to turn your links back on.");
  });
});

describe("renameLinkTypeLabel", () => {
  it("renames both the Performance casing and the Reports casing", () => {
    expect(renameLinkTypeLabel("Rotator")).toBe("Lead rotator");
    expect(renameLinkTypeLabel("rotator")).toBe("Lead rotator");
    expect(renameLinkTypeLabel("Short link")).toBe("WhatsApp link");
    expect(renameLinkTypeLabel("short link")).toBe("WhatsApp link");
    expect(renameLinkTypeLabel("Ad link")).toBe("Ad link");
    expect(renameLinkTypeLabel("ad link")).toBe("Ad link");
  });
  it("passes through anything unrecognized", () => {
    expect(renameLinkTypeLabel("Mystery")).toBe("Mystery");
  });
});

describe("linkKindFromFilterParam", () => {
  it("maps known params and rejects unknown ones", () => {
    expect(linkKindFromFilterParam("rotator")).toBe("rotator");
    expect(linkKindFromFilterParam("shortlink")).toBe("shortlink");
    expect(linkKindFromFilterParam("adlink")).toBe("adlink");
    expect(linkKindFromFilterParam("bogus")).toBeNull();
    expect(linkKindFromFilterParam(undefined)).toBeNull();
  });
});

describe("mergeLinks", () => {
  const rotators = [{ id: "r1", name: "Team", code: "AAA", totalClicks: 5, planPausedAt: null, createdAt: new Date("2026-01-01") }];
  const shortLinks = [{ id: "s1", name: "Brand", code: "acme", clicks: 9, planPausedAt: new Date("2026-02-01"), createdAt: new Date("2026-01-03") }];
  const adLinks = [{ id: "a1", name: "Campaign", number: "971500000000", message: null, clicks: 2, planPausedAt: null, createdAt: new Date("2026-01-02") }];

  it("merges all three kinds, newest createdAt first", () => {
    const rows = mergeLinks(rotators, shortLinks, adLinks, { plan: "basic", origin: "https://wazap.lt" });
    expect(rows.map((r) => r.id)).toEqual(["s1", "a1", "r1"]);
  });

  it("uses totalClicks/clicks as the metric for every kind (what Performance calls total chats)", () => {
    const rows = mergeLinks(rotators, shortLinks, adLinks, { plan: "basic", origin: "https://wazap.lt" });
    expect(rows.find((r) => r.id === "r1")?.metric).toBe(5);
    expect(rows.find((r) => r.id === "s1")?.metric).toBe(9);
    expect(rows.find((r) => r.id === "a1")?.metric).toBe(2);
  });

  it("points editHref at the /links/<type>/<id> details route (UX-1 step 4)", () => {
    const rows = mergeLinks(rotators, shortLinks, adLinks, { plan: "basic", origin: "https://wazap.lt" });
    expect(rows.find((r) => r.id === "r1")?.editHref).toBe("/links/rotator/r1");
    expect(rows.find((r) => r.id === "s1")?.editHref).toBe("/links/brand/s1");
    expect(rows.find((r) => r.id === "a1")?.editHref).toBe("/links/ad/a1");
  });

  it("marks paused rows with the derived status text", () => {
    const rows = mergeLinks(rotators, shortLinks, adLinks, { plan: "basic", origin: "https://wazap.lt" });
    expect(rows.find((r) => r.id === "s1")?.statusText).toBe("Paused: over your plan limit");
    expect(rows.find((r) => r.id === "r1")?.statusText).toBe("Live");
  });

  it("a manually-paused row (pausedAt, no planPausedAt) is paused with the distinct 'Paused by you' text", () => {
    const manuallyPausedRotators = [{ id: "r1", name: "Team", code: "AAA", totalClicks: 5, planPausedAt: null, pausedAt: new Date("2026-03-01"), createdAt: new Date("2026-01-01") }];
    const rows = mergeLinks(manuallyPausedRotators, [], [], { plan: "basic", origin: "https://wazap.lt" });
    const row = rows.find((r) => r.id === "r1");
    expect(row?.paused).toBe(true);
    expect(row?.manuallyPaused).toBe(true);
    expect(row?.statusText).toBe("⏸ Paused by you");
  });

  it("when a row is both plan-paused and manually paused, the plan reason wins in the label but manuallyPaused still reflects the customer's own pause", () => {
    const both = [{ id: "s1", name: "Brand", code: "acme", clicks: 9, planPausedAt: new Date("2026-02-01"), pausedAt: new Date("2026-02-02"), createdAt: new Date("2026-01-03") }];
    const rows = mergeLinks([], both, [], { plan: "basic", origin: "https://wazap.lt" });
    const row = rows.find((r) => r.id === "s1");
    expect(row?.paused).toBe(true);
    expect(row?.manuallyPaused).toBe(true);
    expect(row?.statusText).toBe("Paused: over your plan limit");
  });
});

describe("filterLinks", () => {
  const rows = mergeLinks(
    [{ id: "r1", name: "Sales team", code: "AAA", totalClicks: 1, planPausedAt: null, createdAt: new Date("2026-01-01") }],
    [{ id: "s1", name: "Acme brand", code: "acme", clicks: 1, planPausedAt: null, createdAt: new Date("2026-01-02") }],
    [],
    { plan: "basic", origin: "https://wazap.lt" },
  );

  it("filters by kind", () => {
    expect(filterLinks(rows, { kind: "rotator" }).map((r) => r.id)).toEqual(["r1"]);
  });
  it("filters by name search, case-insensitive", () => {
    expect(filterLinks(rows, { q: "acme" }).map((r) => r.id)).toEqual(["s1"]);
    expect(filterLinks(rows, { q: "ACME" }).map((r) => r.id)).toEqual(["s1"]);
  });
  it("with no filters, returns everything", () => {
    expect(filterLinks(rows, {}).length).toBe(2);
  });
});
