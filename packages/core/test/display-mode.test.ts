import { describe, expect, it } from "vitest";
import { parseWorkoutDsl } from "../src/dsl/registry.js";
import {
  createWorkoutPresentation,
  danielsPaceDisplay,
  danielsPaceText,
  formatTargetLabel,
} from "../src/dsl/presentation.js";
import { athleteFitness, trainingPacesFromFitness } from "../src/fitness.js";
import { calculateTrainingPaces, type TrainingPaces } from "../src/pace.js";
import { pacesFromVdot } from "../src/vdot.js";
import { describeWorkout, formatTrainingDay } from "../src/workflow.js";
import type { AthleteProfile } from "../src/athlete.js";

/** 阈值 4:00/km（240s）→ 6 秒规则档位 */
const PACES: TrainingPaces = calculateTrainingPaces(240);

function athlete(overrides: Partial<AthleteProfile>): AthleteProfile {
  return {
    id: "local-test",
    provider: "local",
    schemaVersion: 1,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("强度 ↔ 配速展示口径", () => {
  it("丹尼尔斯档位换算为当前能力的配速区间", () => {
    expect(danielsPaceDisplay("T", PACES)).toEqual({ text: "3:45–4:00/km", estimated: false });
    expect(danielsPaceText("T", PACES)).toBe("3:45–4:00/km");
    // E/M 在书里没有 6 秒规则的精确定义，必须标注估算
    expect(danielsPaceDisplay("E", PACES)?.estimated).toBe(true);
    expect(danielsPaceText("E", PACES)).toBe("3:10–3:30/km（估算）");
    expect(danielsPaceText("M", PACES)).toBe("3:40–3:50/km（估算）");
  });

  it("没有能力或没有对应档位时不猜配速", () => {
    // ST（跨步跑）按全力短距离进行，不属于配速区间
    expect(danielsPaceText("ST", PACES)).toBeUndefined();
    expect(danielsPaceText("T", null)).toBeUndefined();
    expect(danielsPaceText("T", undefined)).toBeUndefined();
    // 数值不合法（例如手工塞进来的脏数据）同样回退
    const broken = { ...PACES, T: { fast: Number.NaN, slow: 240 } } as TrainingPaces;
    expect(danielsPaceText("T", broken)).toBeUndefined();
  });

  it("配速口径保留档位字母，缺少能力时回退强度标签", () => {
    expect(formatTargetLabel({ type: "daniels", zone: "T" })).toBe("乳酸阈配速（T）");
    expect(formatTargetLabel({ type: "daniels", zone: "T" }, { mode: "pace", paces: PACES })).toBe(
      "3:45–4:00/km（T）",
    );
    expect(formatTargetLabel({ type: "daniels", zone: "E" }, { mode: "pace", paces: PACES })).toBe(
      "3:10–3:30/km（E · 估算）",
    );
    // 尚未建立能力：口径不变，仍然是强度标签
    expect(formatTargetLabel({ type: "daniels", zone: "T" }, { mode: "pace" })).toBe("乳酸阈配速（T）");
    // ST 没有配速档位，保持强度标签（不伪造配速）
    expect(formatTargetLabel({ type: "daniels", zone: "ST" }, { mode: "pace", paces: PACES })).toBe(
      "短距离神经激活（ST）",
    );
    // 自定义配速目标本来就是配速，不受口径影响
    expect(
      formatTargetLabel({ type: "pace-range", fastSecondsPerKm: 285, slowSecondsPerKm: 300 }, { mode: "pace", paces: PACES }),
    ).toBe("4:45–5:00/km");
  });

  it("结构树与结构预览跟随口径切换", () => {
    const workout = parseWorkoutDsl("GOAL:乳酸阈能力\nMS:3x(8min@T+90s@jog)");
    const zoneView = createWorkoutPresentation(workout);
    expect(zoneView.phases[0].nodes[0]).toMatchObject({
      summary: "3 × （8 分钟 T + 90 秒恢复）",
    });
    const paceView = createWorkoutPresentation(workout, { targetMode: "pace", paces: PACES });
    const repeat = paceView.phases[0].nodes[0];
    expect(repeat.kind).toBe("repeat");
    expect(repeat.summary).toBe("3 × （8 分钟 T 3:45–4:00/km + 90 秒恢复）");
    expect(repeat.children[0]).toMatchObject({ targetLabel: "3:45–4:00/km（T）" });
    expect(paceView.preview.blocks[0].label).toBe("8 分钟 T 3:45–4:00/km");
    // 默认口径仍然是 DSL 的强度说法
    expect(zoneView.preview.blocks[0].label).toBe("8 分钟 T");
    expect(zoneView.phases[0].nodes[0].children[0]).toMatchObject({ targetLabel: "乳酸阈配速（T）" });
  });

  it("课表文字：默认含配速，强度口径只给档位", () => {
    const workout = parseWorkoutDsl("GOAL:有氧基础\nMS:40min@E");
    const withPace = describeWorkout(workout, PACES, { includeGoal: false });
    expect(withPace[0]).toContain("40min@E");
    expect(withPace[0]).toContain("3:10–3:30/km（估算）");

    const zoneOnly = describeWorkout(workout, PACES, { includeGoal: false, targetMode: "zone" });
    expect(zoneOnly[0]).toContain("40min@E");
    expect(zoneOnly[0]).not.toContain("/km");

    const day = {
      id: "plans:t:d0",
      date: "2026-09-14",
      dayIndex: 0,
      label: "E",
      items: [{ type: "E" as const }],
      workout,
    };
    expect(formatTrainingDay(day, PACES, { targetMode: "zone" }).items[0].text).not.toContain("/km");
    expect(formatTrainingDay(day, PACES).items[0].text).toContain("/km");
  });

  it("能力摘要换算成课表配速档位", () => {
    const six = athlete({ thresholdPaceSecondsPerKm: 240 });
    expect(trainingPacesFromFitness(athleteFitness(six))).toEqual(calculateTrainingPaces(240));

    const vdot = athlete({ vdot: 45, raceResults: [{ distanceM: 10000, timeSeconds: 2700 }] });
    expect(trainingPacesFromFitness(athleteFitness(vdot))).toEqual(pacesFromVdot(45));

    // 尚未建立能力：返回 null，由调用方回退到强度展示
    expect(trainingPacesFromFitness(athleteFitness(athlete({})))).toBeNull();
    expect(trainingPacesFromFitness(null)).toBeNull();
  });
});
