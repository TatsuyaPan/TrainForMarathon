import type { PlanInstance, PlanInstanceDay } from "../domain.js";

function assertDayIndex(dayIndex: number): void {
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) {
    throw new Error("day index must be between 0 and 6");
  }
}

function withTraining(target: PlanInstanceDay, source: PlanInstanceDay): PlanInstanceDay {
  return {
    ...target,
    label: source.label,
    items: source.items,
    alternatives: source.alternatives,
    note: source.note,
    plannedDistanceKm: source.plannedDistanceKm,
    plannedDurationMinutes: source.plannedDurationMinutes,
  };
}

function updateDay(
  plan: PlanInstance,
  weekNumber: number,
  dayIndex: number,
  update: (day: PlanInstanceDay) => PlanInstanceDay,
): PlanInstance {
  assertDayIndex(dayIndex);
  const weekIndex = plan.weeks.findIndex(({ week }) => week === weekNumber);
  if (weekIndex === -1) throw new Error(`Unknown week: ${weekNumber}`);
  const sourceWeek = plan.weeks[weekIndex];
  const days = [...sourceWeek.days];
  days[dayIndex] = update(sourceWeek.days[dayIndex]);
  const weeks = [...plan.weeks];
  weeks[weekIndex] = { ...sourceWeek, days };
  return { ...plan, weeks };
}

export function selectDayAlternative(
  plan: PlanInstance,
  weekNumber: number,
  dayIndex: number,
  alternativeIndex: number,
): PlanInstance {
  return updateDay(plan, weekNumber, dayIndex, (day) => {
    if (!Number.isInteger(alternativeIndex) || alternativeIndex < 0) {
      throw new Error("alternative index must be a non-negative integer");
    }
    const alternative = day.alternatives?.[alternativeIndex];
    if (!alternative) throw new Error(`Unknown alternative: ${alternativeIndex}`);
    return { ...day, items: alternative.map((item) => ({ ...item })) };
  });
}

export function setPlannedWorkout(
  plan: PlanInstance,
  weekNumber: number,
  dayIndex: number,
  planned: { distanceKm?: number; durationMinutes?: number },
): PlanInstance {
  if (planned.distanceKm === undefined && planned.durationMinutes === undefined) {
    throw new Error("planned workout must include distance or duration");
  }
  for (const [name, value] of [["distance", planned.distanceKm], ["duration", planned.durationMinutes]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
      throw new Error(`planned ${name} must be a positive finite number`);
    }
  }
  return updateDay(plan, weekNumber, dayIndex, (day) => ({
    ...day,
    plannedDistanceKm: planned.distanceKm ?? day.plannedDistanceKm,
    plannedDurationMinutes: planned.durationMinutes ?? day.plannedDurationMinutes,
  }));
}

export function swapPlanDays(
  plan: PlanInstance,
  weekNumber: number,
  firstDayIndex: number,
  secondDayIndex: number,
): PlanInstance {
  assertDayIndex(firstDayIndex);
  assertDayIndex(secondDayIndex);
  const weekIndex = plan.weeks.findIndex(({ week }) => week === weekNumber);
  if (weekIndex === -1) throw new Error(`Unknown week: ${weekNumber}`);
  const sourceWeek = plan.weeks[weekIndex];
  const days = [...sourceWeek.days];
  days[firstDayIndex] = withTraining(sourceWeek.days[firstDayIndex], sourceWeek.days[secondDayIndex]);
  days[secondDayIndex] = withTraining(sourceWeek.days[secondDayIndex], sourceWeek.days[firstDayIndex]);
  const weeks = [...plan.weeks];
  weeks[weekIndex] = { ...sourceWeek, days };
  return { ...plan, weeks };
}
