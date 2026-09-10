import { describe, expect, it } from "vitest";
import {
  BUILTIN_LIBRARY,
  LIBRARY_TYPE_LABELS,
  createLibraryEntry,
  getLibraryEntry,
  listLibraryByType,
  recommendEntry,
} from "../src/library.js";
import { serializeWorkout, workoutTotals } from "../src/workout-dsl.js";

describe("built-in library", () => {
  it("contains all documented workout categories", () => {
    expect(BUILTIN_LIBRARY.length).toBeGreaterThanOrEqual(20);
    for (const type of Object.keys(LIBRARY_TYPE_LABELS)) {
      expect(BUILTIN_LIBRARY.some((entry) => entry.type === type)).toBe(true);
    }
  });

  it("every entry parses from DSL and serializes back", () => {
    for (const entry of BUILTIN_LIBRARY) {
      const workout = entry.workout;
      expect(workout.segments.length).toBeGreaterThan(0);
      expect(serializeWorkout(workout)).toBeTruthy();
      const totals = workoutTotals(workout);
      expect(totals.durationMinutes + totals.distanceKm).toBeGreaterThan(0);
    }
  });

  it("recommends the first entry of the type (placeholder algorithm)", () => {
    const recommended = recommendEntry("T");
    expect(recommended?.id).toBe("t-20min");
    expect(recommendEntry("I")?.type).toBe("I");
  });

  it("lists by type tags", () => {
    const tEntries = listLibraryByType("T");
    expect(tEntries.length).toBeGreaterThanOrEqual(6);
    const mixEntries = listLibraryByType(["T", "I"]);
    expect(mixEntries.some((entry) => entry.type === "mixed")).toBe(true);
  });

  it("looks up by id", () => {
    const yasso = getLibraryEntry("i-yasso-800");
    expect(yasso?.name).toContain("亚索");
    expect(getLibraryEntry("not-exist")).toBeUndefined();
  });

  it("creates custom entries with validation (dsl parse + required goal)", () => {
    const entry = createLibraryEntry({
      type: "T",
      name: "我的 8 分钟阈值",
      dsl: "[乳酸阈刺激] (8min@T@rpe8+1.5min@jg)*6",
      weeklyKmHint: "周跑量 ≥100km",
    });
    expect(entry.source).toBe("自定义");
    expect(entry.id).toMatch(/^custom-/);
    expect(serializeWorkout(entry.workout)).toContain("*6");
    expect(() => createLibraryEntry({ type: "T", name: "坏课表", dsl: "8min@X" })).toThrowError(/无效|未知|位置/);
    expect(() => createLibraryEntry({ type: "T", name: "无目的", dsl: "8min@T" })).toThrowError(/训练目的/);
    expect(() => createLibraryEntry({ type: "T", name: "", dsl: "[x] 8min@T" })).toThrowError(/名称/);
  });
});
