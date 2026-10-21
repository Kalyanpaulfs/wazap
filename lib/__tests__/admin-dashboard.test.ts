import { describe, expect, it } from "vitest";
import { buildNeedsAttention, formatIncomeByCurrency } from "@/lib/admin-dashboard";

describe("buildNeedsAttention", () => {
  it("returns nothing when every count is zero", () => {
    expect(buildNeedsAttention({ support: 0, forms: 0, billing: 0, emails: 0, backup: 0 })).toEqual([]);
  });

  it("returns nothing for missing counts (treated as zero)", () => {
    expect(buildNeedsAttention({})).toEqual([]);
  });

  it("includes only the non-zero items, in the fixed priority order", () => {
    const items = buildNeedsAttention({ backup: 1, billing: 2, support: 3 });
    expect(items.map((i) => i.key)).toEqual(["support", "billing", "backup"]);
  });

  it("links each item to where an admin fixes it", () => {
    const items = buildNeedsAttention({ support: 1, forms: 1, billing: 1, emails: 1, backup: 1 });
    expect(items.find((i) => i.key === "support")?.href).toBe("/admin/crm/support");
    expect(items.find((i) => i.key === "forms")?.href).toBe("/admin/crm/support");
    expect(items.find((i) => i.key === "billing")?.href).toBe("/admin/crm/billing");
    expect(items.find((i) => i.key === "emails")?.href).toBe("/admin/crm/health");
    expect(items.find((i) => i.key === "backup")?.href).toBe("/admin/crm/health");
  });

  it("carries the count and a plain-English, singular/plural-aware sentence", () => {
    expect(buildNeedsAttention({ support: 1 })[0]).toEqual({
      key: "support",
      count: 1,
      href: "/admin/crm/support",
      text: "1 support ticket overdue, urgent or waiting for a reply",
    });
    expect(buildNeedsAttention({ support: 3 })[0].text).toBe("3 support tickets overdue, urgent or waiting for a reply");
  });

  it("the backup item's text does not depend on the count", () => {
    expect(buildNeedsAttention({ backup: 1 })[0].text).toBe("Backup check needs attention");
  });
});

describe("formatIncomeByCurrency", () => {
  it("returns an em dash placeholder when there is no income", () => {
    expect(formatIncomeByCurrency({})).toBe("—");
  });

  it("treats all-zero amounts the same as no income", () => {
    expect(formatIncomeByCurrency({ USD: 0, EUR: 0 })).toBe("—");
  });

  it("formats a single currency", () => {
    expect(formatIncomeByCurrency({ USD: 120 })).toBe(new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(120));
  });

  it("never adds different currencies together - shows each side by side", () => {
    const result = formatIncomeByCurrency({ USD: 120, EUR: 40 });
    const usd = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(120);
    const eur = new Intl.NumberFormat(undefined, { style: "currency", currency: "EUR" }).format(40);
    expect(result).toBe(`${usd} · ${eur}`);
  });

  it("drops a zero-amount currency even when another currency has income", () => {
    const result = formatIncomeByCurrency({ USD: 120, EUR: 0 });
    expect(result).toBe(new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(120));
  });
});
