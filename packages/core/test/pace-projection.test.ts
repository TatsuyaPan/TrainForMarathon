import { describe, expect, it } from "vitest";
import { parseWorkoutDsl, serializeWorkout } from "../src/dsl/registry.js";
import {
  paceTargetForZone,
  projectWorkoutToPace,
  workoutHasExplicitPace,
  workoutHasIntensity,
} from "../src/dsl/pace-projection.js";
import { calculateTrainingPaces } from "../src/pace.js";

/** 阈值 4:00/km 的档位：E 3:10-3:30、M 3:40-3:50、T 3:45-4:00、I 3:30-3:45、R 3:15-3:30 */
const PACES = calculateTrainingPaces(240);

const ZONE_DSL = [
  "GOAL:乳酸阈能力",
  "WU:15min@E",
  "MS:6x(8min@T@RPE8+90s@jog)",
  "CD:10min@E",
].join("\n");

describe("配速写法（档位 → 明确配速）", () => {
  it("把档位换算成规范范围内的明确配速", () => {
    expect(paceTargetForZone("T", PACES)).toEqual({ type: "pace-range", fastSecondsPerKm: 225, slowSecondsPerKm: 240 });
    expect(paceTargetForZone("I", PACES)).toEqual({ type: "pace-range", fastSecondsPerKm: 210, slowSecondsPerKm: 225 });
  });

  it("ST、缺少能力与越界区间都不伪造配速", () => {
    expect(paceTargetForZone("ST", PACES)).toBeUndefined();
    expect(paceTargetForZone("T", null)).toBeUndefined();
    expect(paceTargetForZone("T", undefined)).toBeUndefined();
    expect(paceTargetForZone("T", { ...PACES, T: { fast: 60, slow: 70 } })).toBeUndefined();
    expect(paceTargetForZone("T", { ...PACES, T: { fast: 240, slow: 240 } })).toBeUndefined();
  });

  it("只换档位目标：明确配速、心率与 RPE 保持原样", () => {
    const workout = parseWorkoutDsl(
      [
        "GOAL:I 与阈值混合",
        "WU:15min@E",
        "MS:5x(3min@I+2min@jog)+5min@P4:45-5:00/km+10min@HR65-78%max+5min@RPE7",
      ].join("\n"),
    );
    const projected = projectWorkoutToPace(workout, PACES);
    const segments = projected.phases[1].segments;
    expect(segments[0]).toMatchObject({ kind: "repeat" });
    const repeat = segments[0];
    if (repeat.kind !== "repeat") throw new Error("期望循环");
    expect(repeat.segments[0]).toMatchObject({ target: { type: "pace-range", fastSecondsPerKm: 210, slowSecondsPerKm: 225 } });
    expect(repeat.segments[1]).toMatchObject({ kind: "recovery" });
    expect(segments[1]).toMatchObject({ target: { type: "pace-range", fastSecondsPerKm: 285, slowSecondsPerKm: 300 } });
    expect(segments[2]).toMatchObject({ target: { type: "heart-rate", minPercent: 65, maxPercent: 78 } });
    expect(segments[3]).toMatchObject({ target: { type: "rpe", value: 7 } });
    // 热身/冷身也按能力换算
    expect(projected.phases[0].segments[0]).toMatchObject({ target: { type: "pace-range", fastSecondsPerKm: 190, slowSecondsPerKm: 210 } });
  });

  it("ST 步骤在任何情况下都保持档位写法", () => {
    const workout = parseWorkoutDsl("GOAL:速度与跑步经济性\nMS:8x(100m@ST+100m@jog)+20min@T");
    const projected = projectWorkoutToPace(workout, PACES);
    const repeat = projected.phases[0].segments[0];
    if (repeat.kind !== "repeat") throw new Error("期望循环");
    expect(repeat.segments[0]).toMatchObject({ target: { type: "daniels", zone: "ST" } });
    expect(projected.phases[0].segments[1]).toMatchObject({ target: { type: "pace-range" } });
  });

  it("没有能力时整份课表保持档位写法", () => {
    const workout = parseWorkoutDsl(ZONE_DSL);
    expect(projectWorkoutToPace(workout, null)).toEqual(workout);
  });

  it("投影是纯函数：不修改入参，且返回独立对象", () => {
    const workout = parseWorkoutDsl(ZONE_DSL);
    const before = JSON.parse(JSON.stringify(workout));
    const projected = projectWorkoutToPace(workout, PACES);
    expect(JSON.parse(JSON.stringify(workout))).toEqual(before);
    expect(projected).not.toBe(workout);
    expect(projected.phases[1]).not.toBe(workout.phases[1]);
  });

  it("导出配速写法：仍是同一个冻结版本的文本", () => {
    const workout = parseWorkoutDsl(ZONE_DSL);
    const paceDsl = serializeWorkout(workout, { targetMode: "pace", paces: PACES });
    expect(paceDsl.startsWith("WORKOUT/1")).toBe(true);
    expect(paceDsl).toContain("WU:15min@P3:10-3:30/km");
    expect(paceDsl).toContain("6x(8min@P3:45-4:00/km@RPE8+90s@jog)");
    expect(paceDsl).not.toContain("@T");

    // 没有能力：配速写法退回档位写法，不伪造配速
    expect(serializeWorkout(workout, { targetMode: "pace" })).toBe(serializeWorkout(workout));
    // 档位写法（默认）不受影响
    expect(serializeWorkout(workout)).toContain("6x(8min@T@RPE8+90s@jog)");
    expect(serializeWorkout(workout, { targetMode: "zone", paces: PACES })).toContain("6x(8min@T@RPE8+90s@jog)");
  });

  it("配速写法是有损投影：导入回来是明确配速，不会反推成档位", () => {
    const workout = parseWorkoutDsl(ZONE_DSL);
    const paceDsl = serializeWorkout(workout, { targetMode: "pace", paces: PACES });
    const reimported = parseWorkoutDsl(paceDsl);
    const main = reimported.phases[1].segments[0];
    if (main.kind !== "repeat") throw new Error("期望循环");
    expect(main.segments[0]).toMatchObject({ target: { type: "pace-range", fastSecondsPerKm: 225, slowSecondsPerKm: 240 } });
    expect(reimported).not.toEqual(workout);
    // 往返在「配速已经是明确目标」之后重新变得稳定
    expect(serializeWorkout(reimported)).toBe(paceDsl);
  });

  it("含明确配速的课表不会被反推成档位", () => {
    const workout = parseWorkoutDsl("GOAL:马拉松专项适应\nMS:12km@P4:45-5:00/km");
    expect(workoutHasExplicitPace(workout)).toBe(true);
    expect(workoutHasIntensity(workout)).toBe(false);
    expect(serializeWorkout(workout, { targetMode: "pace", paces: PACES })).toBe(serializeWorkout(workout));
  });

  it("写法可用性：只有含档位的课表能导出配速写法", () => {
    expect(workoutHasIntensity(parseWorkoutDsl(ZONE_DSL))).toBe(true);
    expect(workoutHasExplicitPace(parseWorkoutDsl(ZONE_DSL))).toBe(false);
    expect(workoutHasIntensity(parseWorkoutDsl("GOAL:有氧基础\nMS:45min@HR65-78%max"))).toBe(false);
    expect(workoutHasExplicitPace(parseWorkoutDsl("GOAL:有氧基础\nMS:45min@HR65-78%max"))).toBe(false);
  });
});
