import { describe, expect, it } from "vitest";
import { parseWorkoutDsl } from "../src/dsl/registry.js";
import { estimateWorkoutTotals } from "../src/dsl/workout.js";
import {
  MAX_PREVIEW_BLOCKS,
  RECOVERY_COLOR,
  REST_COLOR,
  createWorkoutPresentation,
  formatDurationLabel,
  formatDistanceLabel,
  formatTargetLabel,
  workoutTitle,
} from "../src/dsl/presentation.js";
import type { TrainingPaces } from "../src/pace.js";

const FULL = [
  "TITLE:T 跑 8min×6",
  "GOAL:乳酸阈能力",
  "NOTE:每组稳定完成",
  "WU:15min@E",
  "MS:6x(8min@T@RPE8+90s@jog)",
  "CD:10min@E",
].join("\n");

const PACES: TrainingPaces = {
  E: { fast: 190, slow: 210 },
  M: { fast: 220, slow: 230 },
  T: { fast: 225, slow: 240 },
  I: { fast: 210, slow: 225 },
  R: { fast: 195, slow: 210 },
};

describe("课程展示数据", () => {
  it("展示标题优先取 TITLE，缺失时退回训练目的", () => {
    const workout = parseWorkoutDsl(FULL);
    expect(workoutTitle(workout)).toBe("T 跑 8min×6");
    expect(workoutTitle({ ...workout, title: undefined })).toBe("乳酸阈能力");
    expect(workoutTitle({ ...workout, title: undefined, goal: "" })).toBe("新建课程");
  });

  it("阶段、汇总与递归结构", () => {
    const presentation = createWorkoutPresentation(parseWorkoutDsl(FULL));
    expect(presentation.phases.map((phase) => phase.tag)).toEqual(["WU", "MS", "CD"]);
    expect(presentation.phases[1].nodes[0]).toMatchObject({
      kind: "repeat",
      repetitions: 6,
      summary: "6 × （8 分钟 T + 90 秒恢复）",
    });
    expect(presentation.headline.workLabel).toBe("48 分钟 主训练");
    expect(presentation.headline.recoveryLabel).toBe("9 分钟 恢复");
    expect(presentation.headline.durationLabel).toBe("1 小时 22 分");
    // 原始数值同时暴露，供界面自行组装文案（避免「主训练 48 分钟 主训练」这类重复）
    expect(presentation.headline.workDurationSeconds).toBe(48 * 60);
    expect(presentation.headline.recoveryDurationSeconds).toBe(9 * 60);
    expect(presentation.headline.recoveryDistanceMeters).toBe(0);
    expect(presentation.headline.repeatCount).toBe(1);
    expect(presentation.headline.mixedUnits).toBe(false);
  });

  it("结构预览按比例展开循环，并用颜色区分恢复与休息", () => {
    const presentation = createWorkoutPresentation(parseWorkoutDsl(FULL));
    expect(presentation.preview.blocks).toHaveLength(14);
    expect(presentation.preview.compressed).toBe(false);
    expect(presentation.preview.blocks[0].role).toBe("warmup");
    expect(presentation.preview.blocks[1].color).toBe("#e3b93c"); // 8 分钟 T
    expect(presentation.preview.blocks[2].color).toBe(RECOVERY_COLOR); // 90 秒恢复
    const rest = createWorkoutPresentation(parseWorkoutDsl("GOAL:x\nMS:3x(1km@T+2min@rest)"));
    expect(rest.preview.blocks.some((block) => block.color === REST_COLOR)).toBe(true);
    expect(rest.totals.restDurationSeconds).toBe(360);
  });

  it("混合单位不伪造比例，大循环压缩预览", () => {
    const mixed = createWorkoutPresentation(parseWorkoutDsl("GOAL:x\nMS:15min@E+3km@E"));
    expect(mixed.preview.mixedUnits).toBe(true);
    expect(new Set(mixed.preview.blocks.map((block) => block.weight))).toEqual(new Set([1]));

    const long = createWorkoutPresentation(parseWorkoutDsl("GOAL:x\nMS:100x(1min@E+1min@jog)"));
    expect(long.preview.compressed).toBe(true);
    expect(long.preview.blocks).toHaveLength(MAX_PREVIEW_BLOCKS + 1);
    expect(long.preview.blocks.at(-1)?.kind).toBe("compressed");
  });

  it("结合配速估算完整距离与时间", () => {
    const workout = parseWorkoutDsl("GOAL:x\nMS:45min@E");
    const estimate = estimateWorkoutTotals(workout, PACES);
    expect(estimate.complete).toBe(true);
    expect(estimate.estimatedDistanceMeters).toBe(13500);
    expect(estimate.estimatedDurationSeconds).toBe(2700);

    const heartRate = estimateWorkoutTotals(parseWorkoutDsl("GOAL:x\nMS:45min@HR65-78%max"), PACES);
    expect(heartRate.complete).toBe(false);
    expect(heartRate.estimatedDistanceMeters).toBe(0);
  });

  it("标签格式化", () => {
    expect(formatDurationLabel(90)).toBe("90 秒");
    expect(formatDurationLabel(600)).toBe("10 分钟");
    expect(formatDurationLabel(4920)).toBe("1 小时 22 分");
    expect(formatDistanceLabel(800)).toBe("800 米");
    expect(formatDistanceLabel(1500)).toBe("1.5 公里");
    expect(formatTargetLabel({ type: "daniels", zone: "T" })).toBe("乳酸阈配速（T）");
    expect(formatTargetLabel({ type: "pace-range", fastSecondsPerKm: 285, slowSecondsPerKm: 300 })).toBe(
      "4:45–5:00/km",
    );
    expect(formatTargetLabel({ type: "heart-rate", basis: "reserve", minPercent: 60, maxPercent: 70 })).toBe(
      "储备心率 60–70%",
    );
  });
});
