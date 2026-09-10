import { describe, expect, it } from "vitest";
import { instantiatePlan, listPlanTemplates, planEndsWithRaceDay, validateWorkout } from "../src/index.js";

describe("instantiatePlan", () => {
  it("anchors the final template day to the race date", () => {
    const plan = instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 100,
    });
    expect(plan.weeks[0].days[0].date).toBe("2026-11-02");
    expect(plan.weeks.at(-1)?.days.at(-1)?.date).toBe("2027-03-21");
  });

  it("calculates weekly kilometre ranges from the template ratio", () => {
    const plan = instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 100,
    });
    expect(plan.weeks[0].targetKm).toEqual({ min: 60, max: 70 });
    expect(plan.weeks.at(-1)?.targetKm).toEqual({ min: 40, max: 40 });
    expect(plan.paces.T).toEqual({ fast: 205, slow: 220 });
  });

  it("rejects invalid ISO dates and weekly volume", () => {
    expect(() => instantiatePlan("5-week-cycle", {
      raceDate: "21/03/2027",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 100,
    })).toThrowError(/YYYY-MM-DD/);
    expect(() => instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 0,
    })).toThrowError(/maxWeeklyKm/);
    expect(() => instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-20",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 80,
    })).toThrowError(/Sunday/);
  });

  it("does not share mutable training items between instances", () => {
    const parameters = { raceDate: "2027-03-21", thresholdPaceSecondsPerKm: 220, maxWeeklyKm: 80 };
    const first = instantiatePlan("5-week-cycle", parameters);
    first.weeks[0].days[0].items[0].type = "REST";
    expect(instantiatePlan("5-week-cycle", parameters).weeks[0].days[0].items[0].type).toBe("E");
  });

  it("锚点日期是比赛日还是周期结束日，由课表内容决定", () => {
    const parameters = { raceDate: "2027-03-21", thresholdPaceSecondsPerKm: 220, maxWeeklyKm: 80 };
    expect(planEndsWithRaceDay(instantiatePlan("20-week", parameters))).toBe(true);
    // 五周循环没有比赛日：锚点是这一轮循环的结束日
    expect(planEndsWithRaceDay(instantiatePlan("5-week-cycle", parameters))).toBe(false);
  });

  it("每个内置模板实例化后，所有训练日的结构化课表都非空且通过校验", () => {
    for (const template of listPlanTemplates()) {
      const plan = instantiatePlan(template.id, {
        raceDate: "2027-03-21",
        thresholdPaceSecondsPerKm: 220,
        maxWeeklyKm: 80,
      });
      const days = plan.weeks.flatMap((week) => week.days);
      expect(days.length).toBe(template.weekCount * 7);

      const trainingDays = days.filter((day) => day.workout);
      expect(trainingDays.length).toBeGreaterThan(0);
      for (const day of trainingDays) {
        expect(day.workout.phases.length).toBeGreaterThan(0);
        expect(day.workout.phases.every((phase) => phase.segments.length > 0)).toBe(true);
        expect(validateWorkout(day.workout)).toEqual([]);
      }
    }
  });
});
