import { describe, expect, it } from "vitest";
import {
  INTENSITY_COLORS,
  intensityBarStyle,
  trainingDayMark,
  workoutIntensities,
} from "../src/training-visuals.js";
import { parseWorkoutDsl } from "../src/dsl/registry.js";
import type { PlanInstanceDay, TrainingTypeId } from "../src/domain.js";

/** 只关心训练类型的最小课表日：记号规则不依赖日期与生成器 */
function dayWith(...types: TrainingTypeId[]): PlanInstanceDay {
  return {
    id: "day-1",
    date: "2026-09-10",
    label: "测试日",
    items: types.map((type) => ({ type })),
  } as PlanInstanceDay;
}

describe("训练强度可视化", () => {
  it("色阶：E 绿 → M 黄绿 → T 黄 → I 红 → R 紫 → ST 淡紫", () => {
    const channel = (hex: string, from: number, to: number) => parseInt(hex.slice(from, to), 16);
    const isGreenish = (hex: string) => channel(hex, 3, 5) > channel(hex, 1, 3);
    const isReddish = (hex: string) => channel(hex, 1, 3) > channel(hex, 3, 5);
    const isPurple = (hex: string) =>
      channel(hex, 1, 3) > channel(hex, 3, 5) && channel(hex, 5, 7) > channel(hex, 3, 5);
    expect(isGreenish(INTENSITY_COLORS.E)).toBe(true);
    expect(isReddish(INTENSITY_COLORS.I)).toBe(true);
    expect(isPurple(INTENSITY_COLORS.R)).toBe(true);
    expect(isPurple(INTENSITY_COLORS.ST)).toBe(true);
    expect(channel(INTENSITY_COLORS.ST, 3, 5)).toBeGreaterThan(channel(INTENSITY_COLORS.R, 3, 5));
  });

  it("提取强度序列（含循环与嵌套）", () => {
    expect(workoutIntensities(parseWorkoutDsl("GOAL:x\nMS:10x(800m@I+3min@jog)"))).toEqual(["I"]);
    expect(
      workoutIntensities(parseWorkoutDsl("GOAL:x\nMS:4x(6min@T+1min@jog)+6x(400m@R+400m@jog)")),
    ).toEqual(["T", "R"]);
    expect(workoutIntensities(parseWorkoutDsl("GOAL:x\nMS:2x(5min@M+3x(400m@R+400m@jog))"))).toEqual(["M", "R"]);
    expect(workoutIntensities(parseWorkoutDsl("GOAL:x\nMS:45min@HR65-78%max"))).toEqual([]);
  });

  it("色带：单色为纯色，多强度为比例渐变，无内容为休息色", () => {
    const single = parseWorkoutDsl("GOAL:x\nMS:8min@T");
    expect(intensityBarStyle(single)).toBe(`background: ${INTENSITY_COLORS.T};`);

    const mixed = parseWorkoutDsl("GOAL:x\nWU:10min@E\nMS:4x(6min@T+1min@jog)\nCD:10min@E");
    const style = intensityBarStyle(mixed);
    expect(style).toContain("linear-gradient");
    expect(style).toContain(INTENSITY_COLORS.T);
    expect(style).toContain(INTENSITY_COLORS.E);

    expect(intensityBarStyle(undefined)).toContain("#c3cac5");
  });

  it("训练日记号：比赛、休息、轻松跑与多类型合并", () => {
    expect(trainingDayMark(dayWith("RACE", "E"))).toBe("赛");
    expect(trainingDayMark(dayWith("REST", "REST"))).toBe("休");
    // 只有轻松跑（含休息）时不虚报强度
    expect(trainingDayMark(dayWith("E", "REST"))).toBe("E");
    expect(trainingDayMark(dayWith("M", "E"))).toBe("M");
    // 多类型按课表顺序合并，去重后拼接
    expect(trainingDayMark(dayWith("T", "E", "R"))).toBe("T+R");
    expect(trainingDayMark(dayWith("T", "E", "T"))).toBe("T");
  });
});
