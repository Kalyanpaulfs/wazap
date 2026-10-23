import { describe, expect, it } from "vitest";
import { parseCsvRows, parseMembersCsv, parseContactsCsv } from "@/lib/outreach/csv";

describe("parseCsvRows", () => {
  it("parses a simple CSV with BOM, quotes and CRLF", () => {
    const text = "﻿name,phone\r\n\"Ravi, K\",501234567\r\nSara,501234568\n";
    const rows = parseCsvRows(text);
    expect(rows).toEqual([
      ["name", "phone"],
      ["Ravi, K", "501234567"],
      ["Sara", "501234568"],
    ]);
  });

  it("throws on unterminated quotes", () => {
    expect(() => parseCsvRows('name,phone\n"Ravi,501234567')).toThrow(/incomplete/i);
  });

  it("skips blank lines", () => {
    const rows = parseCsvRows("name,phone\n\nSara,501234568\n\n");
    expect(rows).toEqual([["name", "phone"], ["Sara", "501234568"]]);
  });
});

describe("parseMembersCsv", () => {
  it("requires name, phone and email columns", () => {
    expect(() => parseMembersCsv("name,phone\nRavi,501234567", "AE")).toThrow(/name, phone and email/i);
  });

  it("cleans valid rows and rejects bad ones with reasons", () => {
    const csv = [
      "name,phone,email",
      "Ravi,501234567,ravi@example.com",
      ",501234568,noname@example.com",
      "Sara,501234569,not-an-email",
      "Omar,not-a-phone,omar@example.com",
    ].join("\n");
    const result = parseMembersCsv(csv, "AE");
    expect(result.valid).toEqual([{ name: "Ravi", phone: "971501234567", email: "ravi@example.com" }]);
    expect(result.rejected).toHaveLength(3);
    expect(result.rejected[0]).toEqual({ row: 3, reason: "Missing name." });
    expect(result.rejected[1].reason).toMatch(/email/i);
    expect(result.rejected[2].reason).toMatch(/phone|number/i);
  });

  it("rejects in-file duplicate phones, keeping the first", () => {
    const csv = ["name,phone,email", "Ravi,501234567,ravi@example.com", "Ravi 2,501234567,ravi2@example.com"].join("\n");
    const result = parseMembersCsv(csv, "AE");
    expect(result.valid).toHaveLength(1);
    expect(result.duplicatesInFile).toBe(1);
    expect(result.rejected[0].reason).toMatch(/duplicate/i);
  });
});

describe("parseContactsCsv", () => {
  it("requires only a phone column; name/notes are optional", () => {
    const csv = ["phone,name,notes", "501234567,Ravi,VIP", "501234568,,"].join("\n");
    const result = parseContactsCsv(csv, "AE");
    expect(result.valid).toEqual([
      { phone: "971501234567", name: "Ravi", notes: "VIP" },
      { phone: "971501234568", name: null, notes: null },
    ]);
  });

  it("errors when there's no phone column at all", () => {
    expect(() => parseContactsCsv("name,notes\nRavi,VIP", "AE")).toThrow(/phone column/i);
  });

  it("rejects in-file duplicate phones", () => {
    const csv = ["phone", "501234567", "501234567"].join("\n");
    const result = parseContactsCsv(csv, "AE");
    expect(result.valid).toHaveLength(1);
    expect(result.duplicatesInFile).toBe(1);
  });

  it("rejects a bare local number with no default country", () => {
    const result = parseContactsCsv("phone\n501234567", null);
    expect(result.valid).toHaveLength(0);
    expect(result.rejected[0].reason).toMatch(/country code/i);
  });
});
