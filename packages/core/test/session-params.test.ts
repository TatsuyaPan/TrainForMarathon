import { describe, expect, it } from "vitest";
import { buildDayWorkout, sessionWorkout, mergeWorkouts } from "../src/plans/session-params.js";
import type { SessionContext } from "../src/plans/session-params.js";
import { calculateTrainingPaces } from "../src/pace.js";
import { pacesFromVdot } from "../src/vdot.js";
import { workoutTotals, serializeWorkout } from "../src/workout-dsl.js";
import { instantiatePlan } from "../src/plans/instantiate.js";
import { describeWorkout, formatTrainingDay } from "../src/workflow.js";

function context(weekVolumeKm: number, maxWeeklyKm: number): SessionContext {
  return {
    paces: calculateTrainingPaces(240),
    weekVolumeKm,
    maxWeeklyKm,
  };
}

describe("session workout generator", () => {
  it("selects T mode by weekly volume", () => {
    const low = sessionWorkout("T", context(42, 70), 1);
    expect(serializeWorkout(low)).toContain("20min@T@rpe7");
    const mid = sessionWorkout("T", context(90, 100), 1);
    expect(serializeWorkout(mid)).toContain("*8");
    const high = sessionWorkout("T", context(100, 120), 1);
    expect(serializeWorkout(high)).toContain("*6");
  });

  it("sizes I and R by weekly volume", () => {
    const i = sessionWorkout("I", context(100, 100), 1);
    const iTotals = workoutTotals(i);
    expect(iTotals.distanceKm).toBeLessThanOrEqual(8); // ≤ 周跑量 8%
    const r = sessionWorkout("R", context(100, 100), 1);
    const rTotals = workoutTotals(r);
    expect(rTotals.distanceKm).toBeLessThanOrEqual(5); // ≤ 周跑量 5%
  });

  it("splits mixed days by factor", () => {
    const tAlone = workoutTotals(sessionWorkout("T", context(100, 100), 1));
    const tMixed = workoutTotals(sessionWorkout("T", context(100, 100), 2));
    expect(tMixed.durationMinutes).toBeLessThanOrEqual(tAlone.durationMinutes);
    const merged = mergeWorkouts([
      sessionWorkout("T", context(100, 100), 2),
      sessionWorkout("R", context(100, 100), 2),
    ]);
    expect(merged.segments.length).toBe(2);
    expect(merged.goal).toContain("+");
  });
});

describe("instantiated plan contains concrete workouts", () => {
  it("fills day workouts with totals", () => {
    const plan = instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 240,
      maxWeeklyKm: 100,
    });
    const tDay = plan.weeks.find((week) => week.days.some((day) => day.items.some((item) => item.type === "T")));
    const day = tDay?.days.find((d) => d.items.some((item) => item.type === "T"));
    expect(day?.workout?.segments.length).toBeGreaterThan(0);
    expect(day?.workout?.totalDurationMinutes).toBeGreaterThan(0);
    expect(day?.plannedDurationMinutes).toBe(day?.workout?.totalDurationMinutes);
  });

  it("exposes explicit paces for E/M zones (estimated)", () => {
    const plan = instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 240,
      maxWeeklyKm: 80,
    });
    expect(plan.paces.E).toEqual({ fast: 190, slow: 210 });
    expect(plan.paces.M).toEqual({ fast: 220, slow: 230 });
    expect(plan.paces.T).toEqual({ fast: 225, slow: 240 });
  });

  it("accepts VDOT paces as an override (no threshold pace needed)", () => {
    const paces = pacesFromVdot(50);
    const plan = instantiatePlan(
      "20-week",
      { raceDate: "2027-03-21", maxWeeklyKm: 100 },
      { paces },
    );
    expect(plan.paces).toEqual(paces);
    const tDay = plan.weeks[1].days.find((d) => d.items.some((item) => item.type === "T"))!;
    const formatted = formatTrainingDay(tDay, plan.paces);
    expect(formatted.goal).toBeTruthy();
  });

  it("formats a training day with concrete parameters", () => {
    const plan = instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 240,
      maxWeeklyKm: 100,
    });
    const tDay = plan.weeks[1].days.find((d) => d.items.some((item) => item.type === "T"))!;
    const formatted = formatTrainingDay(tDay, plan.paces);
    expect(formatted.goal).toBeTruthy(); // 训练目的为独立字段（最高纲领）
    const allText = formatted.items.map((item) => item.text).join("\n");
    expect(allText).toContain("@T");
    const lines = describeWorkout(tDay.workout!, plan.paces);
    expect(lines.some((line) => line.includes("/km"))).toBe(true);
  });
});
