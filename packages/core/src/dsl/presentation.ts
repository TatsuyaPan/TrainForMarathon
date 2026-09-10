/**
 * 课程展示数据：把 Workout AST 转换成课程库卡片、结构树与结构预览需要的只读数据。
 * 展示层只读取这里的结果，不自行拼装训练语义，也不把结果写回 DSL。
 */
import {
  DANIELS_ZONES,
  type DanielsZone,
  type Load,
  type RepeatBlock,
  type TrainingTarget,
  type Workout,
  type WorkoutPhaseRole,
  type WorkoutSegment,
} from "../domain.js";
import type { TrainingPaces } from "../pace.js";
import { formatPaceValue } from "../pace.js";
import {
  countRepeatBlocks,
  countSteps,
  estimateWorkoutTotals,
  workoutTotals,
  type WorkoutEstimate,
  type WorkoutTotals,
} from "./workout.js";

/** Daniels 强度配色：E 绿 → M 黄绿 → T 黄 → I 红 → R 紫 → ST 淡紫 */
export const INTENSITY_COLORS: Record<DanielsZone, string> = {
  E: "#3d9a5f",
  M: "#8fc93a",
  T: "#e3b93c",
  I: "#d9402f",
  R: "#8e44ad",
  ST: "#c9a7dc",
};

/** 强度展示顺序（由低到高） */
export const INTENSITY_ORDER: readonly DanielsZone[] = DANIELS_ZONES;

/** 主动恢复：浅蓝灰 */
export const RECOVERY_COLOR = "#b7c4cf";
/** 被动休息：灰色 */
export const REST_COLOR = "#c3cac5";
/** 非 Daniels 目标（配速区间/心率/RPE）：中性色 + 文字标签 */
export const NEUTRAL_TARGET_COLOR = "#8b93a1";

export const PHASE_TAGS: Record<WorkoutPhaseRole, "WU" | "MS" | "CD"> = {
  warmup: "WU",
  main: "MS",
  cooldown: "CD",
};

export const PHASE_LABELS: Record<WorkoutPhaseRole, string> = {
  warmup: "热身",
  main: "主训练",
  cooldown: "冷身",
};

export const RUN_ROLE_LABELS: Record<WorkoutPhaseRole, string> = {
  warmup: "热身跑步",
  main: "主训练跑步",
  cooldown: "冷身跑步",
};

export const ZONE_LABELS: Record<DanielsZone, string> = {
  E: "轻松跑",
  M: "马拉松配速",
  T: "乳酸阈配速",
  I: "最大摄氧量",
  R: "重复跑",
  ST: "短距离神经激活",
};

/** 表格化时长文本：90 秒 / 10 分钟 / 1 小时 5 分 */
export function formatDurationLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  if (seconds % 60 === 0 && seconds < 3600) return `${seconds / 60} 分钟`;
  if (seconds < 180) return `${seconds} 秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes === 0 ? `${hours} 小时` : `${hours} 小时 ${minutes} 分`;
}

/** 表格化距离文本：800 米 / 15 公里 / 1.5 公里 */
export function formatDistanceLabel(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} 米`;
  const km = Number((meters / 1000).toFixed(2));
  return `${km} 公里`;
}

export function formatLoadLabel(load: Load): string {
  return load.type === "time" ? formatDurationLabel(load.seconds) : formatDistanceLabel(load.meters);
}

/** 主目标的完整文字标签 */
export function formatTargetLabel(target: TrainingTarget): string {
  switch (target.type) {
    case "daniels":
      return `${ZONE_LABELS[target.zone]}（${target.zone}）`;
    case "pace-range":
      return `${formatPaceValue(target.fastSecondsPerKm)}–${formatPaceValue(target.slowSecondsPerKm)}/km`;
    case "heart-rate":
      return target.basis === "reserve"
        ? `储备心率 ${target.minPercent}–${target.maxPercent}%`
        : `最大心率 ${target.minPercent}–${target.maxPercent}%`;
    case "heart-rate-absolute":
      return `心率 ${target.minBpm}–${target.maxBpm} bpm`;
    case "rpe":
      return `体感 RPE ${target.value}`;
  }
}

/** 结构树中使用的短标签 */
export function formatTargetShortLabel(target: TrainingTarget): string {
  switch (target.type) {
    case "daniels":
      return target.zone;
    case "pace-range":
      return "配速区间";
    case "heart-rate":
      return "心率";
    case "heart-rate-absolute":
      return "心率";
    case "rpe":
      return `RPE${target.value}`;
  }
}

export function segmentColor(segment: WorkoutSegment): string {
  if (segment.kind === "rest") return REST_COLOR;
  if (segment.kind === "recovery") return RECOVERY_COLOR;
  if (segment.kind === "repeat") return NEUTRAL_TARGET_COLOR;
  return segment.target.type === "daniels" ? INTENSITY_COLORS[segment.target.zone] : NEUTRAL_TARGET_COLOR;
}

export interface PresentationStepNode {
  kind: "run" | "recovery" | "rest";
  id: string;
  path: number[];
  role: WorkoutPhaseRole;
  roleLabel: string;
  stepTypeLabel: string;
  loadLabel: string;
  targetLabel?: string;
  rpeLabel?: string;
  inclineLabel?: string;
  note?: string;
  color: string;
  weight: number;
  weightUnit: "seconds" | "meters";
}

export interface PresentationRepeatNode {
  kind: "repeat";
  id: string;
  path: number[];
  depth: number;
  repetitions: number;
  note?: string;
  summary: string;
  color: string;
  children: PresentationNode[];
}

export type PresentationNode = PresentationStepNode | PresentationRepeatNode;

export interface PresentationPhase {
  role: WorkoutPhaseRole;
  tag: "WU" | "MS" | "CD";
  label: string;
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  nodes: PresentationNode[];
}

export interface PreviewBlock {
  kind: "run" | "recovery" | "rest" | "compressed";
  role: WorkoutPhaseRole;
  color: string;
  label: string;
  unit: "seconds" | "meters" | "none";
  weight: number;
}

export interface WorkoutHeadline {
  distanceMeters: number;
  durationSeconds: number;
  workDistanceMeters: number;
  workDurationSeconds: number;
  recoveryDistanceMeters: number;
  recoveryDurationSeconds: number;
  restDurationSeconds: number;
  repeatCount: number;
  stepCount: number;
  distanceLabel?: string;
  durationLabel?: string;
  workLabel?: string;
  recoveryLabel?: string;
  restLabel?: string;
  mixedUnits: boolean;
}

export interface WorkoutPresentation {
  dslVersion: number;
  title: string;
  goal: string;
  note?: string;
  headline: WorkoutHeadline;
  totals: WorkoutTotals;
  estimate: WorkoutEstimate;
  phases: PresentationPhase[];
  preview: {
    blocks: PreviewBlock[];
    mixedUnits: boolean;
    compressed: boolean;
  };
}

/** 展示标题：标题优先，其次训练目的 */
export function workoutTitle(workout: Workout): string {
  const title = workout.title?.trim();
  if (title) return title;
  const goal = workout.goal?.trim();
  return goal ? goal : "新建课程";
}

export const MAX_PREVIEW_BLOCKS = 60;

function joinLoads(distanceMeters: number, durationSeconds: number): string {
  const parts: string[] = [];
  if (durationSeconds > 0) parts.push(formatDurationLabel(durationSeconds));
  if (distanceMeters > 0) parts.push(formatDistanceLabel(distanceMeters));
  return parts.join(" + ");
}

function shortSegmentLabel(segment: WorkoutSegment, role: WorkoutPhaseRole): string {
  if (segment.kind === "rest") return `${formatDurationLabel(segment.durationSeconds)}休息`;
  if (segment.kind === "recovery") return `${formatLoadLabel(segment.load)}恢复`;
  if (segment.kind === "repeat") return "嵌套循环";
  return `${formatLoadLabel(segment.load)} ${formatTargetShortLabel(segment.target)}`;
}

function phaseTotals(segments: readonly WorkoutSegment[]): { distanceMeters: number; durationSeconds: number } {
  let distanceMeters = 0;
  let durationSeconds = 0;
  const walk = (items: readonly WorkoutSegment[], times: number): void => {
    for (const segment of items) {
      if (segment.kind === "repeat") {
        walk(segment.segments, times * segment.repetitions);
        continue;
      }
      if (segment.kind === "rest") durationSeconds += segment.durationSeconds * times;
      else if (segment.load.type === "distance") distanceMeters += segment.load.meters * times;
      else durationSeconds += segment.load.seconds * times;
    }
  };
  walk(segments, 1);
  return { distanceMeters, durationSeconds };
}

function buildNodes(
  segments: readonly WorkoutSegment[],
  role: WorkoutPhaseRole,
  parentPath: number[],
  depth: number,
): PresentationNode[] {
  return segments.map((segment, index) => {
    const path = [...parentPath, index];
    const id = path.join(".");
    if (segment.kind === "repeat") {
      const children = buildNodes(segment.segments, role, path, depth + 1);
      const inner = segment.segments.map((child) => shortSegmentLabel(child, role)).join(" + ");
      return {
        kind: "repeat",
        id,
        path,
        depth,
        repetitions: segment.repetitions,
        note: segment.note,
        summary: `${segment.repetitions} × （${inner}）`,
        color: NEUTRAL_TARGET_COLOR,
        children,
      } satisfies PresentationRepeatNode;
    }
    const weight = segment.kind === "rest"
      ? { weight: segment.durationSeconds, weightUnit: "seconds" as const }
      : segment.load.type === "time"
        ? { weight: segment.load.seconds, weightUnit: "seconds" as const }
        : { weight: segment.load.meters, weightUnit: "meters" as const };
    const base = {
      id,
      path,
      role,
      roleLabel: PHASE_LABELS[role],
      color: segmentColor(segment),
      note: segment.note,
      ...weight,
    };
    if (segment.kind === "rest") {
      return {
        ...base,
        kind: "rest" as const,
        stepTypeLabel: "被动休息",
        loadLabel: formatDurationLabel(segment.durationSeconds),
      } satisfies PresentationStepNode;
    }
    if (segment.kind === "recovery") {
      return {
        ...base,
        kind: "recovery" as const,
        stepTypeLabel: "主动恢复",
        loadLabel: formatLoadLabel(segment.load),
      } satisfies PresentationStepNode;
    }
    return {
      ...base,
      kind: "run" as const,
      stepTypeLabel: RUN_ROLE_LABELS[role],
      loadLabel: formatLoadLabel(segment.load),
      targetLabel: formatTargetLabel(segment.target),
      rpeLabel: segment.rpe === undefined ? undefined : `RPE ${segment.rpe}`,
      inclineLabel: segment.inclinePercent === undefined ? undefined : `坡度 ${segment.inclinePercent}%`,
    } satisfies PresentationStepNode;
  });
}

function buildPreview(workout: Workout): WorkoutPresentation["preview"] {
  const blocks: PreviewBlock[] = [];
  let compressed = false;
  const stop = (): boolean => blocks.length >= MAX_PREVIEW_BLOCKS;

  const emit = (segment: WorkoutSegment, role: WorkoutPhaseRole): void => {
    if (stop()) {
      compressed = true;
      return;
    }
    if (segment.kind === "repeat") {
      for (let round = 0; round < segment.repetitions; round += 1) {
        for (const child of segment.segments) {
          emit(child, role);
          if (stop()) {
            compressed = true;
            return;
          }
        }
      }
      return;
    }
    if (segment.kind === "rest") {
      blocks.push({
        kind: "rest",
        role,
        color: REST_COLOR,
        label: `${formatDurationLabel(segment.durationSeconds)} 休息`,
        unit: "seconds",
        weight: segment.durationSeconds,
      });
      return;
    }
    if (segment.kind === "recovery") {
      blocks.push({
        kind: "recovery",
        role,
        color: RECOVERY_COLOR,
        label: `${formatLoadLabel(segment.load)} 恢复`,
        unit: segment.load.type === "time" ? "seconds" : "meters",
        weight: segment.load.type === "time" ? segment.load.seconds : segment.load.meters,
      });
      return;
    }
    blocks.push({
      kind: "run",
      role,
      color: segmentColor(segment),
      label: `${formatLoadLabel(segment.load)} ${formatTargetShortLabel(segment.target)}`,
      unit: segment.load.type === "time" ? "seconds" : "meters",
      weight: segment.load.type === "time" ? segment.load.seconds : segment.load.meters,
    });
  };

  for (const phase of workout.phases) {
    for (const segment of phase.segments) emit(segment, phase.role);
  }

  const units = new Set(blocks.map((block) => block.unit));
  const mixedUnits = units.size > 1;
  if (mixedUnits) {
    for (const block of blocks) block.weight = 1;
  } else {
    const total = blocks.reduce((sum, block) => sum + block.weight, 0);
    for (const block of blocks) block.weight = total > 0 ? block.weight / total : 1;
  }
  if (compressed) {
    blocks.push({
      kind: "compressed",
      role: "main",
      color: NEUTRAL_TARGET_COLOR,
      label: "…",
      unit: "none",
      weight: mixedUnits ? 1 : 0.5,
    });
  }

  return { blocks, mixedUnits, compressed };
}

function buildHeadline(workout: Workout, totals: WorkoutTotals): WorkoutHeadline {
  const mixedUnits = totals.knownDistanceMeters > 0 && totals.knownDurationSeconds > 0;
  const work: string[] = [];
  if (totals.workDurationSeconds > 0) work.push(formatDurationLabel(totals.workDurationSeconds));
  if (totals.workDistanceMeters > 0) work.push(formatDistanceLabel(totals.workDistanceMeters));
  const recovery: string[] = [];
  if (totals.recoveryDurationSeconds > 0) recovery.push(formatDurationLabel(totals.recoveryDurationSeconds));
  if (totals.recoveryDistanceMeters > 0) recovery.push(formatDistanceLabel(totals.recoveryDistanceMeters));
  return {
    distanceMeters: totals.knownDistanceMeters,
    durationSeconds: totals.knownDurationSeconds,
    workDistanceMeters: totals.workDistanceMeters,
    workDurationSeconds: totals.workDurationSeconds,
    recoveryDistanceMeters: totals.recoveryDistanceMeters,
    recoveryDurationSeconds: totals.recoveryDurationSeconds,
    restDurationSeconds: totals.restDurationSeconds,
    repeatCount: countRepeatBlocks(workout),
    stepCount: countSteps(workout),
    distanceLabel: totals.knownDistanceMeters > 0 ? formatDistanceLabel(totals.knownDistanceMeters) : undefined,
    durationLabel: totals.knownDurationSeconds > 0 ? formatDurationLabel(totals.knownDurationSeconds) : undefined,
    workLabel: work.length > 0 ? `${work.join(" + ")} 主训练` : undefined,
    recoveryLabel: recovery.length > 0 ? `${recovery.join(" + ")} 恢复` : undefined,
    restLabel: totals.restDurationSeconds > 0 ? `${formatDurationLabel(totals.restDurationSeconds)} 休息` : undefined,
    mixedUnits,
  };
}

export interface PresentationContext {
  /** 运动员配速，用于估算混合单位的完整距离/时间 */
  paces?: TrainingPaces;
}

/** 生成课程展示数据（课程卡片、结构树、结构预览、汇总共用） */
export function createWorkoutPresentation(
  workout: Workout,
  context: PresentationContext = {},
): WorkoutPresentation {
  const totals = workoutTotals(workout);
  const phases: PresentationPhase[] = workout.phases.map((phase, phaseIndex) => {
    const phaseTotal = phaseTotals(phase.segments);
    return {
      role: phase.role,
      tag: PHASE_TAGS[phase.role],
      label: PHASE_LABELS[phase.role],
      summary: joinLoads(phaseTotal.distanceMeters, phaseTotal.durationSeconds),
      distanceMeters: phaseTotal.distanceMeters,
      durationSeconds: phaseTotal.durationSeconds,
      nodes: buildNodes(phase.segments, phase.role, [phaseIndex], 1),
    };
  });
  return {
    dslVersion: workout.dslVersion,
    title: workoutTitle(workout),
    goal: workout.goal,
    note: workout.note,
    headline: buildHeadline(workout, totals),
    totals,
    estimate: estimateWorkoutTotals(workout, context.paces),
    phases,
    preview: buildPreview(workout),
  };
}

/** 重复次数文本（结构预览与卡片摘要共用） */
export function repeatLabel(repeat: RepeatBlock): string {
  return `重复 ${repeat.repetitions} 次`;
}
