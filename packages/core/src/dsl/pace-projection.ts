/**
 * 配速写法：把强度档位换算成明确配速的**派生导出**。
 *
 * 同一份课表有两种写法，都落在当前冻结版本（v1）的语法之内：
 *
 * ```text
 * MS:6x(8min@T+90s@jog)                 # 档位写法（规范往返口径）
 * MS:6x(8min@P3:45-4:00/km+90s@jog)    # 配速写法（按当前能力换算）
 * ```
 *
 * 这条投影是**单向**的：
 *
 * - 档位 → 配速：`@T` 在不同能力下是不同的配速，必须换算给跑者看；
 * - 配速 → 档位：不做。`@P4:45-5:00/km` 本来就是「明确配速」，反推会凭空发明训练意图，
 *   所以只有含档位的课表才提供配速写法，明确配速保持原样。
 *
 * 因此配速写法**不是**规范往返口径：它导入回来是明确配速（`pace-range`），不是原来的档位。
 * 想要「带档位注记的配速写法」属于语法扩展，必须先改冻结规范，再新增版本目录。
 *
 * 投影只做深拷贝与目标替换，不修改入参。
 */
import type { DanielsZone, TrainingTarget, Workout, WorkoutPhase, WorkoutSegment } from "../domain.js";
import type { TrainingPaces } from "../pace.js";
import { workoutZones } from "./workout.js";

/** 与冻结规范 v1 §数值约束一致的自定义配速边界（秒/公里） */
const MIN_PACE_SECONDS_PER_KM = 90;
const MAX_PACE_SECONDS_PER_KM = 900;

export interface PaceRangeTarget {
  type: "pace-range";
  fastSecondsPerKm: number;
  slowSecondsPerKm: number;
}

/**
 * 档位 → 明确配速目标。
 *
 * ST 没有配速档位（跨步跑按全力短距离进行），缺少能力或换算结果不满足
 * 90–900 秒/公里、快端小于慢端时返回 `undefined`：调用方保持档位写法，不伪造配速。
 */
export function paceTargetForZone(
  zone: DanielsZone,
  paces?: TrainingPaces | null,
): PaceRangeTarget | undefined {
  if (!paces || zone === "ST") return undefined;
  const range = paces[zone];
  if (!range) return undefined;
  const fast = Math.round(Number(range.fast));
  const slow = Math.round(Number(range.slow));
  if (!Number.isFinite(fast) || !Number.isFinite(slow)) return undefined;
  if (fast < MIN_PACE_SECONDS_PER_KM || slow > MAX_PACE_SECONDS_PER_KM || fast >= slow) return undefined;
  return { type: "pace-range", fastSecondsPerKm: fast, slowSecondsPerKm: slow };
}

/** 课表里是否含强度档位（E/M/T/I/R/ST）：只有含档位的课表才有两种写法 */
export function workoutHasIntensity(workout: Workout): boolean {
  return workoutZones(workout).length > 0;
}

function walk(segments: readonly WorkoutSegment[], visit: (target: TrainingTarget) => void): void {
  for (const segment of segments) {
    if (segment.kind === "repeat") walk(segment.segments, visit);
    else if (segment.kind === "run") visit(segment.target);
  }
}

/** 课表里是否含明确配速（`@P4:45-5:00/km`）步骤：这类步骤在任何写法下都保持明确配速 */
export function workoutHasExplicitPace(workout: Workout): boolean {
  let found = false;
  for (const phase of workout.phases) {
    walk(phase.segments, (target) => {
      if (target.type === "pace-range") found = true;
    });
  }
  return found;
}

function projectSegment(segment: WorkoutSegment, paces?: TrainingPaces | null): WorkoutSegment {
  switch (segment.kind) {
    case "run": {
      if (segment.target.type !== "daniels") return { ...segment };
      const paceTarget = paceTargetForZone(segment.target.zone, paces);
      return paceTarget ? { ...segment, target: paceTarget } : { ...segment };
    }
    case "repeat":
      return { ...segment, segments: segment.segments.map((child) => projectSegment(child, paces)) };
    default:
      return { ...segment };
  }
}

/**
 * 把课表投影成配速写法：档位目标换成明确配速，其他目标保持原样，循环递归处理。
 * 结果与原课表结构相同（含 `dslVersion`），可以交给该版本的序列化器。
 */
export function projectWorkoutToPace(workout: Workout, paces?: TrainingPaces | null): Workout {
  const phases: WorkoutPhase[] = workout.phases.map((phase) => ({
    ...phase,
    segments: phase.segments.map((segment) => projectSegment(segment, paces)),
  }));
  return { ...workout, phases };
}
