export const TRAINING_TYPE_IDS = [
  "E",
  "M",
  "T",
  "I",
  "R",
  "L",
  "ST",
  "REST",
  "RACE",
  "TEST",
] as const;

export type TrainingTypeId = (typeof TRAINING_TYPE_IDS)[number];

export interface TrainingItem {
  type: TrainingTypeId;
  repetitions?: number;
  repetitionRange?: VolumeRange;
  note?: string;
  /** 实例化时按运动员档位生成的明确训练参数（配速/距离/时间） */
  paceLabel?: string;
  setDistanceMeters?: number;
  setDurationMinutes?: number;
  restRatio?: string;
  totalDistanceKm?: number;
  totalDurationMinutes?: number;
}

export interface PlanDay {
  dayIndex: number;
  label: string;
  items: TrainingItem[];
  alternatives?: TrainingItem[][];
  note?: string;
  /** 结构化训练内容（Workout）：明确配速/距离/时间/心率，可嵌套，支持自定义编辑 */
  workout?: Workout;
}

/**
 * —— 训练内容模型（Workout，DSL v1）——
 * 完整规范见 spec/dsl/v1/workout-dsl-v1.md（冻结文本，实现依据）。
 *
 * 结构：Workout → phases[]（warmup → main → cooldown）→ segments[]（可递归循环）。
 * 用户可见的五种步骤：热身 / 主训练 / 恢复 / 休息 / 冷身；
 * 其中恢复与休息是一等分部，可独立排序、复制、删除并参与循环与汇总。
 */

/** Daniels 强度档位；ST 为本项目扩展的短距离神经激活/跨步跑 */
export const DANIELS_ZONES = ["E", "M", "T", "I", "R", "ST"] as const;
export type DanielsZone = (typeof DANIELS_ZONES)[number];

/** 阶段角色；顺序固定为 warmup → main → cooldown */
export const WORKOUT_PHASE_ROLES = ["warmup", "main", "cooldown"] as const;
export type WorkoutPhaseRole = (typeof WORKOUT_PHASE_ROLES)[number];

/** 负荷：只保存整数秒或整数米，不保留原始单位 */
export type Load =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number };

/** 一个跑步步骤只能有一个主目标（DSL v1 不允许配速与心率同时作为主目标） */
export type TrainingTarget =
  | { type: "daniels"; zone: DanielsZone }
  | { type: "pace-range"; fastSecondsPerKm: number; slowSecondsPerKm: number }
  | { type: "heart-rate"; basis: "max" | "reserve"; minPercent: number; maxPercent: number }
  | { type: "heart-rate-absolute"; minBpm: number; maxBpm: number }
  | { type: "rpe"; value: number };

/** 跑步步骤：热身 / 主训练 / 冷身（由所在阶段决定用户角色） */
export interface RunStep {
  kind: "run";
  load: Load;
  target: TrainingTarget;
  /** 辅助体感提示 1-10（DSL @RPE n） */
  rpe?: number;
  /** 坡度百分比 0-20（DSL @inc n） */
  inclinePercent?: number;
  note?: string;
}

/** 主动恢复：慢跑恢复，可按时间或距离 */
export interface RecoveryStep {
  kind: "recovery";
  load: Load;
  note?: string;
}

/** 被动休息：只按时间，不产生距离 */
export interface RestStep {
  kind: "rest";
  durationSeconds: number;
  note?: string;
}

/** 循环：严格重复括号内的完整序列，可嵌套（最大深度 10） */
export interface RepeatBlock {
  kind: "repeat";
  repetitions: number;
  segments: WorkoutSegment[];
  note?: string;
}

export type WorkoutSegment = RunStep | RecoveryStep | RestStep | RepeatBlock;

export interface WorkoutPhase {
  role: WorkoutPhaseRole;
  segments: WorkoutSegment[];
}

/** 一次训练的内容（AST 是唯一事实来源；DSL 在展示或导出时即时序列化） */
export interface Workout {
  dslVersion: number;
  /** 可选课程标题；空白规范化为未设置 */
  title?: string;
  /** 必填训练目的（最高纲领） */
  goal: string;
  /** 可选课程备注；与步骤备注 @note(...) 不同层级 */
  note?: string;
  phases: WorkoutPhase[];
}

/**
 * —— 训练会话（TrainingSession）：一次具体训练的生命周期 ——
 * 计划创建 → 记录实际 → 结束。可未进行（skipped）或已进行（done，记录实际内容+日志）。
 * 一天内可存在多个训练（seq 递增；临时追加的训练同样以 session 表达）。
 */
export type SessionStatus = "planned" | "done" | "skipped";

export interface TrainingSession {
  /** `${planId}:${dayId}:${seq}` */
  id: string;
  planId: string;
  /** 关联计划日 id；临时追加训练也归属所在日 */
  dayId: string;
  /** 一天内的序号（0 起） */
  seq: number;
  /** 训练名称/说明 */
  label: string;
  /** 计划内容（生成器/课程库/编辑产生）；临时训练可为空 */
  plannedWorkout?: Workout;
  status: SessionStatus;
  /** 实际完成内容（可偏离计划） */
  actualWorkout?: Workout;
  actualDistanceKm?: number;
  actualDurationMinutes?: number;
  /** 自感用力度 1-10 */
  actualRpe?: number;
  /** 训练日志（自由文本） */
  log?: string;
  finishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface VolumeRange {
  min: number;
  max: number;
}

export interface PlanWeek {
  week: number;
  phase: string;
  volume: VolumeRange;
  days: PlanDay[];
  note?: string;
}

export interface PlanTemplate {
  id: string;
  name: string;
  schemaVersion: 1;
  weekCount: number;
  weeks: PlanWeek[];
}

export type ProgressStatus = "completed" | "partial" | "skipped";

export interface ProgressRecord {
  dayId: string;
  status: ProgressStatus;
  updatedAt: string;
  actualDistanceKm?: number;
  actualDurationMinutes?: number;
}

export interface PlanInstanceDay extends PlanDay {
  id: string;
  date: string;
  plannedDistanceKm?: number;
  plannedDurationMinutes?: number;
}

export interface PlanInstanceWeek extends Omit<PlanWeek, "days"> {
  targetKm: VolumeRange;
  days: PlanInstanceDay[];
}

export interface PlanInstance {
  templateId: string;
  templateVersion: number;
  raceDate: string;
  paces: import("./pace.js").TrainingPaces;
  weeks: PlanInstanceWeek[];
}
