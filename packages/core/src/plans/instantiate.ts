import type { PlanInstance } from "../domain.js";
import { calculateTrainingPaces } from "../pace.js";
import { getPlanTemplate } from "./registry.js";
import { buildDayWorkout, workoutPlannedTotals } from "./session-params.js";
import type { SessionContext } from "./session-params.js";

export interface InstantiatePlanParameters {
  raceDate: string;
  /** 乳酸阈配速（秒/公里）；options.paces 提供 VDOT 档位时可省略 */
  thresholdPaceSecondsPerKm?: number;
  maxWeeklyKm: number;
}

export interface InstantiatePlanOptions {
  /**
   * 覆盖默认配速档位（6 秒规则）。
   * VDOT 路径传入 assessFromResults().paces——T/I/R 按丹尼尔斯 VDOT 表，
   * 而非 6 秒规则推算；E/M 为表值区间。
   */
  paces?: import("../pace.js").TrainingPaces;
}

function parseIsoDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("raceDate must use YYYY-MM-DD format");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.toISOString().slice(0, 10) !== value) throw new Error("raceDate must be a valid date");
  return date;
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function roundKm(value: number): number {
  return Math.round(value * 10) / 10;
}

export function instantiatePlan(
  templateId: string,
  parameters: InstantiatePlanParameters,
  options: InstantiatePlanOptions = {},
): PlanInstance {
  if (!Number.isFinite(parameters.maxWeeklyKm) || parameters.maxWeeklyKm <= 0) {
    throw new Error("maxWeeklyKm must be a positive finite number");
  }
  const raceDate = parseIsoDate(parameters.raceDate);
  if (raceDate.getUTCDay() !== 0) throw new Error("raceDate must be a Sunday in the current templates");
  const template = getPlanTemplate(templateId);
  const firstDayOfRaceWeek = addUtcDays(raceDate, -6);
  if (!options.paces && (parameters.thresholdPaceSecondsPerKm === undefined || parameters.thresholdPaceSecondsPerKm <= 0)) {
    throw new Error("thresholdPaceSecondsPerKm 必须为正数（或提供 options.paces 使用 VDOT 档位）");
  }
  const paces = options.paces ?? calculateTrainingPaces(parameters.thresholdPaceSecondsPerKm!);

  return {
    templateId: template.id,
    templateVersion: template.schemaVersion,
    raceDate: parameters.raceDate,
    paces,
    weeks: template.weeks.map((week) => {
      const weekStart = addUtcDays(firstDayOfRaceWeek, -(week.week - 1) * 7);
      const context: SessionContext = {
        paces,
        weekVolumeKm: week.volume.min * parameters.maxWeeklyKm,
        maxWeeklyKm: parameters.maxWeeklyKm,
      };
      return {
        ...week,
        targetKm: {
          min: roundKm(week.volume.min * parameters.maxWeeklyKm),
          max: roundKm(week.volume.max * parameters.maxWeeklyKm),
        },
        days: week.days.map((day) => {
          const workoutTypes = day.items
            .filter((item) => item.type !== "REST" && item.type !== "RACE" && item.type !== "TEST")
            .map((item) => item.type);
          const workout = buildDayWorkout(workoutTypes, context);
          const planned = workout ? workoutPlannedTotals(workout) : undefined;
          return {
            ...day,
            id: `${template.id}:w${week.week}:d${day.dayIndex}`,
            date: isoDate(addUtcDays(weekStart, day.dayIndex)),
            workout,
            plannedDistanceKm: planned && planned.distanceKm > 0 ? planned.distanceKm : undefined,
            plannedDurationMinutes: planned && planned.durationMinutes > 0 ? planned.durationMinutes : undefined,
          };
        }),
      };
    }),
  };
}
