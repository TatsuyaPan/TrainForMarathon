/**
 * 训练记录表单模型（平台无关）。
 *
 * 一次训练最多对应一份实际训练记录：实际内容（Workout）、距离、时长、RPE、训练日志。
 * web / 微信小程序 / 测试共用这里的初始化、校验与归一化，平台只负责把表单渲染出来。
 */
import type { TrainingSession, Workout } from "./domain.js";
import type { CompleteSessionInput } from "./workflow.js";
import { validateWorkout } from "./dsl/workout.js";

/** 记录表单：字段与 `TrainingSession` 上的实际记录一一对应 */
export interface SessionRecordForm {
  /** 计划内容（只读参考，用于「按计划完成」与对比） */
  plannedWorkout?: Workout;
  /** 实际训练内容；按计划完成时等于计划内容的深拷贝 */
  actualWorkout?: Workout;
  /** 是否偏离计划：已有实际记录且与计划内容不同 */
  adjustActualWorkout: boolean;
  distanceKm: number | null;
  durationMinutes: number | null;
  rpe: number | null;
  log: string;
}

/**
 * 由一次训练初始化记录表单：
 * - 已有实际记录 → 还原它（编辑场景）；
 * - 尚未记录 → 深拷贝计划内容，默认「按计划完成」；
 * - 追加训练没有计划内容 → 实际内容为空，等用户补充。
 */
export function createSessionRecordForm(session: TrainingSession): SessionRecordForm {
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

/**
 * 表单 → 完成训练的输入。
 * 距离/时长必须大于 0，RPE 必须是 1-10 的整数；结构化内容会按当前 DSL 校验。
 */
export function toCompleteSessionInput(form: SessionRecordForm): CompleteSessionInput {
  const actualDistanceKm = optionalPositiveNumber(form.distanceKm, "实际距离");
  const actualDurationMinutes = optionalPositiveNumber(form.durationMinutes, "实际时长");
  const actualRpe = optionalRpe(form.rpe);
  const actualWorkout = clone(form.actualWorkout);
  if (actualWorkout) {
    const errors = validateWorkout(actualWorkout);
    if (errors.length > 0) throw new Error(errors.map((issue) => issue.message).join("\n"));
  }

  return compact({
    actualWorkout,
    actualDistanceKm,
    actualDurationMinutes,
    actualRpe,
    log: String(form.log ?? "").trim() || undefined,
  });
}

/** 回到「按计划完成」：实际内容重置为计划内容的深拷贝 */
export function resetActualWorkoutToPlan(form: SessionRecordForm): void {
  form.actualWorkout = clone(form.plannedWorkout);
  form.adjustActualWorkout = false;
}

function optionalPositiveNumber(value: number | string | null | undefined, label: string): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`${label}必须大于 0`);
  return number;
}

function optionalRpe(value: number | string | null | undefined): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || number > 10) throw new Error("RPE 必须是 1-10 的整数");
  return number;
}

function compact(value: CompleteSessionInput): CompleteSessionInput {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as CompleteSessionInput;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

function sameWorkout(left: Workout | undefined, right: Workout | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
