/**
 * 训练强度可视化：强度档位 → 颜色。
 * 色阶趋势：E 绿 → M 黄绿 → T 黄 → I 红 → R 紫 → ST 淡紫（速度类强度更高）。
 */
import type { Workout, WorkoutSegment } from "./domain.js";

/** 强度档位 → 颜色 */
export const INTENSITY_COLORS: Record<string, string> = {
  E: "#3d9a5f", // 轻松跑：绿
  M: "#8fc93a", // 马拉松配速：黄绿
  T: "#e3b93c", // 阈值：黄
  I: "#d9402f", // 摄氧：红
  R: "#8e44ad", // 重复：紫
  ST: "#c9a7dc", // 跨步（速度）：淡紫
};

/** 强度展示顺序（按颜色强度从低到高） */
export const INTENSITY_ORDER: readonly string[] = ["E", "M", "T", "I", "R", "ST"];

/** 休息/无训练的颜色 */
export const REST_COLOR = "#c3cac5";

/**
 * 提取训练内容的强度序列（去重、按强度从低到高排序）。
 * 优先用 workout 的分段强度；无 workout 时回退 items 类型。
 */
export function workoutIntensities(workout?: Workout): string[] {
  const found = new Set<string>();
  if (workout) {
    collectSegmentIntensities(workout.segments, found);
  }
  return INTENSITY_ORDER.filter((zone) => found.has(zone));
}

function collectSegmentIntensities(segments: readonly WorkoutSegment[], found: Set<string>): void {
  for (const segment of segments) {
    if (segment.kind === "set") {
      collectSegmentIntensities(segment.segments, found);
    } else if (segment.intensity.type === "pace" && segment.intensity.zone in INTENSITY_COLORS) {
      found.add(segment.intensity.zone);
    }
  }
}

/** 训练内容的强度色带（混合 = 多色等分，绿色→红色序） */
export function intensityBarStyle(workout?: Workout): string {
  const zones = workoutIntensities(workout);
  if (zones.length === 0) return `background: ${REST_COLOR};`;
  if (zones.length === 1) return `background: ${INTENSITY_COLORS[zones[0]]};`;
  const segments = zones
    .map((zone) => `${INTENSITY_COLORS[zone]} ${100 / zones.length * (zones.indexOf(zone))}% ${100 / zones.length * (zones.indexOf(zone) + 1)}%`)
    .join(", ");
  return `background: linear-gradient(90deg, ${segments});`;
}
