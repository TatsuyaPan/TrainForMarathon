/**
 * 结构编辑：全部是纯函数，接收 Workout 返回新的 Workout。
 *
 * 路径约定：`path[0]` 是阶段下标，其余元素是分部下标；例如 `[1, 0, 1]`
 * 表示第 2 个阶段（MS）里的第 1 个循环的第 2 个子分部。
 * 交互层只描述“改哪里”，不直接散落数组下标操作。
 */
import type {
  RecoveryStep,
  RepeatBlock,
  RestStep,
  RunStep,
  Workout,
  WorkoutPhaseRole,
  WorkoutSegment,
} from "../domain.js";
import { deepClone } from "../clone.js";
import { CURRENT_WORKOUT_DSL_VERSION } from "./registry.js";
import { MAX_REPEAT_DEPTH } from "./workout.js";

export type SegmentPath = readonly number[];

export type SegmentKind = "run" | "recovery" | "rest" | "repeat";

function cloneWorkout(workout: Workout): Workout {
  return deepClone(workout);
}

/** 阶段下标；不存在返回 -1 */
export function phaseIndex(workout: Workout, role: WorkoutPhaseRole): number {
  return workout.phases.findIndex((phase) => phase.role === role);
}

/** 取分部所处的容器（会就地修改传入的 draft，仅在内部使用） */
function containerFor(workout: Workout, parentPath: SegmentPath): WorkoutSegment[] {
  if (parentPath.length === 0) throw new Error("父路径不能为空");
  const phase = workout.phases[parentPath[0]];
  if (!phase) throw new Error(`阶段不存在：${parentPath[0]}`);
  let segments = phase.segments;
  for (let index = 1; index < parentPath.length; index += 1) {
    const node = segments[parentPath[index]];
    if (!node || node.kind !== "repeat") throw new Error(`路径无效：${parentPath.slice(1, index + 1).join(".")} 不是循环`);
    segments = node.segments;
  }
  return segments;
}

/** 读取路径上的分部 */
export function segmentAt(workout: Workout, path: SegmentPath): WorkoutSegment | undefined {
  if (path.length < 2) return undefined;
  try {
    const segments = containerFor(workout, path.slice(0, -1));
    return segments[path[path.length - 1]];
  } catch {
    return undefined;
  }
}

/** 父容器路径（去掉最后一段） */
export function parentPathOf(path: SegmentPath): number[] {
  return path.slice(0, -1);
}

/** 在指定容器内插入分部 */
export function insertSegment(
  workout: Workout,
  parentPath: SegmentPath,
  index: number,
  segment: WorkoutSegment,
): Workout {
  const draft = cloneWorkout(workout);
  const segments = containerFor(draft, parentPath);
  assertRepeatDepth(parentPath, segment);
  const target = Math.max(0, Math.min(index, segments.length));
  segments.splice(target, 0, deepClone(segment));
  return draft;
}

/** 替换指定路径的分部 */
export function replaceSegment(workout: Workout, path: SegmentPath, segment: WorkoutSegment): Workout {
  const draft = cloneWorkout(workout);
  const segments = containerFor(draft, path.slice(0, -1));
  assertRepeatDepth(path.slice(0, -1), segment);
  const index = path[path.length - 1];
  if (!segments[index]) throw new Error("路径无效：分部不存在");
  segments[index] = deepClone(segment);
  return draft;
}

/** 用更新函数改写指定路径的分部 */
export function updateSegment(
  workout: Workout,
  path: SegmentPath,
  updater: (segment: WorkoutSegment) => WorkoutSegment,
): Workout {
  const current = segmentAt(workout, path);
  if (!current) throw new Error("路径无效：分部不存在");
  return replaceSegment(workout, path, updater(current));
}

/** 删除指定路径的分部（阶段允许变空，由校验负责报错） */
export function removeSegment(workout: Workout, path: SegmentPath): Workout {
  const draft = cloneWorkout(workout);
  const segments = containerFor(draft, path.slice(0, -1));
  const index = path[path.length - 1];
  if (!segments[index]) throw new Error("路径无效：分部不存在");
  segments.splice(index, 1);
  return draft;
}

/** 深拷贝指定分部并插入其后 */
export function duplicateSegment(workout: Workout, path: SegmentPath): Workout {
  const current = segmentAt(workout, path);
  if (!current) throw new Error("路径无效：分部不存在");
  return insertSegment(workout, path.slice(0, -1), path[path.length - 1] + 1, current);
}

/** 同一父容器内上移/下移 */
export function moveSegment(workout: Workout, path: SegmentPath, delta: number): Workout {
  const parent = path.slice(0, -1);
  const index = path[path.length - 1];
  return moveSegmentTo(workout, path, parent, index + delta);
}

/** 是否为祖先-后代关系（用于阻止把循环移动到自身内部） */
export function isDescendantPath(ancestor: SegmentPath, candidate: SegmentPath): boolean {
  if (candidate.length <= ancestor.length) return false;
  return ancestor.every((value, index) => candidate[index] === value);
}

/** 该路径所在位置的循环嵌套深度（不在循环内为 0） */
export function repeatDepthAtPath(workout: Workout, path: SegmentPath): number {
  let depth = 0;
  for (let index = 1; index < path.length - 1; index += 1) {
    const node = segmentAt(workout, path.slice(0, index + 1));
    if (node?.kind === "repeat") depth += 1;
  }
  return depth;
}

function maxRepeatDepth(segments: readonly WorkoutSegment[], depth = 1): number {
  let max = 0;
  for (const segment of segments) {
    if (segment.kind === "repeat") {
      max = Math.max(max, depth, maxRepeatDepth(segment.segments, depth + 1));
    }
  }
  return max;
}

/**
 * 校验「把 segment 放进 parentPath 容器」后不会超过嵌套上限。
 *
 * 插入单个步骤与复制整棵子树共用这一把尺子：容器深度（阶段为 0）加上子树自身深度。
 * 越界时抛错，由界面把原因显示给用户，不产生非法草稿。
 */
function assertRepeatDepth(parentPath: SegmentPath, segment: WorkoutSegment): void {
  if (segment.kind !== "repeat") return;
  const containerDepth = Math.max(0, parentPath.length - 1);
  if (maxRepeatDepth([segment], containerDepth + 1) > MAX_REPEAT_DEPTH) {
    throw new Error(`循环嵌套不能超过 ${MAX_REPEAT_DEPTH} 层`);
  }
}

function workoutRepeatDepth(workout: Workout): number {
  return workout.phases.reduce((max, phase) => Math.max(max, maxRepeatDepth(phase.segments)), 0);
}

/** 判断移动是否合法（不进入自身后代、不超嵌套深度） */
export function canMoveSegmentTo(
  workout: Workout,
  path: SegmentPath,
  targetParentPath: SegmentPath,
): boolean {
  if (isDescendantPath(path, targetParentPath)) return false;
  try {
    const moved = moveSegmentTo(workout, path, targetParentPath, 0, { force: true });
    return workoutRepeatDepth(moved) <= MAX_REPEAT_DEPTH;
  } catch {
    return false;
  }
}

/**
 * 移动分部到指定容器与位置（可跨阶段、跨循环）。
 * `targetIndex` 是移动完成后的目标下标（0 基），同父容器移动时不需要额外换算。
 */
export function moveSegmentTo(
  workout: Workout,
  path: SegmentPath,
  targetParentPath: SegmentPath,
  targetIndex: number,
  options: { force?: boolean } = {},
): Workout {
  if (isDescendantPath(path, targetParentPath)) {
    throw new Error("不能把循环移动到它自己的内部");
  }
  const sourceParent = path.slice(0, -1);
  const sourceIndex = path[path.length - 1];
  const draft = cloneWorkout(workout);
  const source = containerFor(draft, sourceParent);
  if (!source[sourceIndex]) throw new Error("路径无效：分部不存在");
  const [moved] = source.splice(sourceIndex, 1);
  const target = containerFor(draft, targetParentPath);
  target.splice(Math.max(0, Math.min(targetIndex, target.length)), 0, moved);
  if (!options.force && workoutRepeatDepth(draft) > MAX_REPEAT_DEPTH) {
    throw new Error(`循环嵌套不能超过 ${MAX_REPEAT_DEPTH} 层`);
  }
  return draft;
}

/** 新增阶段（按固定顺序插入） */
export function addPhase(workout: Workout, role: WorkoutPhaseRole): Workout {
  if (workout.phases.some((phase) => phase.role === role)) return workout;
  const draft = cloneWorkout(workout);
  const order: readonly WorkoutPhaseRole[] = ["warmup", "main", "cooldown"];
  const at = order.indexOf(role);
  const insertAt = draft.phases.findIndex((phase) => order.indexOf(phase.role) > at);
  const phase = { role, segments: [createDefaultSegment("run", role)] };
  if (insertAt === -1) draft.phases.push(phase);
  else draft.phases.splice(insertAt, 0, phase);
  return draft;
}

/** 删除阶段（主训练阶段不允许删除） */
export function removePhase(workout: Workout, role: WorkoutPhaseRole): Workout {
  if (role === "main") return workout;
  const draft = cloneWorkout(workout);
  draft.phases = draft.phases.filter((phase) => phase.role !== role);
  return draft;
}

/** 替换整个阶段的分部序列 */
export function setPhaseSegments(workout: Workout, role: WorkoutPhaseRole, segments: WorkoutSegment[]): Workout {
  const draft = cloneWorkout(workout);
  const phase = draft.phases.find((item) => item.role === role);
  if (!phase) throw new Error(`阶段不存在：${role}`);
  phase.segments = deepClone(segments);
  return draft;
}

export function createRunStep(
  role: WorkoutPhaseRole,
  overrides: Partial<Omit<RunStep, "kind">> = {},
): RunStep {
  const base: RunStep =
    role === "main"
      ? { kind: "run", load: { type: "time", seconds: 300 }, target: { type: "daniels", zone: "T" } }
      : { kind: "run", load: { type: "time", seconds: 600 }, target: { type: "daniels", zone: "E" } };
  return { ...base, ...overrides };
}

export function createRecoveryStep(overrides: Partial<Omit<RecoveryStep, "kind">> = {}): RecoveryStep {
  return { kind: "recovery", load: { type: "time", seconds: 90 }, ...overrides };
}

export function createRestStep(overrides: Partial<Omit<RestStep, "kind">> = {}): RestStep {
  return { kind: "rest", durationSeconds: 120, ...overrides };
}

/** 默认循环：3 ×（5 分钟 T + 90 秒恢复） */
export function createRepeatBlock(overrides: Partial<Omit<RepeatBlock, "kind">> = {}): RepeatBlock {
  return {
    kind: "repeat",
    repetitions: 3,
    segments: [createRunStep("main"), createRecoveryStep()],
    ...overrides,
  };
}

/** 按用户可选的三种步骤类型创建默认分部（热身/冷身由阶段位置决定） */
export function createDefaultSegment(kind: SegmentKind, role: WorkoutPhaseRole = "main"): WorkoutSegment {
  switch (kind) {
    case "recovery":
      return createRecoveryStep();
    case "rest":
      return createRestStep();
    case "repeat":
      return createRepeatBlock();
    default:
      return createRunStep(role);
  }
}

/** 新建课程草稿：MS + 一个 30 分钟 E 跑步步骤，标题与训练目的为空 */
export function createDefaultWorkout(): Workout {
  return {
    dslVersion: CURRENT_WORKOUT_DSL_VERSION,
    goal: "",
    phases: [
      {
        role: "main",
        segments: [{ kind: "run", load: { type: "time", seconds: 1800 }, target: { type: "daniels", zone: "E" } }],
      },
    ],
  };
}
