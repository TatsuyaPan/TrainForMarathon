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
    // 结构化课表（workout）属于训练内容，必须跟随一起搬走；
    // 否则交换后会出现「跑休日带着课表、训练日没有课表」。
    workout: source.workout,
    plannedDistanceKm: source.plannedDistanceKm,
    plannedDurationMinutes: source.plannedDurationMinutes,
  };
}

/**
 * 所有调整函数都保持调用方传入的额外字段（例如带 `id` 的计划实例），
 * 平台不需要在调整后再把 id 拼回去。
 */
function updateDay<T extends PlanInstance>(
  plan: T,
  weekNumber: number,
  dayIndex: number,
  update: (day: PlanInstanceDay) => PlanInstanceDay,
): T {
  assertDayIndex(dayIndex);
  const weekIndex = plan.weeks.findIndex(({ week }) => week === weekNumber);
  if (weekIndex === -1) throw new Error(`Unknown week: ${weekNumber}`);
  const sourceWeek = plan.weeks[weekIndex];
  const days = [...sourceWeek.days];
  days[dayIndex] = update(sourceWeek.days[dayIndex]);
  const weeks = [...plan.weeks];
  weeks[weekIndex] = { ...sourceWeek, days };
  return { ...plan, weeks } as T;
}

export function selectDayAlternative<T extends PlanInstance>(
  plan: T,
  weekNumber: number,
  dayIndex: number,
  alternativeIndex: number,
): T {
  return updateDay(plan, weekNumber, dayIndex, (day) => {
    if (!Number.isInteger(alternativeIndex) || alternativeIndex < 0) {
      throw new Error("alternative index must be a non-negative integer");
    }
    const alternative = day.alternatives?.[alternativeIndex];
    if (!alternative) throw new Error(`Unknown alternative: ${alternativeIndex}`);
    // 备选方案只有条目（items），没有对应的结构化课表：
    // 丢掉旧课表而不是留着错的；编排层 applyDayAlternative 会按档位重建 workout。
    return { ...day, items: alternative.map((item) => ({ ...item })), workout: undefined };
  });
}

export function setPlannedWorkout<T extends PlanInstance>(
  plan: T,
  weekNumber: number,
  dayIndex: number,
  planned: { distanceKm?: number; durationMinutes?: number },
): T {
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

export function swapPlanDays<T extends PlanInstance>(
  plan: T,
  weekNumber: number,
  firstDayIndex: number,
  secondDayIndex: number,
): T {
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
  return { ...plan, weeks } as T;
}
