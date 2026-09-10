/**
 * 训练会话生成器：按运动员档位（阈值配速/周跑量）为训练日生成明确内容（Workout）。
 *
 * 规则来源（可回溯书内章节）：
 * - T：总量 ≈ 周跑量 10%，≥30min；模式按周跑量分档（《乳酸阈值跑》）
 * - I：总量 ≈ 周跑量 8%（≤10km）；亚索 800 为通用模式（《最大摄氧量跑》）
 * - R：总量 ≈ 周跑量 5%；400m 重复为通用模式（《重复跑》）
 * - L：2-2.5h，≤ 周跑量 25%（《轻松跑》）
 * - M：≤ min(周跑量 20%, 29km)，≤110min（《马拉松配速跑》）
 * - E：单次 ≥30min（《轻松跑》）
 * - 混合日：每种强度 ≤ 该强度正常量的 1/类型数（《混合训练》）
 */
import type { TrainingTypeId, Workout, WorkoutSegment, WorkoutSet, WorkoutStep } from "../domain.js";
import { parseWorkoutDsl, workoutTotals } from "../workout-dsl.js";
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

function step(intensity: WorkoutStep["intensity"], load: WorkoutStep["load"], extra: Partial<WorkoutStep> = {}): WorkoutStep {
  return { kind: "step", intensity, load, ...extra };
}

function set(repeats: number, segments: WorkoutSegment[]): WorkoutSet {
  return { kind: "set", repeats, segments };
}

const jogRest = (minutes: number) => ({ type: "time" as const, minutes, mode: "jog" as const });
const jogRestDistance = (meters: number) => ({ type: "distance" as const, meters, mode: "jog" as const });

/** 单类型的基础课表（按周跑量分档） */
function baseWorkoutFor(type: TrainingTypeId, ctx: SessionContext): Workout {
  const volume = ctx.weekVolumeKm;
  const max = ctx.maxWeeklyKm;
  switch (type) {
    case "T": {
      if (volume < 9 || max < 80) {
        return { goal: "乳酸阈刺激", segments: [step({ type: "pace", zone: "T" }, { type: "time", minutes: 20 }, { rpe: 7 })] };
      }
      if (max < 110) {
        return {
          goal: "乳酸阈刺激",
          segments: [set(8, [step({ type: "pace", zone: "T" }, { type: "time", minutes: 6 }, { rpe: 8, rest: jogRest(1) })])],
        };
      }
      if (max < 140) {
        return {
          goal: "乳酸阈刺激",
          segments: [set(6, [step({ type: "pace", zone: "T" }, { type: "time", minutes: 8 }, { rpe: 8, rest: jogRest(1.5) })])],
        };
      }
      return {
        goal: "乳酸阈刺激（大容量）",
        segments: [
          step({ type: "pace", zone: "T" }, { type: "time", minutes: 20 }, { rpe: 8, rest: jogRest(4) }),
          set(2, [step({ type: "pace", zone: "T" }, { type: "time", minutes: 10 }, { rpe: 8, rest: jogRest(2) })]),
          set(2, [step({ type: "pace", zone: "T" }, { type: "time", minutes: 5 }, { rpe: 8, rest: jogRest(1) })]),
        ],
      };
    }
    case "I": {
      const iKm = Math.min(round1(volume * 0.08), 10);
      const reps = clampReps(iKm, 0.8);
      return {
        goal: "最大摄氧量刺激",
        segments: [
          set(reps, [step({ type: "pace", zone: "I" }, { type: "distance", meters: 800 }, { rpe: 9, rest: jogRest(3) })]),
        ],
      };
    }
    case "R": {
      const rKm = round1(volume * 0.05);
      const reps = clampReps(rKm, 0.4);
      return {
        goal: "速度与跑步效率",
        segments: [
          set(reps, [step({ type: "pace", zone: "R" }, { type: "distance", meters: 400 }, { rpe: 9, rest: jogRestDistance(400) })]),
        ],
      };
    }
    case "M": {
      const mKm = Math.min(round1(volume * 0.2), 29);
      return { goal: "马拉松配速适应", segments: [step({ type: "pace", zone: "M" }, { type: "distance", meters: mKm * 1000 }, { rpe: 7 })] };
    }
    case "E": {
      const minutes = volume <= 40 ? 30 : volume <= 80 ? 40 : 50;
      return { goal: "有氧基础", segments: [step({ type: "pace", zone: "E" }, { type: "time", minutes })] };
    }
    case "L": {
      return { goal: "长距离耐力", segments: [step({ type: "pace", zone: "E" }, { type: "time", minutes: 120 })] };
    }
    case "ST": {
      return {
        goal: "跑步效率",
        segments: [set(8, [step({ type: "pace", zone: "ST" }, { type: "distance", meters: 100 }, { rpe: 6, rest: jogRestDistance(100) })])],
      };
    }
    default:
      return { segments: [] };
  }
}

/** 混合日缩放：组数 ×factor（至少 1），无组的单步按负荷缩放 */
function scaleWorkout(workout: Workout, factor: number): Workout {
  if (factor >= 1) return workout;
  const scaleSegment = (segment: WorkoutSegment): WorkoutSegment => {
    if (segment.kind === "set") {
      return {
        ...segment,
        repeats: Math.max(1, Math.round(segment.repeats * factor)),
        segments: segment.segments.map(scaleSegment),
      };
    }
    const load =
      segment.load.type === "time"
        ? { type: "time" as const, minutes: round1(segment.load.minutes * factor) }
        : { type: "distance" as const, meters: Math.max(100, Math.round(segment.load.meters * factor)) };
    return { ...segment, load };
  };
  return { ...workout, segments: workout.segments.map(scaleSegment) };
}

/** 为训练日生成 Workout；typeCount 用于混合日拆分 */
export function sessionWorkout(
  type: TrainingTypeId,
  ctx: SessionContext,
  typeCount = 1,
): Workout {
  const factor = mixFactor(typeCount);
  return scaleWorkout(baseWorkoutFor(type, ctx), factor);
}

/** 组合日：多个类型各自的 Workout 合并为一个（segments 拼接，goal 合并） */
export function mergeWorkouts(workouts: readonly Workout[]): Workout {
  const goals = [...new Set(workouts.map((item) => item.goal).filter(Boolean))];
  const totals = workouts.reduce(
    (sum, item) => {
      const t = workoutTotals(item);
      return { distanceKm: sum.distanceKm + t.distanceKm, durationMinutes: sum.durationMinutes + t.durationMinutes };
    },
    { distanceKm: 0, durationMinutes: 0 },
  );
  return {
    goal: goals.join(" + "),
    segments: workouts.flatMap((item) => item.segments),
    totalDistanceKm: round1(totals.distanceKm),
    totalDurationMinutes: Math.round(totals.durationMinutes),
  };
}

/** 单类型日 Workout 并填充汇总 */
export function buildDayWorkout(
  types: readonly TrainingTypeId[],
  ctx: SessionContext,
): Workout | undefined {
  const workouts = types.map((type) => sessionWorkout(type, ctx, types.length));
  const merged = mergeWorkouts(workouts);
  return merged.segments.length > 0 ? merged : undefined;
}

export { mixFactor, clampReps };
