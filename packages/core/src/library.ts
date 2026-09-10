/**
 * 内置课表库：从书内「训练类型」各章可用课表表格提取，全部以 DSL 表达。
 * 按训练类型分类（T/I/R/M/混合/长距离/轻松），每条标注适用周跑量。
 * 推荐逻辑（暂占位）：提供该类第一条；未来可扩展为按周跑量/能力推荐。
 */
import type { Workout } from "./domain.js";
import { parseWorkoutDsl, validateWorkout } from "./workout-dsl.js";

export type LibraryType =
  | "T"      // 乳酸阈值跑
  | "I"      // 最大摄氧量跑
  | "R"      // 重复跑
  | "M"      // 马拉松配速跑
  | "E"      // 轻松跑/长距离
  | "mixed"; // 混合刺激

export interface LibraryEntry {
  id: string;
  type: LibraryType;
  name: string;
  /** 适用类型标签：本课表适用于这些训练类型（选择时按此匹配） */
  tags: LibraryType[];
  /** 适用周跑量建议（km），供分档提示 */
  weeklyKmHint?: string;
  source: string;
  dsl: string;
  workout: Workout;
}

function entry(
  id: string,
  type: LibraryType,
  name: string,
  dsl: string,
  source: string,
  tags?: LibraryType[],
  weeklyKmHint?: string,
): LibraryEntry {
  return {
    id,
    type,
    name,
    tags: tags ?? [type],
    weeklyKmHint,
    source,
    dsl,
    workout: parseWorkoutDsl(dsl),
  };
}

/** 内置课表库（全量，来源 = 书内表格） */
export const BUILTIN_LIBRARY: readonly LibraryEntry[] = [
  // ---- T 跑（《乳酸阈值跑》可用课表表格） ----
  entry("t-20min", "T", "20min@T 连续跑", "20min@T@rpe7", "《乳酸阈值跑》", ["T"], "周跑量较低 / 基础期"),
  entry("t-2k-x5", "T", "(2km@T+1.5min@jg)×5", "(2km@T+2min@jg)*5", "《乳酸阈值跑》", ["T"], "周跑量 160km 可加到 7-9 组"),
  entry("t-6min-x8", "T", "(5-6min@T+1min@jg)×8", "(6min@T@rpe8+1min@jg)*8", "《乳酸阈值跑》", ["T"], "周跑量 100-120km"),
  entry("t-8min-x6", "T", "(8min@T+1-1.5min@jg)×5-6", "(8min@T@rpe8+1.5min@jg)*6", "《乳酸阈值跑》", ["T"], "周跑量 ≥100km"),
  entry("t-combo-50", "T", "20min@T + 10min@T×2 + 5min@T×2", "20min@T@rpe8+4min@jg+(10min@T@rpe8+2min@jg)*2+(5min@T@rpe8+1min@jg)*2", "《乳酸阈值跑》", ["T"], "周跑量 ≥120km"),
  entry("t-combo-50b", "T", "20min@T + 15min@T + 10min@T + 5min@T", "20min@T@rpe8+4min@jg+15min@T@rpe8+2min@jg+10min@T@rpe8+2min@jg+5min@T@rpe8+1min@jg", "《乳酸阈值跑》", ["T"], "周跑量 ≥120km"),

  // ---- I 跑（《最大摄氧量跑》可用课表表格） ----
  entry("i-yasso-800", "I", "亚索 800：800m@I×10", "(800m@I+3min@jg)*10", "《最大摄氧量跑》", ["I"], "通用"),
  entry("i-1000-x8", "I", "(1000m@I+3min@jg)×6-8", "(1000m@I+3min@jg)*8", "《最大摄氧量跑》", ["I"], "通用"),
  entry("i-3min-x8", "I", "(3min@I+2min@jg)×7-10", "(3min@I@rpe9+2min@jg)*8", "《最大摄氧量跑》", ["I"], "非标准操场绕圈"),
  entry("i-pyramid", "I", "(3min×3)+(2min×4)+(1min×5) 递减", "(3min@I+2min@jg)*3+(2min@I+1min@jg)*4+(1min@I+30s@jg)*5", "《最大摄氧量跑》", ["I"], "周跑量 100km 左右"),
  entry("i-400-x20", "I", "(400m@I+1.5min@jg)×20", "(400m@I+1.5min@jg)*20", "《最大摄氧量跑》", ["I"], "通用"),

  // ---- R 跑（《重复跑》可用课表表格） ----
  entry("r-200-x20", "R", "(200m@R+200m@jg)×20", "(200m@R+200m@jg)*20", "《重复跑》", ["R"], "通用"),
  entry("r-400-x10", "R", "(400m@R+400m@jg)×10", "(400m@R+400m@jg)*10", "《重复跑》", ["R"], "通用"),
  entry("r-200-400-combo", "R", "200×4 + 400×8 + 200×4", "(200m@R+200m@jg)*4+(400m@R+400m@jg)*8+(200m@R+200m@jg)*4", "《重复跑》", ["R"], "周跑量 100km 左右"),
  entry("r-decreasing", "R", "600×4 + 400×4 + 200×4 递减", "(600m@R+600m@jg)*4+(400m@R+400m@jg)*4+(200m@R+200m@jg)*4", "《重复跑》", ["R"], "周跑量 100km 左右"),
  entry("r-800-hard", "R", "800×2 + 400×4 + 200×8", "(800m@R+800m@jg)*2+(400m@R+400m@jg)*4+(200m@R+200m@jg)*8", "《重复跑》", ["R"], "高难度"),

  // ---- M 跑（《马拉松配速跑》） ----
  entry("m-15km", "M", "15km@M", "15km@M@rpe7", "《马拉松配速跑》", ["M"], "控制距离"),
  entry("m-60min", "M", "60min@M", "60min@M@rpe7", "《马拉松配速跑》", ["M"], "控制时长"),

  // ---- E / L（《轻松跑》） ----
  entry("e-40min", "E", "40min@E 轻松跑", "40min@E", "《轻松跑》", ["E", "M"], "≥30min，按心率"),
  entry("l-120min", "E", "120min@E 长距离（LSD）", "120min@E", "《轻松跑》", ["E", "M"], "2-2.5h，不超周跑量 25%"),

  // ---- 混合刺激（《混合训练》可用课表表格） ----
  entry("mix-pyramid-54321", "mixed", "54321 倒金字塔（M+T+I）", "5km@M@rpe7+2.5min@jg+4km@T@rpe8+2.5min@jg+3km@T@rpe8+2.5min@jg+2km@I@rpe9+2.5min@jg+1km@I@rpe9", "《混合训练》", ["T", "I", "M"], "周跑量 100km 左右"),
  entry("mix-tm-short", "mixed", "TM 混合中短距离刺激", "5km@M+3min@jg+20min@T@rpe8+3min@jg+3km@M", "《混合训练》", ["T", "M"], "通用"),
  entry("mix-tme-long", "mixed", "TME 混合长距离刺激", "5km@E@warmup+(3km@M+1km@T+1km@M+1km@E)*3+5km@E@cooldown", "《混合训练》", ["T", "M", "E"], "通用"),
  entry("mix-t-only", "mixed", "T 配速法特莱克（12.8km T 容量）", "6.4km@E@warmup+4.8km@T+3min@E+3.2km@T+2min@E+3.2km@T+2min@E+1.6km@T+3.2km@E@cooldown", "《混合训练》", ["T", "E"], "周跑量 100km 左右"),
  entry("mix-tir", "mixed", "TIR 混合课表", "3.2km@E@warmup+(1.6km@T+1min@E)*3+(1000m@I+2min@E)*3+(400m@R+400m@jg)*3+3.2km@E@cooldown", "《混合训练》", ["T", "I", "R", "E"], "通用"),
  entry("mix-tr", "mixed", "TR 混合跑", "20min@T+4min@jg+10min@T+2min@jg+(400m@R+400m@jg)*5", "《混合训练》", ["T", "R"], "通用"),
];

export type LibraryTypeLabels = Record<LibraryType, string>;
export const LIBRARY_TYPE_LABELS: LibraryTypeLabels = {
  T: "乳酸阈值跑",
  I: "最大摄氧量跑",
  R: "重复跑",
  M: "马拉松配速跑",
  E: "轻松跑 / 长距离",
  mixed: "混合刺激",
};

/** 按训练类型筛选课表库（选择时匹配 tags） */
export function listLibraryByType(type: LibraryType | LibraryType[]): LibraryEntry[] {
  const wanted = Array.isArray(type) ? type : [type];
  return BUILTIN_LIBRARY.filter((entryItem) =>
    entryItem.tags.some((tag) => wanted.includes(tag)),
  );
}

/**
 * 推荐（占位算法）：返回该类第一条。
 * 未来扩展：按运动员能力（阈值配速/周跑量）与阶段（基础/提高/巅峰/减量）推荐最合适条目。
 */
export function recommendEntry(type: LibraryType): LibraryEntry | null {
  return BUILTIN_LIBRARY.find((entryItem) => entryItem.tags.includes(type)) ?? null;
}

/** 按 id 查课表库 */
export function getLibraryEntry(id: string): LibraryEntry | undefined {
  return BUILTIN_LIBRARY.find((entryItem) => entryItem.id === id);
}

export interface CreateLibraryEntryInput {
  id?: string;
  type: LibraryType;
  name: string;
  dsl: string;
  tags?: LibraryType[];
  weeklyKmHint?: string;
  source?: string;
}

/**
 * 创建自定义课程条目：校验 DSL 可解析、训练目的（goal）必填（课程也是训练，
 * 必须带有明确目的）。
 */
export function createLibraryEntry(input: CreateLibraryEntryInput): LibraryEntry {
  if (!input.name?.trim()) throw new Error("课程名称不能为空");
  const workout = parseWorkoutDsl(input.dsl);
  const errors = validateWorkout(workout);
  if (errors.length > 0) {
    throw new Error(`课程内容无效：${errors.join("；")}`);
  }
  return {
    id: input.id ?? `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    type: input.type,
    name: input.name.trim(),
    tags: input.tags && input.tags.length > 0 ? input.tags : [input.type],
    weeklyKmHint: input.weeklyKmHint,
    source: input.source ?? "自定义",
    dsl: input.dsl,
    workout,
  };
}
