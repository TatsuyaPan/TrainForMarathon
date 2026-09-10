import type { PlanInstance } from "../domain.js";
import { calculateSixSecondPaces } from "../pace.js";
import { getPlanTemplate } from "./registry.js";

export interface InstantiatePlanParameters {
  raceDate: string;
  thresholdPaceSecondsPerKm: number;
  maxWeeklyKm: number;
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
): PlanInstance {
  if (!Number.isFinite(parameters.maxWeeklyKm) || parameters.maxWeeklyKm <= 0) {
    throw new Error("maxWeeklyKm must be a positive finite number");
  }
  const raceDate = parseIsoDate(parameters.raceDate);
  if (raceDate.getUTCDay() !== 0) throw new Error("raceDate must be a Sunday in the current templates");
  const template = getPlanTemplate(templateId);
  const firstDayOfRaceWeek = addUtcDays(raceDate, -6);

  return {
    templateId: template.id,
    templateVersion: template.schemaVersion,
    raceDate: parameters.raceDate,
    paces: calculateSixSecondPaces(parameters.thresholdPaceSecondsPerKm),
    weeks: template.weeks.map((week) => {
      const weekStart = addUtcDays(firstDayOfRaceWeek, -(week.week - 1) * 7);
      return {
        ...week,
        targetKm: {
          min: roundKm(week.volume.min * parameters.maxWeeklyKm),
          max: roundKm(week.volume.max * parameters.maxWeeklyKm),
        },
        days: week.days.map((day) => ({
          ...day,
          id: `${template.id}:w${week.week}:d${day.dayIndex}`,
          date: isoDate(addUtcDays(weekStart, day.dayIndex)),
        })),
      };
    }),
  };
}
