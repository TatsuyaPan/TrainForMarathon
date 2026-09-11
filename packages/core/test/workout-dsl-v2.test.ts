import { describe, expect, it } from "vitest";
import { parseWorkoutDslV2, serializeWorkoutV2, WORKOUT_DSL_V2_VERSION } from "../src/dsl/v2.js";
import { parseWorkoutDslV1 } from "../src/dsl/v1.js";
import { parseWorkoutDsl, serializeWorkout } from "../src/dsl/registry.js";
import { WorkoutDslError } from "../src/dsl/errors.js";

const H_COURSE = [
  "WORKOUT/2",
  "TITLE:3 分钟间歇 ×8",
  "GOAL:最大摄氧量",
  "WU:15min@E",
  "MS:8x(3min@H+2min@jog)",
  "CD:10min@E",
].join("\n");

describe("Workout DSL v2（H 记法）", () => {
  it("H 解析为 I 强度 + 时间负荷，dslVersion 为 2", () => {
    const workout = parseWorkoutDslV2(H_COURSE);
    expect(workout.dslVersion).toBe(WORKOUT_DSL_V2_VERSION);
    const main = workout.phases.find((phase) => phase.role === "main")!;
    const repeat = main.segments[0];
    expect(repeat.kind).toBe("repeat");
    if (repeat.kind !== "repeat") return;
    const run = repeat.segments[0];
    expect(run.kind).toBe("run");
    if (run.kind !== "run") return;
    expect(run.load).toEqual({ type: "time", seconds: 180 });
    expect(run.target).toEqual({ type: "daniels", zone: "I" });
  });

  it("距离负荷 + H 明确报错（H 基于时间）", () => {
    try {
      parseWorkoutDslV2("GOAL:x\nMS:800m@H");
      throw new Error("应当失败");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkoutDslError);
      const dslError = error as WorkoutDslError;
      expect(dslError.code).toBe("invalid-value");
      expect(dslError.message).toContain("H 表示按时间控制");
    }
  });

  it("未声明版本时同样接受 H（按 v2 解析）", () => {
    const workout = parseWorkoutDsl("GOAL:x\nMS:3min@H");
    expect(workout.dslVersion).toBe(2);
  });

  it("往返结构等价，序列化输出规范写法 @I", () => {
    const workout = parseWorkoutDslV2(H_COURSE);
    const text = serializeWorkoutV2(workout);
    expect(text.startsWith("WORKOUT/2")).toBe(true);
    expect(text).toContain("3min@I");
    expect(text).not.toContain("@H");
    expect(parseWorkoutDslV2(text)).toEqual(workout);
  });

  it("紧凑导出省略版本行", () => {
    const workout = parseWorkoutDslV2(H_COURSE);
    const text = serializeWorkoutV2(workout, { version: false });
    expect(text.startsWith("TITLE:")).toBe(true);
    expect(text).not.toContain("WORKOUT/");
  });

  it("v2 是 v1 的严格超集：v1 合法输入在 v2 下解析结果除版本外一致", () => {
    const source = [
      "GOAL:乳酸阈能力",
      "WU:15min@E",
      "MS:6x(8min@T@RPE8+90s@jog)",
      "CD:10min@E",
    ].join("\n");
    const v1 = parseWorkoutDslV1(source);
    const v2 = parseWorkoutDslV2(source);
    expect({ ...v2, dslVersion: 1 }).toEqual(v1);
    expect(v2.dslVersion).toBe(2);
  });

  it("v2 解析器拒绝 WORKOUT/1 与 WORKOUT/3 的显式声明", () => {
    expect(() => parseWorkoutDslV2("WORKOUT/1\nGOAL:x\nMS:3min@I")).toThrowError(/不支持版本 1/);
    expect(() => parseWorkoutDslV2("WORKOUT/3\nGOAL:x\nMS:3min@I")).toThrowError(/不支持版本 3/);
  });

  it("版本分发：WORKOUT/1 走 v1、WORKOUT/2 走 v2", () => {
    expect(parseWorkoutDsl("WORKOUT/1\nGOAL:x\nMS:10min@E").dslVersion).toBe(1);
    expect(parseWorkoutDsl("WORKOUT/2\nGOAL:x\nMS:3min@H").dslVersion).toBe(2);
    expect(() => serializeWorkout(parseWorkoutDsl("WORKOUT/1\nGOAL:x\nMS:10min@E"))).not.toThrow();
  });
});
