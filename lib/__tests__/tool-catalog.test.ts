import { describe, expect, it } from "vitest";
import { getToolCatalog } from "@/lib/tool-catalog";

describe("getToolCatalog - Audience feature card", () => {
  it("is locked on Solo (basic), pointing at billing", () => {
    const { features } = getToolCatalog({ plan: "basic", used: 1, limit: 5 });
    const audience = features.find((card) => card.id === "audience")!;
    expect(audience.locked).toBe(true);
    expect(audience.href).toBe("/billing#plans");
    expect(audience.description).toBe("Available on Growth");
  });

  it("is locked when the plan has lapsed (free)", () => {
    const { features } = getToolCatalog({ plan: "free", used: 0, limit: 0 });
    const audience = features.find((card) => card.id === "audience")!;
    expect(audience.locked).toBe(true);
    expect(audience.lockReason).toBe("Choose a plan");
  });

  it("is unlocked on Growth (pro)", () => {
    const { features } = getToolCatalog({ plan: "pro", used: 3, limit: 20 });
    const audience = features.find((card) => card.id === "audience")!;
    expect(audience.locked).toBe(false);
    expect(audience.href).toBe("/results#audience");
  });

  it("is unlocked on Agency (ultimate)", () => {
    const { features } = getToolCatalog({ plan: "ultimate", used: 0, limit: 55 });
    const audience = features.find((card) => card.id === "audience")!;
    expect(audience.locked).toBe(false);
  });

  it("is NOT locked by a full shared link pool - Audience isn't a link", () => {
    // On Growth with the pool completely full, every link-pool card (rawPaid)
    // locks, but Audience must stay open since it doesn't count against the
    // pool at all.
    const { paid, features } = getToolCatalog({ plan: "pro", used: 20, limit: 20 });
    expect(paid.every((card) => card.locked)).toBe(true);
    const audience = features.find((card) => card.id === "audience")!;
    expect(audience.locked).toBe(false);
  });

  it("is never part of the `paid` (link-pool) list used by app/links/new", () => {
    const { paid } = getToolCatalog({ plan: "ultimate", used: 0, limit: 55 });
    expect(paid.some((card) => card.id === "audience")).toBe(false);
  });
});
