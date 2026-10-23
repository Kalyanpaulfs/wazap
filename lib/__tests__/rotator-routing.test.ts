import { describe, expect, it } from "vitest";
import { activeNumbers, allNumbersPaused, pickRotatorNumber, validNumbers } from "@/lib/rotator-routing";

const numbers = ["919800000001", "919800000002", "919800000003"];

describe("validNumbers", () => {
  it("keeps digits-only numbers with at least 8 digits", () => {
    expect(validNumbers(["+91 98000 00001", "1234567", "919800000002"])).toEqual(["919800000001", "919800000002"]);
  });
});

describe("activeNumbers", () => {
  it("returns everything when nothing is paused", () => {
    expect(activeNumbers(numbers, [])).toEqual(numbers);
  });

  it("drops a paused number", () => {
    expect(activeNumbers(numbers, ["919800000002"])).toEqual(["919800000001", "919800000003"]);
  });

  it("tolerates a '+' or other noise on the paused side", () => {
    expect(activeNumbers(numbers, ["+919800000002"])).toEqual(["919800000001", "919800000003"]);
  });

  it("returns empty when every number is paused", () => {
    expect(activeNumbers(numbers, numbers)).toEqual([]);
  });

  it("ignores a paused entry that isn't actually one of the numbers", () => {
    expect(activeNumbers(numbers, ["15550000000"])).toEqual(numbers);
  });
});

describe("allNumbersPaused", () => {
  it("is false when nothing is paused", () => {
    expect(allNumbersPaused(numbers, [])).toBe(false);
  });

  it("is false when only some numbers are paused", () => {
    expect(allNumbersPaused(numbers, ["919800000001"])).toBe(false);
  });

  it("is true when every number is paused", () => {
    expect(allNumbersPaused(numbers, numbers)).toBe(true);
  });

  it("is false for a rotator with no valid numbers at all (the pre-existing invalid-rotator case, not this feature)", () => {
    expect(allNumbersPaused([], [])).toBe(false);
  });
});

describe("pickRotatorNumber", () => {
  it("rotates fairly among all numbers when nothing is paused", () => {
    const picks = [0, 1, 2, 3, 4].map((i) => pickRotatorNumber(numbers, [], i));
    expect(picks).toEqual(["919800000001", "919800000002", "919800000003", "919800000001", "919800000002"]);
  });

  it("skips a paused number and keeps rotating fairly among the rest", () => {
    const paused = ["919800000002"];
    const picks = [0, 1, 2, 3, 4].map((i) => pickRotatorNumber(numbers, paused, i));
    expect(picks).toEqual(["919800000001", "919800000003", "919800000001", "919800000003", "919800000001"]);
  });

  it("returns null when every number is paused", () => {
    expect(pickRotatorNumber(numbers, numbers, 0)).toBeNull();
  });

  it("returns null when there are no numbers at all", () => {
    expect(pickRotatorNumber([], [], 0)).toBeNull();
  });

  it("handles a negative claim counter the same safe way as a positive one", () => {
    expect(pickRotatorNumber(numbers, [], -1)).toBe(numbers[numbers.length - 1]);
  });
});
