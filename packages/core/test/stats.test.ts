import { describe, expect, it } from "vitest";
import { calculateStats, calculateWeekStats, instantiatePlan, type ProgressRecord } from "../src/index.js";

const updatedAt = "2027-01-01T00:00:00.000Z";

describe("calculateStats", () => {
  it("calculates status counts, actual distance, and completion rate", () => {
    const plan = instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 80,
    });
    const records: ProgressRecord[] = [
      { dayId: plan.weeks[0].days[0].id, status: "completed", actualDistanceKm: 10, updatedAt },
      { dayId: plan.weeks[0].days[1].id, status: "partial", actualDistanceKm: 5.5, updatedAt },
      { dayId: plan.weeks[0].days[2].id, status: "skipped", updatedAt },
    ];
    expect(calculateStats(plan, records)).toMatchObject({
      completedSessions: 1,
      partialSessions: 1,
      skippedSessions: 1,
      actualDistanceKm: 15.5,
      plannedSessions: 35,
      completionRate: 1 / 35,
      consecutiveCompletedWeeks: 0,
    });
  });

  it("counts consecutive fully completed weeks from the beginning of supplied progress", () => {
    const plan = instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 80,
    });
    const records: ProgressRecord[] = plan.weeks.slice(0, 2).flatMap((week) =>
      week.days.map((day) => ({ dayId: day.id, status: "completed" as const, updatedAt })),
    );
    expect(calculateStats(plan, records).consecutiveCompletedWeeks).toBe(2);
  });

  it("rejects progress for a day outside the plan", () => {
    const plan = instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 80,
    });
    expect(() => calculateStats(plan, [{ dayId: "other", status: "completed", updatedAt }])).toThrowError(/outside plan/);
  });

  it("uses the latest record per day and exposes week statistics", () => {
    const plan = instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 80,
    });
    const dayId = plan.weeks[0].days[0].id;
    const records: ProgressRecord[] = [
      { dayId, status: "partial", actualDistanceKm: 5, updatedAt: "2027-01-01T00:00:00.000Z" },
      { dayId, status: "completed", actualDistanceKm: 10, updatedAt: "2027-01-02T00:00:00.000Z" },
    ];
    expect(calculateStats(plan, records)).toMatchObject({ completedSessions: 1, partialSessions: 0, actualDistanceKm: 10 });
    expect(calculateWeekStats(plan, 5, records)).toMatchObject({
      plannedSessions: 7,
      completedSessions: 1,
      actualDistanceKm: 10,
      completionRate: 1 / 7,
    });
  });

  it("counts the streak ending at the most recently recorded week", () => {
    const plan = instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 80,
    });
    const records: ProgressRecord[] = plan.weeks.slice(1, 3).flatMap((week) => week.days.map((day) => ({
      dayId: day.id,
      status: "completed" as const,
      updatedAt,
    })));
    expect(calculateStats(plan, records).consecutiveCompletedWeeks).toBe(2);
  });

  it("rejects ambiguous duplicate timestamps and invalid duration", () => {
    const plan = instantiatePlan("5-week-cycle", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 80,
    });
    const dayId = plan.weeks[0].days[0].id;
    expect(() => calculateStats(plan, [
      { dayId, status: "partial", updatedAt },
      { dayId, status: "completed", updatedAt },
    ])).toThrowError(/same updatedAt/);
    expect(() => calculateStats(plan, [
      { dayId, status: "completed", actualDurationMinutes: -1, updatedAt },
    ])).toThrowError(/duration/);
  });
});
