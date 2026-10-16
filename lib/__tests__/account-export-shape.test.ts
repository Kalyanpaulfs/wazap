import { describe, expect, it } from "vitest";
import { isEmptyExportValue, omitEmptyExportKeys } from "@/lib/account-export-shape";

describe("isEmptyExportValue", () => {
  it("treats null and undefined as empty", () => {
    expect(isEmptyExportValue(null)).toBe(true);
    expect(isEmptyExportValue(undefined)).toBe(true);
  });

  it("treats an empty array as empty, a populated one as not", () => {
    expect(isEmptyExportValue([])).toBe(true);
    expect(isEmptyExportValue([1])).toBe(false);
  });

  it("treats an object with only empty values as empty", () => {
    expect(isEmptyExportValue({})).toBe(true);
    expect(isEmptyExportValue({ a: [], b: null, c: {} })).toBe(true);
  });

  it("treats an object with at least one non-empty value as not empty", () => {
    expect(isEmptyExportValue({ a: [], b: [1] })).toBe(false);
  });

  it("recurses through nested objects", () => {
    expect(isEmptyExportValue({ a: { b: { c: [] } } })).toBe(true);
    expect(isEmptyExportValue({ a: { b: { c: [1] } } })).toBe(false);
  });

  it("never treats a Date as empty", () => {
    expect(isEmptyExportValue(new Date())).toBe(false);
  });

  it("never treats primitives as empty, including falsy ones", () => {
    expect(isEmptyExportValue("")).toBe(false);
    expect(isEmptyExportValue(0)).toBe(false);
    expect(isEmptyExportValue(false)).toBe(false);
  });

  it("does not inspect array items — a non-empty array is present even if entries are sparse", () => {
    expect(isEmptyExportValue([{}])).toBe(false);
  });
});

describe("omitEmptyExportKeys", () => {
  it("drops only the empty keys, keeping the rest untouched", () => {
    const input = {
      crmLeads: [],
      inbox: { conversations: [], tasks: [], events: [] },
      automations: { rules: [{ id: "r1" }] },
      marketplace: null as unknown as object,
    };
    expect(omitEmptyExportKeys(input)).toEqual({
      automations: { rules: [{ id: "r1" }] },
    });
  });

  it("returns an empty object when every bucket is empty", () => {
    expect(omitEmptyExportKeys({ a: [], b: {}, c: null as unknown as object })).toEqual({});
  });

  it("keeps a bucket that has at least one non-empty leaf", () => {
    const input = { inbox: { conversations: [{ id: "c1" }], tasks: [] } };
    expect(omitEmptyExportKeys(input)).toEqual(input);
  });

  it("is non-mutating", () => {
    const input = { a: [] as unknown[], b: [1] };
    const result = omitEmptyExportKeys(input);
    expect(result).not.toBe(input);
    expect(input).toEqual({ a: [], b: [1] });
  });
});
