/**
 * 与版本无关的 Workout 操作：汇总、估算、结构校验。
 * 这些函数基于 v1 AST；汇总与校验规则见 spec/dsl/v1/workout-dsl-v1.md §3、§6。
 */
import {
  DANIELS_ZONES,
  WORKOUT_PHASE_ROLES,
  type DanielsZone,
  type Load,
  type RepeatBlock,
  type TrainingTarget,
  type Workout,
  type WorkoutPhase,
  type WorkoutPhaseRole,
  type WorkoutSegment,
} from "../domain.js";
import type { TrainingPaces } from "../pace.js";

/** 循环最大嵌套深度（最外层循环记为 1） */
export const MAX_REPEAT_DEPTH = 10;

/** 阶段顺序（固定） */
export const WORKOUT_PHASE_ORDER: readonly WorkoutPhaseRole[] = WORKOUT_PHASE_ROLES;

export interface WorkoutTotals {
  knownDistanceMeters: number;
  knownDurationSeconds: number;
  workDistanceMeters: number;
  workDurationSeconds: number;
  recoveryDistanceMeters: number;
  recoveryDurationSeconds: number;
  restDurationSeconds: number;
}

interface MutableTotals {
  knownDistanceMeters: number;
  knownDurationSeconds: number;
  workDistanceMeters: number;
  workDurationSeconds: number;
  recoveryDistanceMeters: number;
  recoveryDurationSeconds: number;
  restDurationSeconds: number;
}

function emptyTotals(): MutableTotals {
  return {
    knownDistanceMeters: 0,
    knownDurationSeconds: 0,
    workDistanceMeters: 0,
    workDurationSeconds: 0,
    recoveryDistanceMeters: 0,
    recoveryDurationSeconds: 0,
    restDurationSeconds: 0,
  };
}

function addLoad(totals: MutableTotals, load: Load, times = 1): void {
  if (load.type === "distance") totals.knownDistanceMeters += load.meters * times;
  else totals.knownDurationSeconds += load.seconds * times;
}

function sumSegments(
  segments: readonly WorkoutSegment[],
  role: WorkoutPhaseRole,
  totals: MutableTotals,
  times = 1,
): void {
  for (const segment of segments) {
    switch (segment.kind) {
      case "run": {
        addLoad(totals, segment.load, times);
        if (role === "main") {
          if (segment.load.type === "distance") totals.workDistanceMeters += segment.load.meters * times;
          else totals.workDurationSeconds += segment.load.seconds * times;
        }
        break;
      }
      case "recovery": {
        addLoad(totals, segment.load, times);
        if (segment.load.type === "distance") totals.recoveryDistanceMeters += segment.load.meters * times;
        else totals.recoveryDurationSeconds += segment.load.seconds * times;
        break;
      }
      case "rest": {
        totals.knownDurationSeconds += segment.durationSeconds * times;
        totals.restDurationSeconds += segment.durationSeconds * times;
        break;
      }
      case "repeat": {
        sumSegments(segment.segments, role, totals, times * segment.repetitions);
        break;
      }
    }
  }
}

/** 汇总已知距离/时间，并单独统计主训练容量、恢复与休息 */
export function workoutTotals(workout: Workout): WorkoutTotals {
  const totals = emptyTotals();
  for (const phase of workout.phases) sumSegments(phase.segments, phase.role, totals);
  return totals;
}

/** 循环总次数（含嵌套，用于展示） */
export function countRepeatBlocks(workout: Workout): number {
  const walk = (segments: readonly WorkoutSegment[]): number =>
    segments.reduce(
      (sum, segment) => sum + (segment.kind === "repeat" ? 1 + walk(segment.segments) : 0),
      0,
    );
  return workout.phases.reduce((sum, phase) => sum + walk(phase.segments), 0);
}

/** 步骤总数（循环内部的步骤也计入；不含循环容器本身） */
export function countSteps(workout: Workout): number {
  const walk = (segments: readonly WorkoutSegment[]): number =>
    segments.reduce((sum, segment) => {
      if (segment.kind === "repeat") return sum + walk(segment.segments) * segment.repetitions;
      return sum + 1;
    }, 0);
  return workout.phases.reduce((sum, phase) => sum + walk(phase.segments), 0);
}

/** 每个强度档位在主训练中出现的次数（用于课程标签与筛选） */
export function workoutZones(workout: Workout): DanielsZone[] {
  const found = new Set<DanielsZone>();
  const walk = (segments: readonly WorkoutSegment[]): void => {
    for (const segment of segments) {
      if (segment.kind === "repeat") walk(segment.segments);
      else if (segment.kind === "run" && segment.target.type === "daniels") found.add(segment.target.zone);
    }
  };
  for (const phase of workout.phases) walk(phase.segments);
  return DANIELS_ZONES.filter((zone) => found.has(zone));
}

export interface WorkoutEstimate {
  knownDistanceMeters: number;
  knownDurationSeconds: number;
  estimatedDistanceMeters: number;
  estimatedDurationSeconds: number;
  /** 所有步骤都能在给定配速下换算，估算才是完整的 */
  complete: boolean;
}

function targetSecondsPerKm(target: TrainingTarget, paces?: TrainingPaces): number | undefined {
  if (!paces) return undefined;
  if (target.type === "pace-range") {
    return Math.round((target.fastSecondsPerKm + target.slowSecondsPerKm) / 2);
  }
  if (target.type === "daniels") {
    const range = paces[target.zone as keyof TrainingPaces];
    if (!range) return undefined;
    return Math.round((range.fast + range.slow) / 2);
  }
  return undefined;
}

/**
 * 结合运动员配速估算完整距离与时间。估算只用于展示，不写入 DSL 或 Workout。
 * 恢复跑按 E 档慢端估算；心率、RPE 等无配速上下文的目标无法换算。
 */
export function estimateWorkoutTotals(workout: Workout, paces?: TrainingPaces): WorkoutEstimate {
  const known = workoutTotals(workout);
  let extraDistance = 0;
  let extraDuration = 0;
  let complete = true;

  const walk = (segments: readonly WorkoutSegment[], times: number): void => {
    for (const segment of segments) {
      if (segment.kind === "repeat") {
        walk(segment.segments, times * segment.repetitions);
        continue;
      }
      if (segment.kind === "rest") continue;
      if (segment.kind === "recovery") {
        const pace = paces ? Math.round((paces.E.fast + paces.E.slow) / 2) : undefined;
        if (segment.load.type === "time") {
          if (pace === undefined) complete = false;
          else extraDistance += (segment.load.seconds / pace) * 1000 * times;
        } else if (pace === undefined) {
          complete = false;
        } else {
          extraDuration += ((segment.load.meters / 1000) * pace) * times;
        }
        continue;
      }
      const pace = targetSecondsPerKm(segment.target, paces);
      if (pace === undefined) {
        complete = false;
        continue;
      }
      if (segment.load.type === "time") extraDistance += (segment.load.seconds / pace) * 1000 * times;
      else extraDuration += (segment.load.meters / 1000) * pace * times;
    }
  };

  for (const phase of workout.phases) walk(phase.segments, 1);

  return {
    knownDistanceMeters: known.knownDistanceMeters,
    knownDurationSeconds: known.knownDurationSeconds,
    estimatedDistanceMeters: Math.round(known.knownDistanceMeters + extraDistance),
    estimatedDurationSeconds: Math.round(known.knownDurationSeconds + extraDuration),
    complete,
  };
}

export interface WorkoutIssue {
  code: string;
  message: string;
  /** 结构路径，例如 `phases[1].segments[0].segments[1]` */
  path: string;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function stripOptional(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** 校验 Workout 结构；返回空数组表示合法 */
export function validateWorkout(workout: Workout): WorkoutIssue[] {
  const issues: WorkoutIssue[] = [];
  const push = (code: string, message: string, path: string): void => {
    issues.push({ code, message, path });
  };

  if (!workout || typeof workout !== "object") {
    push("invalid-workout", "课程内容缺失", "workout");
    return issues;
  }
  if (!isPositiveInteger(workout.dslVersion)) {
    push("invalid-version", "课程缺少 DSL 版本号", "workout.dslVersion");
  }
  if (stripOptional(workout.goal) === undefined) {
    push("missing-goal", "训练目的（GOAL）为必填项：每次训练都必须明确训练目的", "workout.goal");
  }
  if (!Array.isArray(workout.phases) || workout.phases.length === 0) {
    push("missing-phase", "课程必须至少包含一个阶段（WU/MS/CD）", "workout.phases");
    return issues;
  }

  const seen = new Map<WorkoutPhaseRole, number>();
  let lastOrder = -1;
  workout.phases.forEach((phase, index) => {
    const path = `workout.phases[${index}]`;
    if (!phase || !WORKOUT_PHASE_ORDER.includes(phase.role)) {
      push("invalid-phase", `未知阶段类型「${String(phase?.role)}」`, path);
      return;
    }
    seen.set(phase.role, (seen.get(phase.role) ?? 0) + 1);
    const order = WORKOUT_PHASE_ORDER.indexOf(phase.role);
    if (order < lastOrder) {
      push("phase-order", "阶段顺序必须为 热身(WU) → 主训练(MS) → 冷身(CD)", path);
    }
    lastOrder = Math.max(lastOrder, order);
    if (!Array.isArray(phase.segments) || phase.segments.length === 0) {
      push("empty-phase", "阶段内容不能为空（至少包含一个步骤或循环）", `${path}.segments`);
      return;
    }
    validateSegments(phase.segments, `${path}.segments`, 1, issues);
  });

  if (!seen.has("main")) push("missing-main-phase", "课程必须包含主训练阶段（MS）", "workout.phases");
  for (const [role, count] of seen) {
    if (count > 1) push("duplicate-phase", `阶段「${role}」只能出现一次`, "workout.phases");
  }
  return issues;
}

function validateSegments(
  segments: readonly WorkoutSegment[],
  path: string,
  depth: number,
  issues: WorkoutIssue[],
): void {
  segments.forEach((segment, index) => {
    const segmentPath = `${path}[${index}]`;
    if (!segment || typeof segment !== "object") {
      issues.push({ code: "invalid-segment", message: "步骤缺失", path: segmentPath });
      return;
    }
    switch (segment.kind) {
      case "run": {
        validateLoad(segment.load, `${segmentPath}.load`, issues);
        validateTarget(segment.target, `${segmentPath}.target`, issues);
        if (segment.rpe !== undefined && (!Number.isInteger(segment.rpe) || segment.rpe < 1 || segment.rpe > 10)) {
          issues.push({ code: "invalid-rpe", message: "辅助 RPE 范围应为 1-10 的整数", path: `${segmentPath}.rpe` });
        }
        if (
          segment.inclinePercent !== undefined &&
          (!Number.isFinite(segment.inclinePercent) || segment.inclinePercent < 0 || segment.inclinePercent > 20)
        ) {
          issues.push({ code: "invalid-incline", message: "坡度范围应为 0-20%", path: `${segmentPath}.inclinePercent` });
        }
        break;
      }
      case "recovery": {
        validateLoad(segment.load, `${segmentPath}.load`, issues);
        break;
      }
      case "rest": {
        if (!isPositiveInteger(segment.durationSeconds)) {
          issues.push({
            code: "invalid-rest",
            message: "休息时间必须为正整数秒",
            path: `${segmentPath}.durationSeconds`,
          });
        }
        break;
      }
      case "repeat": {
        if (!isPositiveInteger(segment.repetitions)) {
          issues.push({
            code: "invalid-repetitions",
            message: "循环次数必须为正整数",
            path: `${segmentPath}.repetitions`,
          });
        }
        if (depth > MAX_REPEAT_DEPTH) {
          issues.push({
            code: "repeat-too-deep",
            message: `循环嵌套不能超过 ${MAX_REPEAT_DEPTH} 层`,
            path: segmentPath,
          });
        }
        if (!Array.isArray(segment.segments) || segment.segments.length === 0) {
          issues.push({ code: "empty-repeat", message: "循环内至少包含一个分部", path: `${segmentPath}.segments` });
          return;
        }
        validateSegments(segment.segments, `${segmentPath}.segments`, depth + 1, issues);
        break;
      }
      default: {
        issues.push({ code: "unknown-segment", message: "未知步骤类型", path: segmentPath });
      }
    }
  });
}

function validateLoad(load: Load, path: string, issues: WorkoutIssue[]): void {
  if (!load || typeof load !== "object") {
    issues.push({ code: "invalid-load", message: "步骤缺少负荷", path });
    return;
  }
  if (load.type === "time") {
    if (!isPositiveInteger(load.seconds)) {
      issues.push({ code: "invalid-load", message: "时间负荷必须为正整数秒", path });
    }
    return;
  }
  if (load.type === "distance") {
    if (!isPositiveInteger(load.meters)) {
      issues.push({ code: "invalid-load", message: "距离负荷必须为正整数米", path });
    }
    return;
  }
  issues.push({ code: "invalid-load", message: "负荷类型只能是时间或距离", path });
}

function validateTarget(target: TrainingTarget, path: string, issues: WorkoutIssue[]): void {
  if (!target || typeof target !== "object") {
    issues.push({ code: "invalid-target", message: "跑步步骤缺少训练目标", path });
    return;
  }
  switch (target.type) {
    case "daniels":
      if (!DANIELS_ZONES.includes(target.zone)) {
        issues.push({ code: "invalid-target", message: `未知强度档位「${target.zone}」`, path });
      }
      return;
    case "pace-range":
      if (
        !Number.isInteger(target.fastSecondsPerKm) ||
        !Number.isInteger(target.slowSecondsPerKm) ||
        target.fastSecondsPerKm < 90 ||
        target.slowSecondsPerKm > 900 ||
        target.fastSecondsPerKm >= target.slowSecondsPerKm
      ) {
        issues.push({
          code: "invalid-target",
          message: "自定义配速无效：快端必须小于慢端，范围为 90-900 秒/公里",
          path,
        });
      }
      return;
    case "heart-rate":
      if (
        (target.basis !== "max" && target.basis !== "reserve") ||
        !Number.isInteger(target.minPercent) ||
        !Number.isInteger(target.maxPercent) ||
        target.minPercent < 40 ||
        target.maxPercent > 100 ||
        target.minPercent >= target.maxPercent
      ) {
        issues.push({
          code: "invalid-target",
          message: "心率百分比无效：范围 40-100% 且下限小于上限",
          path,
        });
      }
      return;
    case "heart-rate-absolute":
      if (
        !Number.isInteger(target.minBpm) ||
        !Number.isInteger(target.maxBpm) ||
        target.minBpm < 40 ||
        target.maxBpm > 230 ||
        target.minBpm >= target.maxBpm
      ) {
        issues.push({ code: "invalid-target", message: "绝对心率无效：范围 40-230 bpm 且下限小于上限", path });
      }
      return;
    case "rpe":
      if (!Number.isInteger(target.value) || target.value < 1 || target.value > 10) {
        issues.push({ code: "invalid-target", message: "RPE 目标范围应为 1-10 的整数", path });
      }
      return;
    default:
      issues.push({ code: "invalid-target", message: "未知训练目标类型", path });
  }
}

/** 判断 Workout 是否可保存（无校验问题） */
export function isWorkoutValid(workout: Workout): boolean {
  return validateWorkout(workout).length === 0;
}

/** 把 Workout 归一化为可保存形态（空白标题/备注转 undefined，路径排序固定） */
export function normalizeWorkout(workout: Workout): Workout {
  return {
    dslVersion: workout.dslVersion,
    title: stripOptional(workout.title),
    goal: String(workout.goal ?? "").trim(),
    note: stripOptional(workout.note),
    phases: WORKOUT_PHASE_ORDER.flatMap((role): WorkoutPhase[] => {
      const phase = workout.phases?.find((item) => item.role === role);
      return phase ? [{ role, segments: phase.segments }] : [];
    }),
  };
}

/** 主训练阶段（一定存在）；不存在时返回 undefined（未通过校验的草稿） */
export function mainPhase(workout: Workout): WorkoutPhase | undefined {
  return workout.phases?.find((phase) => phase.role === "main");
}

/** 循环嵌套深度校验（供结构编辑使用） */
export function repeatDepth(segment: WorkoutSegment): number {
  if (segment.kind !== "repeat") return 0;
  const inner = segment.segments.reduce((max, child) => Math.max(max, repeatDepth(child)), 0);
  return inner + 1;
}

/** 判断循环是否为空 */
export function isEmptyRepeat(segment: RepeatBlock): boolean {
  return segment.segments.length === 0;
}
