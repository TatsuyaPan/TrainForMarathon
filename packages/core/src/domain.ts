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
 * —— 训练内容模型（Workout）——
 * 线性流程：课表 → segments[]（分部序列）。
 * 分部 = Step（最小单元，强度+负荷+休息）或 Set（组，重复 N 次的一组分部）。
 * 组内可再嵌套分部（递归），与 TrainingPeaks / Garmin 结构化训练一致。
 */

/** 强度：配速档 / 显式自定义配速区间 / 心率区间 / 自定义描述 */
export type IntensitySpec =
  | { type: "pace"; zone: "E" | "M" | "T" | "I" | "R" | "ST" }
  | {
      /** 用户显式指定的配速区间（秒/公里），如 285-300 ≈ 4:45–5:00/km */
      type: "paceRange";
      fastSecondsPerKm: number;
      slowSecondsPerKm: number;
      label?: string;
    }
  | { type: "heartRate"; minPercent?: number; maxPercent?: number; label?: string }
  | { type: "custom"; label: string };

/** 负荷：时间或距离 */
export type LoadSpec =
  | { type: "distance"; meters: number }
  | { type: "time"; minutes: number };

/** 休息：时间 / 距离 / 慢跑（mode 标记恢复方式，DSL 中 @jg 为慢跑） */
export type RestSpec =
  | { type: "time"; minutes: number; mode?: "rest" | "jog" | "walk" }
  | { type: "distance"; meters: number; mode?: "rest" | "jog" | "walk" }
  | { type: "jog"; note?: string };

/** 最小训练单元 */
export interface WorkoutStep {
  kind: "step";
  intensity: IntensitySpec;
  load: LoadSpec;
  rest?: RestSpec;
  /** 训练阶段：热身 / 主课 / 冷身（DSL @warmup/@cooldown） */
  phase?: "warmup" | "work" | "cooldown";
  /** 自感用力度 1-10（DSL @rpeN） */
  rpe?: number;
  /** 坡度百分比，跑步机等（DSL @incN） */
  inclinePercent?: number;
  note?: string;
}

/** 组：重复 N 次的一组分部（可嵌套） */
export interface WorkoutSet {
  kind: "set";
  repeats: number;
  segments: WorkoutSegment[];
  note?: string;
}

export type WorkoutSegment = WorkoutStep | WorkoutSet;

/** 一次训练的内容 */
export interface Workout {
  name?: string;
  /** 训练目的标签（DSL 头部 [xxx]，如"耐力·乳酸阈刺激"） */
  goal?: string;
  segments: WorkoutSegment[];
  /** 汇总（生成器填充，编辑后可重算） */
  totalDistanceKm?: number;
  totalDurationMinutes?: number;
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
