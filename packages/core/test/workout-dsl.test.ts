import { describe, expect, it } from "vitest";
import { parseWorkoutDsl, serializeWorkout } from "../src/dsl/registry.js";
import { parseWorkoutDslV1 } from "../src/dsl/v1.js";
import { validateWorkout, workoutTotals } from "../src/dsl/workout.js";
import { WorkoutDslError } from "../src/dsl/errors.js";

const FULL = [
  "WORKOUT/1",
  "TITLE:T 跑 8min×6",
  "GOAL:乳酸阈能力",
  "NOTE:每组稳定完成",
  "WU:15min@E",
  "MS:6x(8min@T@RPE8+90s@jog)",
  "CD:10min@E",
].join("\n");

describe("Workout DSL v1", () => {
  it("解析最小合法课程（GOAL + MS）", () => {
    const workout = parseWorkoutDsl("GOAL:有氧基础\nMS:40min@E");
    expect(workout).toEqual({
      dslVersion: 1,
      goal: "有氧基础",
      phases: [
        {
          role: "main",
          segments: [{ kind: "run", load: { type: "time", seconds: 2400 }, target: { type: "daniels", zone: "E" } }],
        },
      ],
    });
  });

  it("解析完整形态：版本、标题、备注与三个阶段", () => {
    const workout = parseWorkoutDsl(FULL);
    expect(workout.dslVersion).toBe(1);
    expect(workout.title).toBe("T 跑 8min×6");
    expect(workout.goal).toBe("乳酸阈能力");
    expect(workout.note).toBe("每组稳定完成");
    expect(workout.phases.map((phase) => phase.role)).toEqual(["warmup", "main", "cooldown"]);

    const main = workout.phases[1].segments[0];
    expect(main.kind).toBe("repeat");
    if (main.kind !== "repeat") throw new Error("应为循环");
    expect(main.repetitions).toBe(6);
    expect(main.segments).toEqual([
      {
        kind: "run",
        load: { type: "time", seconds: 480 },
        target: { type: "daniels", zone: "T" },
        rpe: 8,
      },
      { kind: "recovery", load: { type: "time", seconds: 90 } },
    ]);
  });

  it("空白标题与备注规范化为未设置", () => {
    const workout = parseWorkoutDsl("TITLE:   \nGOAL: 有氧基础 \nNOTE:\nMS:40min@E");
    expect(workout.title).toBeUndefined();
    expect(workout.note).toBeUndefined();
    expect(workout.goal).toBe("有氧基础");
  });

  it("恢复与休息是一等步骤，休息只接受时间", () => {
    const workout = parseWorkoutDsl(
      "GOAL:速度与跑步经济性\nMS:8x(400m@R@RPE9+3min@rest)+5min@jog",
    );
    const main = workout.phases[0].segments;
    expect(main[1]).toEqual({ kind: "recovery", load: { type: "time", seconds: 300 } });
    expect(main[0].kind).toBe("repeat");
    if (main[0].kind !== "repeat") throw new Error("应为循环");
    expect(main[0].segments[1]).toEqual({ kind: "rest", durationSeconds: 180 });
    expect(() => parseWorkoutDsl("GOAL:x\nMS:400m@rest")).toThrowError(/被动休息只接受时间负荷/);
  });

  it("支持全部主目标类型", () => {
    const cases: Array<[string, unknown]> = [
      ["E", { type: "daniels", zone: "E" }],
      ["ST", { type: "daniels", zone: "ST" }],
      ["P4:45-5:00/km", { type: "pace-range", fastSecondsPerKm: 285, slowSecondsPerKm: 300 }],
      ["HR65-78%max", { type: "heart-rate", basis: "max", minPercent: 65, maxPercent: 78 }],
      ["HR60-70%hrr", { type: "heart-rate", basis: "reserve", minPercent: 60, maxPercent: 70 }],
      ["HR145-160bpm", { type: "heart-rate-absolute", minBpm: 145, maxBpm: 160 }],
      ["RPE7", { type: "rpe", value: 7 }],
    ];
    for (const [text, target] of cases) {
      const workout = parseWorkoutDsl(`GOAL:x\nMS:10min@${text}`);
      const step = workout.phases[0].segments[0];
      expect(step.kind).toBe("run");
      if (step.kind !== "run") throw new Error("应为跑步步骤");
      expect(step.target).toEqual(target);
      expect(serializeWorkout(workout, { version: false })).toContain(`@${text}`);
    }
  });

  it("规范化单位：1.5min → 90s，1500m → 1.5km", () => {
    const workout = parseWorkoutDsl("GOAL:x\nMS:1.5min@E+1500m@E+90s@jog");
    expect(workout.phases[0].segments[0]).toMatchObject({ load: { type: "time", seconds: 90 } });
    expect(workout.phases[0].segments[1]).toMatchObject({ load: { type: "distance", meters: 1500 } });
    expect(serializeWorkout(workout, { version: false })).toBe("GOAL:x\nMS:90s@E+1.5km@E+90s@jog");
  });

  it("往返结构等价（含嵌套循环、备注转义与坡度）", () => {
    const source = [
      "GOAL:I 与 T 混合刺激",
      'WU:15min@E@note("轻松\\"热身\\"")',
      "MS:2x(3x(3min@I+2min@jog)+5min@T@inc3+2min@jog)",
      "CD:10min@E",
    ].join("\n");
    const workout = parseWorkoutDsl(source);
    const round = parseWorkoutDsl(serializeWorkout(workout));
    expect(round).toEqual(workout);
    expect(round.phases[0].segments[0]).toMatchObject({ note: '轻松"热身"' });
    expect(serializeWorkout(workout)).toContain("WORKOUT/1");
    expect(serializeWorkout(workout, { version: false }).startsWith("GOAL:")).toBe(true);
  });

  it("拒绝超过 10 层的循环", () => {
    const inner = `${"2x(".repeat(11)}1min@E${")".repeat(11)}`;
    expect(() => parseWorkoutDsl(`GOAL:x\nMS:${inner}`)).toThrowError(/循环嵌套不能超过 10 层/);
    const ok = `${"2x(".repeat(10)}1min@E${")".repeat(10)}`;
    expect(() => parseWorkoutDsl(`GOAL:x\nMS:${ok}`)).not.toThrow();
  });

  it("错误带行列、错误码与修复提示", () => {
    try {
      parseWorkoutDsl("GOAL:x\nMS:8min@H");
      throw new Error("应当失败");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkoutDslError);
      const dslError = error as WorkoutDslError;
      expect(dslError.code).toBe("unknown-target");
      expect(dslError.line).toBe(2);
      expect(dslError.column).toBe(9);
      expect(dslError.message).toContain("第 2 行第 9 列");
      expect(dslError.message).toContain("未知训练目标");
      expect(dslError.hint).toContain("E/M/T/I/R/ST");
    }
  });

  it("拒绝缺少或空白的训练目的", () => {
    expect(() => parseWorkoutDsl("MS:40min@E")).toThrowError(/缺少训练目的/);
    expect(() => parseWorkoutDsl("GOAL:\nMS:40min@E")).toThrowError(/不能为空/);
    expect(validateWorkout({ dslVersion: 1, goal: " ", phases: [{ role: "main", segments: [] }] })[0].code).toBe(
      "missing-goal",
    );
  });

  it("校验阶段唯一性、顺序与内容", () => {
    expect(() => parseWorkoutDsl("GOAL:x\nMS:10min@E\nMS:10min@E")).toThrowError(/只能出现一次/);
    expect(() => parseWorkoutDsl("GOAL:x\nCD:10min@E\nMS:10min@E")).toThrowError(/阶段顺序/);
    expect(() => parseWorkoutDsl("GOAL:x\nMS:")).toThrowError(/内容不能为空/);
    expect(() => parseWorkoutDsl("GOAL:x\nWU:10min@E\nCD:10min@E")).toThrowError(/缺少主训练阶段/);
    expect(() => parseWorkoutDsl("GOAL:x\nMS:10min@E\nTITLE:晚到的标题")).toThrowError(/必须位于所有阶段之前/);
  });

  it("校验属性限制与数值范围", () => {
    expect(() => parseWorkoutDsl("GOAL:x\nMS:8min@T@RPE11")).toThrowError(/RPE 范围应为 1-10/);
    expect(() => parseWorkoutDsl("GOAL:x\nMS:8min@T@inc25")).toThrowError(/坡度范围应为 0-20%/);
    expect(() => parseWorkoutDsl("GOAL:x\nMS:8min@T@rpe8")).toThrowError(/未知步骤属性/);
    expect(() => parseWorkoutDsl("GOAL:x\nMS:8min@HR30-40%max")).toThrowError(/心率百分比无效/);
    expect(() => parseWorkoutDsl("GOAL:x\nMS:8min@P5:00-4:45/km")).toThrowError(/自定义配速区间无效/);
    expect(() => parseWorkoutDsl("GOAL:x\nMS:8min@E@note(放松)")).toThrowError(/备注必须使用双引号/);
    expect(() => parseWorkoutDsl("GOAL:x\nMS:0min@E")).toThrowError(/负荷必须为正数/);
    expect(() => parseWorkoutDsl("GOAL:x\nMS:90s@jog@RPE5")).toThrowError(/只支持备注属性/);
  });

  it("按规范汇总：主训练容量、恢复与休息分开统计", () => {
    const workout = parseWorkoutDsl(FULL);
    const totals = workoutTotals(workout);
    expect(totals.knownDurationSeconds).toBe(900 + 6 * (480 + 90) + 600);
    expect(totals.knownDistanceMeters).toBe(0);
    expect(totals.workDurationSeconds).toBe(6 * 480);
    expect(totals.recoveryDurationSeconds).toBe(6 * 90);
    expect(totals.restDurationSeconds).toBe(0);

    const withRest = parseWorkoutDsl("GOAL:x\nMS:4x(800m@I+2min@rest)+800m@I");
    const restTotals = workoutTotals(withRest);
    expect(restTotals.knownDistanceMeters).toBe(5 * 800);
    expect(restTotals.workDistanceMeters).toBe(5 * 800);
    expect(restTotals.restDurationSeconds).toBe(4 * 120);
  });

  it("validateWorkout 接受内置课程形态并拒绝空循环", () => {
    expect(validateWorkout(parseWorkoutDsl(FULL))).toEqual([]);
    const broken = parseWorkoutDsl(FULL);
    broken.phases[1].segments = [{ kind: "repeat", repetitions: 3, segments: [] }];
    expect(validateWorkout(broken).some((issue) => issue.code === "empty-repeat")).toBe(true);
  });

  it("解析器直接调用（版本明确入口）", () => {
    expect(parseWorkoutDslV1("GOAL:x\nMS:10min@E").dslVersion).toBe(1);
  });
});
