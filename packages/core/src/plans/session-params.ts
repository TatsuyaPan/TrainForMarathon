/**
 * 训练会话生成器：按运动员档位（阈值配速/周跑量）为训练日生成明确内容（Workout，DSL v1 AST）。
 *
 * 规则来源（可回溯书内章节）：
 * - T：总量 ≈ 周跑量 10%，≥30min；模式按周跑量分档（《乳酸阈跑》）
 * - I：总量 ≈ 周跑量 8%（≤10km）；亚索 800 为通用模式（《最大摄氧量跑》）
 * - R：总量 ≈ 周跑量 5%；400m 重复为通用模式（《重复跑》）
 * - L：2-2.5h，≤ 周跑量 25%（《轻松跑》）
 * - M：≤ min(周跑量 20%, 29km)，≤110min（《马拉松配速跑》）
 * - E：单次 ≥30min（《轻松跑》）
 * - 混合日：每种强度 ≤ 该强度正常量的 1/类型数（《混合训练》）
 *
 * 生成结果只包含主训练阶段（MS）：周跑量与强度容量按书内规则推算，
 * 热身与冷身由用户在训练日或课程编辑器中按需补充。
 */
import type {
  DanielsZone,
  Load,
  RecoveryStep,
  RepeatBlock,
  RunStep,
  TrainingTypeId,
  Workout,
  WorkoutPhase,
  WorkoutSegment,
} from "../domain.js";
import { CURRENT_WORKOUT_DSL_VERSION } from "../dsl/registry.js";
import { workoutTotals } from "../dsl/workout.js";
import type { TrainingPaces } from "../pace.js";

export interface SessionContext {
  paces: TrainingPaces;
  /** 当前周目标跑量（km，取保守值 min） */
  weekVolumeKm: number;
  maxWeeklyKm: number;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

/** 组合日强度缩放：2 种各 50%，3 种及以上各 1/3（文档：每种强度不超过正常量 1/3） */
function mixFactor(typeCount: number): number {
  if (typeCount <= 1) return 1;
  if (typeCount === 2) return 0.5;
  return 1 / typeCount;
}

/** 组数：按总量与单组距离，向下取整保证不超上限，至少 1 组 */
function clampReps(targetKm: number, perSetKm: number): number {
  return Math.max(1, Math.floor(targetKm / perSetKm));
}

function timeLoad(minutes: number): Load {
  return { type: "time", seconds: Math.max(1, Math.round(minutes * 60)) };
}

function distanceLoad(meters: number): Load {
  return { type: "distance", meters: Math.max(1, Math.round(meters)) };
}

function runStep(
  zone: DanielsZone,
  load: Load,
  extra: Partial<Omit<RunStep, "kind" | "load" | "target">> = {},
): RunStep {
  return { kind: "run", load, target: { type: "daniels", zone }, ...extra };
}

function recovery(minutes: number): RecoveryStep {
  return { kind: "recovery", load: timeLoad(minutes) };
}

function recoveryDistance(meters: number): RecoveryStep {
  return { kind: "recovery", load: distanceLoad(meters) };
}

function repeat(repetitions: number, segments: WorkoutSegment[]): RepeatBlock {
  return { kind: "repeat", repetitions: Math.max(1, repetitions), segments };
}

function mainWorkout(goal: string, segments: WorkoutSegment[]): Workout {
  return {
    dslVersion: CURRENT_WORKOUT_DSL_VERSION,
    goal,
    phases: [{ role: "main", segments }],
  };
}

/** 单类型的基础课表（按周跑量分档） */
function baseWorkoutFor(type: TrainingTypeId, ctx: SessionContext): Workout {
  const volume = ctx.weekVolumeKm;
  const max = ctx.maxWeeklyKm;
  switch (type) {
    case "T": {
      if (volume < 9 || max < 80) {
        return mainWorkout("乳酸阈能力", [runStep("T", timeLoad(20), { rpe: 7 })]);
      }
      if (max < 110) {
        return mainWorkout("乳酸阈能力", [
          repeat(8, [runStep("T", timeLoad(6), { rpe: 8 }), recovery(1)]),
        ]);
      }
      if (max < 140) {
        return mainWorkout("乳酸阈能力", [
          repeat(6, [runStep("T", timeLoad(8), { rpe: 8 }), recovery(1.5)]),
        ]);
      }
      return mainWorkout("乳酸阈能力（大容量）", [
        runStep("T", timeLoad(20), { rpe: 8 }),
        recovery(4),
        repeat(2, [runStep("T", timeLoad(10), { rpe: 8 }), recovery(2)]),
        repeat(2, [runStep("T", timeLoad(5), { rpe: 8 }), recovery(1)]),
      ]);
    }
    case "I": {
      const iKm = Math.min(round1(volume * 0.08), 10);
      const reps = clampReps(iKm, 0.8);
      return mainWorkout("最大摄氧量", [
        repeat(reps, [runStep("I", distanceLoad(800), { rpe: 9 }), recovery(3)]),
      ]);
    }
    case "R": {
      const rKm = round1(volume * 0.05);
      const reps = clampReps(rKm, 0.4);
      return mainWorkout("速度与跑步经济性", [
        repeat(reps, [runStep("R", distanceLoad(400), { rpe: 9 }), recoveryDistance(400)]),
      ]);
    }
    case "M": {
      const mKm = Math.min(round1(volume * 0.2), 29);
      return mainWorkout("马拉松配速适应", [runStep("M", distanceLoad(mKm * 1000), { rpe: 7 })]);
    }
    case "E": {
      const minutes = volume <= 40 ? 30 : volume <= 80 ? 40 : 50;
      return mainWorkout("有氧基础", [runStep("E", timeLoad(minutes))]);
    }
    case "L": {
      return mainWorkout("长距离耐力", [runStep("E", timeLoad(120))]);
    }
    case "ST": {
      return mainWorkout("神经激活与跑姿", [
        repeat(8, [runStep("ST", distanceLoad(100), { rpe: 6 }), recoveryDistance(100)]),
      ]);
    }
    default:
      return mainWorkout("", []);
  }
}

/** 混合日缩放：组数 ×factor（至少 1），无组的单步按负荷缩放 */
function scaleWorkout(workout: Workout, factor: number): Workout {
  if (factor >= 1) return workout;
  const scaleSegment = (segment: WorkoutSegment): WorkoutSegment => {
    if (segment.kind === "repeat") {
      return {
        ...segment,
        repetitions: Math.max(1, Math.round(segment.repetitions * factor)),
        segments: segment.segments.map(scaleSegment),
      };
    }
    if (segment.kind === "rest") {
      return { ...segment, durationSeconds: Math.max(30, Math.round(segment.durationSeconds * factor)) };
    }
    const load: Load =
      segment.load.type === "time"
        ? timeLoad((segment.load.seconds / 60) * factor)
        : distanceLoad(Math.max(100, segment.load.meters * factor));
    return { ...segment, load };
  };
  return {
    ...workout,
    phases: workout.phases.map((phase) => ({ role: phase.role, segments: phase.segments.map(scaleSegment) })),
  };
}

/** 为训练日生成 Workout；typeCount 用于混合日拆分 */
export function sessionWorkout(type: TrainingTypeId, ctx: SessionContext, typeCount = 1): Workout {
  const factor = mixFactor(typeCount);
  return scaleWorkout(baseWorkoutFor(type, ctx), factor);
}

/** 组合日：多个类型的 Workout 合并为一个（按阶段拼接段落，goal 合并） */
export function mergeWorkouts(workouts: readonly Workout[]): Workout {
  const goals = [...new Set(workouts.map((item) => item.goal.trim()).filter(Boolean))];
  const roles: WorkoutPhase["role"][] = ["warmup", "main", "cooldown"];
  const phases: WorkoutPhase[] = [];
  for (const role of roles) {
    const segments = workouts
      .flatMap((item) => item.phases.filter((phase) => phase.role === role))
      .flatMap((phase) => phase.segments);
    if (segments.length > 0) phases.push({ role, segments });
  }
  return {
    dslVersion: CURRENT_WORKOUT_DSL_VERSION,
    goal: goals.join(" + "),
    phases,
  };
}

/** 单类型日 Workout；没有任何分部时返回 undefined */
export function buildDayWorkout(types: readonly TrainingTypeId[], ctx: SessionContext): Workout | undefined {
  const workouts = types.map((type) => sessionWorkout(type, ctx, types.length));
  const merged = mergeWorkouts(workouts);
  const hasSegments = merged.phases.some((phase) => phase.segments.length > 0);
  return hasSegments ? merged : undefined;
}

/** 生成内容的已知总量（供计划实例填充 plannedDistanceKm/plannedDurationMinutes） */
export function workoutPlannedTotals(workout: Workout): { distanceKm: number; durationMinutes: number } {
  const totals = workoutTotals(workout);
  return {
    distanceKm: round1(totals.knownDistanceMeters / 1000),
    durationMinutes: Math.round(totals.knownDurationSeconds / 60),
  };
}

export { mixFactor, clampReps };
