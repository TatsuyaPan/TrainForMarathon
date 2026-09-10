import { describe, expect, it } from "vitest";
import {
  INTENSITY_COLORS,
  intensityBarStyle,
  workoutIntensities,
} from "../src/training-visuals.js";
import { parseWorkoutDsl } from "../src/workout-dsl.js";

describe("training intensity visuals", () => {
  it("maps zones by color scheme: green -> yellow -> red -> purple -> light purple", () => {
    const channel = (hex: string, from: number, to: number) => parseInt(hex.slice(from, to), 16);
    const isGreenish = (hex: string) => channel(hex, 3, 5) > channel(hex, 1, 3); // G > R
    const isReddish = (hex: string) => channel(hex, 1, 3) > channel(hex, 3, 5); // R > G
    const isPurple = (hex: string) => channel(hex, 1, 3) > channel(hex, 3, 5) && channel(hex, 5, 7) > channel(hex, 3, 5); // R > G 且 B > G
    expect(isGreenish(INTENSITY_COLORS.E)).toBe(true); // 轻松跑绿
    expect(isReddish(INTENSITY_COLORS.I)).toBe(true); // 摄氧红
    expect(isPurple(INTENSITY_COLORS.R)).toBe(true); // 重复紫
    expect(isPurple(INTENSITY_COLORS.ST)).toBe(true); // 跨步淡紫
    // 淡紫比紫更浅（ST 绿色通道高于 R）
    expect(channel(INTENSITY_COLORS.ST, 3, 5)).toBeGreaterThan(channel(INTENSITY_COLORS.R, 3, 5));
  });

  it("extracts single intensity from a workout", () => {
    const workout = parseWorkoutDsl("[x] (800m@I+3min@jg)*10");
    expect(workoutIntensities(workout)).toEqual(["I"]);
  });

  it("extracts mixed intensities ordered by strength", () => {
    const workout = parseWorkoutDsl("[x] (6min@T+1min@jg)*4+(400m@R+400m@jg)*6");
    expect(workoutIntensities(workout)).toEqual(["T", "R"]);
  });

  it("nested sets are flattened", () => {
    const workout = parseWorkoutDsl("[x] (5min@M+(400m@R+400m@jg)*3)*2");
    expect(workoutIntensities(workout)).toEqual(["M", "R"]);
  });

  it("bar style: single color vs mixed gradient", () => {
    const single = parseWorkoutDsl("[x] 8min@T");
    expect(intensityBarStyle(single)).toContain(INTENSITY_COLORS.T);
    expect(intensityBarStyle(single)).not.toContain("linear-gradient");
    const mixed = parseWorkoutDsl("[x] (6min@T+1min@jg)*4+(400m@R+400m@jg)*6");
    expect(intensityBarStyle(mixed)).toContain("linear-gradient");
    expect(intensityBarStyle(mixed)).toContain(INTENSITY_COLORS.T);
    expect(intensityBarStyle(mixed)).toContain(INTENSITY_COLORS.R);
  });

  it("rest color fallback for empty or rest workouts", () => {
    expect(intensityBarStyle(undefined)).toContain("#c3cac5");
  });
});
