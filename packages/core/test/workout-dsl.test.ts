import { describe, expect, it } from "vitest";
import {
  DslError,
  parseWorkoutDsl,
  serializeWorkout,
  validateWorkout,
  workoutTotals,
} from "../src/workout-dsl.js";

describe("workout DSL", () => {
  it("round-trips a simple set workout", () => {
    const dsl = "(6min@T@rpe8+1min@jg)*8";
    const workout = parseWorkoutDsl(dsl);
    expect(workout.segments[0].kind).toBe("set");
    const set = workout.segments[0];
    expect(set.repeats).toBe(8);
    const inner = set.segments[0];
    expect(inner.kind).toBe("step");
    expect(inner.load).toEqual({ type: "time", minutes: 6 });
    expect(inner.intensity).toEqual({ type: "pace", zone: "T" });
    expect(inner.rpe).toBe(8);
    expect(inner.rest).toEqual({ type: "time", minutes: 1, mode: "jog" });
    expect(serializeWorkout(parseWorkoutDsl(serializeWorkout(workout)))).toBe(dsl);
  });

  it("parses warmup / cooldown / incline / goal", () => {
    const workout = parseWorkoutDsl(
      "[赛前减量·T] 10min@E@warmup+(800m@I@inc1+3min@jg)*10+10min@E@cooldown",
    );
    expect(workout.goal).toBe("赛前减量·T");
    expect(workout.segments[0].phase).toBe("warmup");
    expect(workout.segments[0].intensity).toEqual({ type: "pace", zone: "E" });
    const set = workout.segments[1];
    expect(set.kind).toBe("set");
    expect(set.segments[0].load).toEqual({ type: "distance", meters: 800 });
    expect(set.segments[0].inclinePercent).toBe(1);
    const last = workout.segments[2];
    expect(last.phase).toBe("cooldown");
  });

  it("parses explicit custom pace range", () => {
    const workout = parseWorkoutDsl("20min@P285-300+5min@jg");
    const step = workout.segments[0];
    expect(step.intensity).toEqual({ type: "paceRange", fastSecondsPerKm: 285, slowSecondsPerKm: 300 });
    expect(serializeWorkout(workout)).toBe("20min@P285-300+5min@jg");
  });

  it("parses heart rate intensity and distance rest", () => {
    const workout = parseWorkoutDsl("30min@HR65-78%+(400m@R+400m@jg)*5");
    const hr = workout.segments[0];
    expect(hr.intensity).toEqual({ type: "heartRate", minPercent: 65, maxPercent: 78 });
    const rSet = workout.segments[1];
    expect(rSet.segments[0].rest).toEqual({ type: "distance", meters: 400, mode: "jog" });
  });

  it("computes totals across nested sets", () => {
    const workout = parseWorkoutDsl("(6min@T@rpe8+1min@jg)*8");
    const totals = workoutTotals(workout);
    expect(totals.durationMinutes).toBe(48); // 只算运动时间，不含休息
  });

  it("reports errors with position", () => {
    expect(() => parseWorkoutDsl("8min@X")).toThrowError(/位置 5/);
    expect(() => parseWorkoutDsl("8min@T+")).toThrowError(/位置/);
    expect(() => parseWorkoutDsl("(8min@T*3")).toThrowError(/缺少组的闭合括号/);
    expect(() => parseWorkoutDsl("8min@T@rpe12")).toThrowError(/RPE/);
  });

  it("rejects deeply nested groups", () => {
    const deep = "(".repeat(12) + "1min@E" + ")".repeat(12);
    expect(() => parseWorkoutDsl(deep)).toThrowError(/嵌套过深/);
  });

  it("serializes custom intensity as an error", () => {
    const workout = parseWorkoutDsl("8min@T");
    workout.segments[0].intensity = { type: "custom", label: "自由跑" };
    expect(() => serializeWorkout(workout)).toThrowError(/自定义强度/);
  });

  it("validateWorkout requires a goal (the highest guiding principle)", () => {
    const workout = parseWorkoutDsl("[阈值] 8min@T");
    expect(validateWorkout(workout)).toEqual([]);
    const noGoal = { segments: structuredClone(workout.segments) };
    expect(validateWorkout(noGoal)).toEqual(["训练目的（goal）为必填项：每次训练都必须明确训练目的"]);
    const empty = { goal: "x", segments: [] };
    expect(validateWorkout(empty).some((error) => error.includes("课表内容不能为空"))).toBe(true);
  });

  it("validateWorkout checks structure and ranges", () => {
    const bad = parseWorkoutDsl("[x] 8min@T");
    bad.segments[0].load = { type: "time", minutes: -3 };
    expect(validateWorkout(bad).some((error) => error.includes("时间负荷"))).toBe(true);
    const badRange = parseWorkoutDsl("[x] 8min@P285-300");
    badRange.segments[0].intensity = { type: "paceRange", fastSecondsPerKm: 300, slowSecondsPerKm: 285 };
    expect(validateWorkout(badRange).some((error) => error.includes("配速区间无效"))).toBe(true);
    const badRpe = parseWorkoutDsl("[x] 8min@T");
    badRpe.segments[0].rpe = 11;
    expect(validateWorkout(badRpe).some((error) => error.includes("RPE"))).toBe(true);
  });
});
