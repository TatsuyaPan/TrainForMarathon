/**
 * 训练强度可视化（兼容入口）。
 *
 * 颜色的唯一来源是 `dsl/presentation.ts`（课程展示数据），这里只提供
 * 「强度序列」与「结构色带」两个便捷函数，供训练周/训练日等视图复用。
 */
import type { DanielsZone, Workout } from "./domain.js";
import {
  INTENSITY_COLORS,
  INTENSITY_ORDER,
  NEUTRAL_TARGET_COLOR,
  RECOVERY_COLOR,
  REST_COLOR,
  createWorkoutPresentation,
} from "./dsl/presentation.js";
import { workoutZones } from "./dsl/workout.js";

export { INTENSITY_COLORS, INTENSITY_ORDER, NEUTRAL_TARGET_COLOR, RECOVERY_COLOR, REST_COLOR };

/** 训练内容涉及的强度档位（去重、由低到高） */
export function workoutIntensities(workout?: Workout): DanielsZone[] {
  return workout ? workoutZones(workout) : [];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * 训练内容的强度色带（按结构预览的比例生成渐变）。
 * 单一颜色时返回纯色；无内容时返回休息色。
 */
export function intensityBarStyle(workout?: Workout): string {
  if (!workout || workout.phases.length === 0) return `background: ${REST_COLOR};`;
  const blocks = createWorkoutPresentation(workout).preview.blocks;
  if (blocks.length === 0) return `background: ${REST_COLOR};`;
  const colors = new Set(blocks.map((block) => block.color));
  if (colors.size === 1) return `background: ${blocks[0].color};`;
  const total = blocks.reduce((sum, block) => sum + block.weight, 0) || blocks.length;
  let cursor = 0;
  const stops = blocks.map((block) => {
    const start = (cursor / total) * 100;
    cursor += block.weight;
    const end = (cursor / total) * 100;
    return `${block.color} ${round(start)}% ${round(end)}%`;
  });
  return `background: linear-gradient(90deg, ${stops.join(", ")});`;
}
