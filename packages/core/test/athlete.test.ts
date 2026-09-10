import { describe, expect, it } from "vitest";
import {
  createAthlete,
  createLocalAthleteId,
  hasTrainingSetup,
} from "../src/athlete.js";

describe("athlete profile", () => {
  it("creates a unified athlete profile", () => {
    const now = "2026-09-10T00:00:00.000Z";
    const athlete = createAthlete({ id: "openid-abc", provider: "wechat", now });
    expect(athlete).toEqual({
      schemaVersion: 1,
      id: "openid-abc",
      provider: "wechat",
      name: undefined,
      createdAt: now,
      updatedAt: now,
    });
  });

  it("accepts a custom nickname", () => {
    const athlete = createAthlete({ id: "local-1", provider: "local", name: "阿跑" });
    expect(athlete.name).toBe("阿跑");
  });

  it("defaults createdAt to the current time", () => {
    const athlete = createAthlete({ id: "local-1", provider: "local" });
    expect(athlete.createdAt).toBeTruthy();
    expect(athlete.createdAt).toBe(athlete.updatedAt);
  });

  it("generates unique local athlete ids", () => {
    const ids = new Set(Array.from({ length: 100 }, createLocalAthleteId));
    expect(ids.size).toBe(100);
  });

  it("hasTrainingSetup detects whether a plan is configured", () => {
    const athlete = createAthlete({ id: "x", provider: "local" });
    expect(hasTrainingSetup(athlete)).toBe(false);
    expect(hasTrainingSetup({ ...athlete, planId: "20-week:2026-11-15" })).toBe(true);
    expect(hasTrainingSetup(null)).toBe(false);
  });
});
