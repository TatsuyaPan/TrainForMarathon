import { describe, expect, it } from "vitest";
import { instantiatePlan, selectDayAlternative, setPlannedWorkout, swapPlanDays } from "../src/index.js";

describe("swapPlanDays", () => {
  it("moves training by swapping content while preserving dates and day identifiers", () => {
    const plan = instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 100,
    });
    const before = plan.weeks[0];
    const adjusted = swapPlanDays(plan, 20, 0, 1);
    expect(adjusted.weeks[0].days[0]).toMatchObject({
      id: before.days[0].id,
      date: before.days[0].date,
      label: before.days[1].label,
    });
    expect(adjusted.weeks[0].days[1]).toMatchObject({
      id: before.days[1].id,
      date: before.days[1].date,
      label: before.days[0].label,
    });
    expect(plan.weeks[0].days[0].label).toBe("跑休");
  });

  it("selects a declared alternative and records a planned distance", () => {
    const plan = instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 100,
    });
    const alternative = selectDayAlternative(plan, 18, 1, 0);
    expect(alternative.weeks.find(({ week }) => week === 18)?.days[1].items[0].type).toBe("E");
    const planned = setPlannedWorkout(alternative, 18, 1, { distanceKm: 12 });
    expect(planned.weeks.find(({ week }) => week === 18)?.days[1].plannedDistanceKm).toBe(12);
    expect(() => setPlannedWorkout(plan, 18, 1, { distanceKm: 0 })).toThrowError(/positive/);
  });

  it("rejects unknown weeks and invalid day indexes", () => {
    const plan = instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 80,
    });
    expect(() => swapPlanDays(plan, 9, 0, 1)).toThrowError(/Unknown week/);
    expect(() => swapPlanDays(plan, 5, 0, 7)).toThrowError(/between 0 and 6/);
  });

  it("moves planned values with the training content", () => {
    const source = instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 100,
    });
    const planned = setPlannedWorkout(source, 20, 1, { distanceKm: 12, durationMinutes: 60 });
    const adjusted = swapPlanDays(planned, 20, 0, 1);
    expect(adjusted.weeks[0].days[0]).toMatchObject({ plannedDistanceKm: 12, plannedDurationMinutes: 60 });
    expect(adjusted.weeks[0].days[1].plannedDistanceKm).toBeUndefined();
  });
});
