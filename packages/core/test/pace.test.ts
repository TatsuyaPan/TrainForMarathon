import { describe, expect, it } from "vitest";
import { calculateSixSecondPaces, formatPace } from "../src/index.js";

describe("six-second pace ranges", () => {
  it("matches the documented 3:40/km threshold example", () => {
    expect(calculateSixSecondPaces(220)).toEqual({
      E: null,
      M: null,
      T: { fast: 205, slow: 220 },
      I: { fast: 190, slow: 205 },
      R: { fast: 175, slow: 190 },
    });
  });

  it("formats pace seconds without decimal leakage", () => {
    expect(formatPace(220)).toBe("3:40/km");
    expect(formatPace(175)).toBe("2:55/km");
  });

  it("rejects implausible threshold pace values", () => {
    expect(() => calculateSixSecondPaces(0)).toThrowError(/positive/);
    expect(() => calculateSixSecondPaces(45)).toThrowError(/greater than 45/);
    expect(() => calculateSixSecondPaces(Number.NaN)).toThrowError(/finite/);
  });
});
