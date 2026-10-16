import { describe, expect, it } from "vitest";
import { normalizeNumberNames, salespersonName } from "@/lib/salesperson-names";

describe("normalizeNumberNames", () => {
  const numbers = ["919800000001", "919800000002"];

  it("keeps a valid name for a valid number", () => {
    expect(normalizeNumberNames({ "919800000001": "Ravi" }, numbers)).toEqual({ "919800000001": "Ravi" });
  });

  it("reduces keys to digits only (strips a leading +)", () => {
    expect(normalizeNumberNames({ "+919800000001": "Ravi" }, numbers)).toEqual({ "919800000001": "Ravi" });
  });

  it("drops names for numbers not in the valid list", () => {
    expect(normalizeNumberNames({ "919800000001": "Ravi", "15550000000": "Someone" }, numbers)).toEqual({
      "919800000001": "Ravi",
    });
  });

  it("trims and collapses internal whitespace", () => {
    expect(normalizeNumberNames({ "919800000001": "  Ravi   Kumar  " }, numbers)).toEqual({
      "919800000001": "Ravi Kumar",
    });
  });

  it("caps names at 40 characters", () => {
    const long = "A".repeat(60);
    const result = normalizeNumberNames({ "919800000001": long }, numbers);
    expect(result["919800000001"]).toHaveLength(40);
  });

  it("drops empty or whitespace-only names", () => {
    expect(normalizeNumberNames({ "919800000001": "   ", "919800000002": "" }, numbers)).toEqual({});
  });

  it("drops non-string values", () => {
    expect(normalizeNumberNames({ "919800000001": 123, "919800000002": null }, numbers)).toEqual({});
  });

  it("treats non-object input as empty", () => {
    expect(normalizeNumberNames(null, numbers)).toEqual({});
    expect(normalizeNumberNames(undefined, numbers)).toEqual({});
    expect(normalizeNumberNames("not an object", numbers)).toEqual({});
    expect(normalizeNumberNames(["Ravi"], numbers)).toEqual({});
    expect(normalizeNumberNames(42, numbers)).toEqual({});
  });

  it("returns {} when there are no valid numbers", () => {
    expect(normalizeNumberNames({ "919800000001": "Ravi" }, [])).toEqual({});
  });
});

describe("salespersonName", () => {
  const names = { "919800000001": "Ravi", "919800000002": "Priya" };

  it("finds a name by plain digits", () => {
    expect(salespersonName(names, "919800000001")).toBe("Ravi");
  });

  it("tolerates a leading + on the lookup number", () => {
    expect(salespersonName(names, "+919800000002")).toBe("Priya");
  });

  it("tolerates other non-digit noise in the lookup number", () => {
    expect(salespersonName(names, "+91 98000 00001")).toBe("Ravi");
  });

  it("returns null for an unknown number", () => {
    expect(salespersonName(names, "15550000000")).toBeNull();
  });

  it("returns null when names is not a plain object", () => {
    expect(salespersonName(null, "919800000001")).toBeNull();
    expect(salespersonName(undefined, "919800000001")).toBeNull();
    expect(salespersonName("invalid json string", "919800000001")).toBeNull();
    expect(salespersonName(["Ravi"], "919800000001")).toBeNull();
    expect(salespersonName(42, "919800000001")).toBeNull();
  });

  it("returns null for an empty/blank lookup number", () => {
    expect(salespersonName(names, "")).toBeNull();
    expect(salespersonName(names, "+")).toBeNull();
  });

  it("returns null when the stored value for a number is not a usable string", () => {
    expect(salespersonName({ "919800000001": "" }, "919800000001")).toBeNull();
    expect(salespersonName({ "919800000001": 5 }, "919800000001")).toBeNull();
  });
});
