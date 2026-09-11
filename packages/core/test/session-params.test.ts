import { describe, expect, it } from "vitest";
import { buildDayWorkout, sessionWorkout, mergeWorkouts, workoutPlannedTotals } from "../src/plans/session-params.js";
import type { SessionContext } from "../src/plans/session-params.js";
import { calculateTrainingPaces } from "../src/pace.js";
import { pacesFromVdot } from "../src/vdot.js";
import { serializeWorkout } from "../src/dsl/registry.js";
import { workoutTotals } from "../src/dsl/workout.js";
import { instantiatePlan } from "../src/plans/instantiate.js";
import { describeWorkout, formatTrainingDay } from "../src/workflow.js";

function context(weekVolumeKm: number, maxWeeklyKm: number): SessionContext {
  return {
    paces: calculateTrainingPaces(240),
    weekVolumeKm,
    maxWeeklyKm,
  };
}

describe("训练日内容生成器", () => {
  it("按周跑量选择 T 档模式", () => {
    const low = sessionWorkout("T", context(42, 70), 1);
    expect(serializeWorkout(low)).toContain("20min@T@RPE7");
    const mid = sessionWorkout("T", context(90, 100), 1);
    expect(serializeWorkout(mid)).toContain("8x(6min@T@RPE8+1min@jog)");
    const high = sessionWorkout("T", context(100, 120), 1);
    expect(serializeWorkout(high)).toContain("6x(8min@T@RPE8+90s@jog)");
  });

  it("I 与 R 按周跑量控制总量", () => {
    const i = sessionWorkout("I", context(100, 100), 1);
    expect(workoutTotals(i).workDistanceMeters / 1000).toBeLessThanOrEqual(8); // 主训练容量 ≤ 周跑量 8%
    const r = sessionWorkout("R", context(100, 100), 1);
    const rTotals = workoutTotals(r);
    expect(rTotals.workDistanceMeters / 1000).toBeLessThanOrEqual(5); // 主训练容量 ≤ 周跑量 5%
    expect(rTotals.recoveryDistanceMeters).toBeGreaterThan(0); // 恢复里程单独统计
    expect(buildDayWorkout(["REST"], context(100, 100))).toBeUndefined();
  });

  it("混合日按比例拆分并合并为一个主训练阶段", () => {
    const alone = workoutTotals(sessionWorkout("T", context(100, 100), 1));
    const mixed = workoutTotals(sessionWorkout("T", context(100, 100), 2));
    expect(mixed.workDurationSeconds).toBeLessThanOrEqual(alone.workDurationSeconds);

    const merged = mergeWorkouts([
      sessionWorkout("T", context(100, 100), 2),
      sessionWorkout("R", context(100, 100), 2),
    ]);
    expect(merged.phases).toHaveLength(1);
    expect(merged.phases[0].role).toBe("main");
    expect(merged.phases[0].segments).toHaveLength(2);
    expect(merged.goal).toContain("+");
  });

  it("生成内容全部可导出并统计", () => {
    const workout = buildDayWorkout(["T", "I"], context(100, 100))!;
    expect(serializeWorkout(workout)).toContain("WORKOUT/2");
    const planned = workoutPlannedTotals(workout);
    expect(planned.durationMinutes + planned.distanceKm).toBeGreaterThan(0);
  });
});

describe("实例化计划包含明确内容", () => {
  it("为训练日填充计划内容与总量", () => {
    const plan = instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 240,
      maxWeeklyKm: 100,
    });
    const tWeek = plan.weeks.find((week) => week.days.some((day) => day.items.some((item) => item.type === "T")));
    const day = tWeek?.days.find((d) => d.items.some((item) => item.type === "T"));
    expect(day?.workout?.phases.length).toBeGreaterThan(0);
    expect((day?.plannedDurationMinutes ?? 0) + (day?.plannedDistanceKm ?? 0)).toBeGreaterThan(0);
  });

  it("E/M/T 配速档与 VDOT 覆盖", () => {
    const plan = instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 240,
      maxWeeklyKm: 80,
    });
    expect(plan.paces.E).toEqual({ fast: 190, slow: 210 });
    expect(plan.paces.M).toEqual({ fast: 220, slow: 230 });
    expect(plan.paces.T).toEqual({ fast: 225, slow: 240 });

    const paces = pacesFromVdot(50);
    const withVdot = instantiatePlan("20-week", { raceDate: "2027-03-21", maxWeeklyKm: 100 }, { paces });
    expect(withVdot.paces).toEqual(paces);
  });

  it("训练日展示包含训练目的与具体配速", () => {
    const plan = instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 240,
      maxWeeklyKm: 100,
    });
    const tDay = plan.weeks[1].days.find((day) => day.items.some((item) => item.type === "T"))!;
    const formatted = formatTrainingDay(tDay, plan.paces);
    expect(formatted.goal).toBeTruthy();
    const allText = formatted.items.map((item) => item.text).join("\n");
    expect(allText).toContain("@T");
    const lines = describeWorkout(tDay.workout!, plan.paces);
    expect(lines.some((line) => line.includes("/km"))).toBe(true);
  });
});
