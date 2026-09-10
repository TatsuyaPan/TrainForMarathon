import type { PlanInstance, ProgressRecord } from "./domain.js";

export interface TrainingStats {
  plannedSessions: number;
  completedSessions: number;
  partialSessions: number;
  skippedSessions: number;
  actualDistanceKm: number;
  completionRate: number;
  consecutiveCompletedWeeks: number;
}

function latestRecords(
  allowedDayIds: ReadonlySet<string>,
  records: readonly ProgressRecord[],
): Map<string, ProgressRecord> {
  const result = new Map<string, ProgressRecord>();
  for (const record of records) {
    if (!allowedDayIds.has(record.dayId)) throw new Error(`Progress day ${record.dayId} is outside plan`);
    const timestamp = Date.parse(record.updatedAt);
    if (!Number.isFinite(timestamp)) throw new Error(`Progress record has invalid updatedAt: ${record.updatedAt}`);
    if (record.actualDistanceKm !== undefined && (!Number.isFinite(record.actualDistanceKm) || record.actualDistanceKm < 0)) {
      throw new Error("actual distance must be a non-negative finite number");
    }
    if (record.actualDurationMinutes !== undefined && (!Number.isFinite(record.actualDurationMinutes) || record.actualDurationMinutes < 0)) {
      throw new Error("actual duration must be a non-negative finite number");
    }
    const previous = result.get(record.dayId);
    const previousTimestamp = previous ? Date.parse(previous.updatedAt) : Number.NEGATIVE_INFINITY;
    if (previous && timestamp === previousTimestamp && JSON.stringify(record) !== JSON.stringify(previous)) {
      throw new Error(`Progress day ${record.dayId} has conflicting records with the same updatedAt`);
    }
    if (!previous || timestamp > previousTimestamp) result.set(record.dayId, record);
  }
  return result;
}

function summarize(
  plannedDayIds: ReadonlySet<string>,
  recordsByDay: ReadonlyMap<string, ProgressRecord>,
  consecutiveCompletedWeeks: number,
): TrainingStats {
  const records = [...recordsByDay.values()].filter(({ dayId }) => plannedDayIds.has(dayId));
  const completedSessions = records.filter(({ status }) => status === "completed").length;
  const partialSessions = records.filter(({ status }) => status === "partial").length;
  const skippedSessions = records.filter(({ status }) => status === "skipped").length;
  return {
    plannedSessions: plannedDayIds.size,
    completedSessions,
    partialSessions,
    skippedSessions,
    actualDistanceKm: Math.round(records.reduce((sum, record) => sum + (record.actualDistanceKm ?? 0), 0) * 10) / 10,
    completionRate: plannedDayIds.size === 0 ? 0 : completedSessions / plannedDayIds.size,
    consecutiveCompletedWeeks,
  };
}

export function calculateStats(
  plan: PlanInstance,
  records: readonly ProgressRecord[],
): TrainingStats {
  const plannedDayIds = new Set(plan.weeks.flatMap((week) =>
    week.days.filter((day) => day.items.some((item) => item.type !== "REST")).map((day) => day.id),
  ));
  const recordsByDay = latestRecords(plannedDayIds, records);

  let consecutiveCompletedWeeks = 0;
  let latestRecordedWeekIndex = -1;
  for (let index = plan.weeks.length - 1; index >= 0; index -= 1) {
    if (plan.weeks[index].days.some((day) => recordsByDay.has(day.id))) {
      latestRecordedWeekIndex = index;
      break;
    }
  }
  for (let index = latestRecordedWeekIndex; index >= 0; index -= 1) {
    const week = plan.weeks[index];
    const trainingDays = week.days.filter((day) => plannedDayIds.has(day.id));
    if (trainingDays.length === 0 || !trainingDays.every((day) => recordsByDay.get(day.id)?.status === "completed")) break;
    consecutiveCompletedWeeks += 1;
  }

  return summarize(plannedDayIds, recordsByDay, consecutiveCompletedWeeks);
}

export function calculateWeekStats(
  plan: PlanInstance,
  weekNumber: number,
  records: readonly ProgressRecord[],
): TrainingStats {
  const allDayIds = new Set(plan.weeks.flatMap((week) =>
    week.days.filter((day) => day.items.some((item) => item.type !== "REST")).map((day) => day.id),
  ));
  const week = plan.weeks.find((candidate) => candidate.week === weekNumber);
  if (!week) throw new Error(`Unknown week: ${weekNumber}`);
  const weekDayIds = new Set(week.days
    .filter((day) => day.items.some((item) => item.type !== "REST"))
    .map((day) => day.id));
  const recordsByDay = latestRecords(allDayIds, records);
  const completed = weekDayIds.size > 0 && [...weekDayIds].every((id) => recordsByDay.get(id)?.status === "completed");
  return summarize(weekDayIds, recordsByDay, completed ? 1 : 0);
}
