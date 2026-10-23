import { describe, expect, it } from "vitest";
import { canAddMember, canUploadContacts, remainingContactRoom } from "@/lib/outreach/plan";

describe("canAddMember", () => {
  it("allows below the limit, blocks at/over it", () => {
    expect(canAddMember(24, 25)).toBe(true);
    expect(canAddMember(25, 25)).toBe(false);
    expect(canAddMember(26, 25)).toBe(false);
  });
});

describe("canUploadContacts", () => {
  it("allows when the new total stays within the limit", () => {
    expect(canUploadContacts(4000, 1000, 5000)).toBe(true);
    expect(canUploadContacts(4000, 1001, 5000)).toBe(false);
  });
});

describe("remainingContactRoom", () => {
  it("never goes negative", () => {
    expect(remainingContactRoom(4000, 5000)).toBe(1000);
    expect(remainingContactRoom(6000, 5000)).toBe(0);
  });
});
