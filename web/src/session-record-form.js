import { validateWorkout } from "@core";

export function createSessionRecordForm(session) {
  const plannedWorkout = clone(session.plannedWorkout);
  const actualWorkout = clone(session.actualWorkout ?? session.plannedWorkout);
  return {
    plannedWorkout,
    actualWorkout,
    adjustActualWorkout: Boolean(session.actualWorkout) && !sameWorkout(session.actualWorkout, session.plannedWorkout),
    distanceKm: session.actualDistanceKm ?? null,
    durationMinutes: session.actualDurationMinutes ?? null,
    rpe: session.actualRpe ?? null,
    log: session.log ?? "",
  };
}

export function toCompleteSessionInput(form) {
  const actualDistanceKm = optionalPositiveNumber(form.distanceKm, "实际距离");
  const actualDurationMinutes = optionalPositiveNumber(form.durationMinutes, "实际时长");
  const actualRpe = optionalRpe(form.rpe);
  const actualWorkout = clone(form.actualWorkout);
  if (actualWorkout) {
    const errors = validateWorkout(actualWorkout);
    if (errors.length > 0) throw new Error(errors.join("\n"));
  }

  return compact({
    actualWorkout,
    actualDistanceKm,
    actualDurationMinutes,
    actualRpe,
    log: String(form.log ?? "").trim() || undefined,
  });
}

export function resetActualWorkoutToPlan(form) {
  form.actualWorkout = clone(form.plannedWorkout);
  form.adjustActualWorkout = false;
}

function optionalPositiveNumber(value, label) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label}必须大于 0`);
  return number;
}

function optionalRpe(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10) throw new Error("RPE 必须是 1-10 的整数");
  return number;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function sameWorkout(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}
