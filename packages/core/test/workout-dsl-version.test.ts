import { describe, expect, it } from "vitest";
import {
  CURRENT_WORKOUT_DSL_VERSION,
  SUPPORTED_WORKOUT_DSL_VERSIONS,
  detectWorkoutDslVersion,
  isWorkoutDslVersionSupported,
  parseWorkoutDsl,
  serializeWorkout,
} from "../src/dsl/registry.js";
import { parseWorkoutDslV1, serializeWorkoutV1 } from "../src/dsl/v1.js";
import { WorkoutDslError } from "../src/dsl/errors.js";
import { createDefaultWorkout } from "../src/dsl/edit.js";

describe("DSL 版本分发", () => {
  it("声明版本时按版本选择解析器", () => {
    expect(detectWorkoutDslVersion("WORKOUT/1\nGOAL:x\nMS:10min@E")).toBe(1);
    expect(detectWorkoutDslVersion("GOAL:x\nMS:10min@E")).toBeUndefined();
    expect(CURRENT_WORKOUT_DSL_VERSION).toBe(1);
    expect(SUPPORTED_WORKOUT_DSL_VERSIONS).toEqual([1]);
    expect(isWorkoutDslVersionSupported(1)).toBe(true);
    expect(isWorkoutDslVersionSupported(2)).toBe(false);
  });

  it("未声明版本时使用当前最新版解析器", () => {
    const workout = parseWorkoutDsl("GOAL:x\nMS:10min@E");
    expect(workout.dslVersion).toBe(CURRENT_WORKOUT_DSL_VERSION);
  });

  it("平台可以指定默认版本", () => {
    const workout = parseWorkoutDsl("GOAL:x\nMS:10min@E", { defaultVersion: 1 });
    expect(workout.dslVersion).toBe(1);
  });

  it("不支持的显式版本抛出版本错误且不回退", () => {
    expect(() => parseWorkoutDsl("WORKOUT/2\nGOAL:x\nMS:10min@E")).toThrowError(WorkoutDslError);
    try {
      parseWorkoutDsl("WORKOUT/2\nGOAL:x\nMS:10min@E");
    } catch (error) {
      const dslError = error as WorkoutDslError;
      expect(dslError.code).toBe("unsupported-version");
      expect(dslError.message).toContain("不支持的课程 DSL 版本 2");
    }
    expect(() => parseWorkoutDslV1("WORKOUT/2\nGOAL:x\nMS:10min@E")).toThrowError(/不支持版本 2/);
  });

  it("版本行格式错误时给出明确提示", () => {
    expect(() => detectWorkoutDslVersion("WORKOUT/abc\nGOAL:x\nMS:10min@E")).toThrowError(/版本声明无效/);
    expect(() => parseWorkoutDsl("WORKOUT\nGOAL:x\nMS:10min@E")).toThrowError(/版本声明无效/);
  });

  it("序列化按 AST 中的版本分发", () => {
    const workout = createDefaultWorkout();
    workout.goal = "有氧基础";
    expect(serializeWorkout(workout)).toContain("WORKOUT/1");
    expect(serializeWorkoutV1(workout, { version: false })).toBe("GOAL:有氧基础\nMS:30min@E");
    expect(() => serializeWorkout({ ...workout, dslVersion: 2 })).toThrowError(/不支持的课程 DSL 版本 2/);
  });
});
