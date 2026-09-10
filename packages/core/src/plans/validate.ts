import {
  TRAINING_TYPE_IDS,
  type PlanTemplate,
  type TrainingItem,
} from "../domain.js";

const registeredTypes = new Set<string>(TRAINING_TYPE_IDS);

export class PlanValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid plan template: ${issues.join("; ")}`);
    this.name = "PlanValidationError";
  }
}

function validateItem(item: TrainingItem, path: string, issues: string[]): void {
  if (!registeredTypes.has(item.type)) {
    issues.push(`${path}: unknown training type ${item.type}`);
  }
  if (item.repetitions !== undefined && (!Number.isInteger(item.repetitions) || item.repetitions < 1)) {
    issues.push(`${path}: repetitions must be a positive integer`);
  }
  if (item.repetitionRange && (
    !Number.isInteger(item.repetitionRange.min)
    || !Number.isInteger(item.repetitionRange.max)
    || item.repetitionRange.min < 1
    || item.repetitionRange.max < item.repetitionRange.min
  )) {
    issues.push(`${path}: invalid repetition range`);
  }
}

export function validatePlanTemplate(template: PlanTemplate): string {
  const issues: string[] = [];
  if (template.weeks.length !== template.weekCount) {
    issues.push(`expected ${template.weekCount} weeks, received ${template.weeks.length}`);
  }

  template.weeks.forEach((week, weekIndex) => {
    const expectedWeek = template.weekCount - weekIndex;
    if (week.week !== expectedWeek) {
      issues.push(`expected week ${expectedWeek}, received ${week.week}`);
    }
    if (!Number.isFinite(week.volume.min) || !Number.isFinite(week.volume.max)) {
      issues.push(`week ${week.week}: expected finite volume range`);
    } else if (week.volume.min < 0 || week.volume.max < week.volume.min) {
      issues.push(`week ${week.week}: invalid volume range`);
    }
    if (week.days.length !== 7) {
      issues.push(`week ${week.week}: expected exactly 7 days`);
    }
    week.days.forEach((day, dayIndex) => {
      if (day.dayIndex !== dayIndex) {
        issues.push(`week ${week.week}: expected dayIndex ${dayIndex}, received ${day.dayIndex}`);
      }
      if (day.items.length === 0) issues.push(`week ${week.week} day ${dayIndex}: expected at least one training item`);
      day.items.forEach((item, itemIndex) =>
        validateItem(item, `week ${week.week} day ${dayIndex} item ${itemIndex}`, issues),
      );
      day.alternatives?.forEach((alternative, alternativeIndex) => {
        if (alternative.length === 0) {
          issues.push(`week ${week.week} day ${dayIndex}: alternative ${alternativeIndex} must contain an item`);
        }
        alternative.forEach((item, itemIndex) =>
          validateItem(
            item,
            `week ${week.week} day ${dayIndex} alternative ${alternativeIndex} item ${itemIndex}`,
            issues,
          ),
        );
      });
    });
  });

  if (issues.length > 0) throw new PlanValidationError(issues);
  return template.id;
}
