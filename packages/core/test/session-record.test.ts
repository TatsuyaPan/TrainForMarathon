import { describe, expect, it } from "vitest";
import {
  createSessionRecordForm,
  resetActualWorkoutToPlan,
  toCompleteSessionInput,
  type SessionRecordForm,
} from "../src/session-record.js";
import type { TrainingSession, Workout } from "../src/domain.js";

const plannedWorkout: Workout = {
  dslVersion: 1,
  goal: "有氧耐力",
  phases: [
    {
      role: "main",
      segments: [
        { kind: "run", load: { type: "distance", meters: 8000 }, target: { type: "daniels", zone: "E" } },
      ],
    },
  ],
};

function session(overrides: Partial<TrainingSession> = {}): TrainingSession {
  return {
    id: "plan:day:0",
    planId: "plan",
    dayId: "day",
    seq: 0,
    label: "轻松跑",
    status: "planned",
    plannedWorkout,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    ...overrides,
  };
}

describe("训练记录表单模型（平台无关）", () => {
  it("计划中的训练：默认按计划完成，且实际内容是计划内容的独立副本", () => {
    const form = createSessionRecordForm(session());

    expect(form.adjustActualWorkout).toBe(false);
    expect(form.actualWorkout).toEqual(plannedWorkout);
    expect(form.actualWorkout).not.toBe(plannedWorkout);
    form.actualWorkout!.goal = "修改副本";
    expect(plannedWorkout.goal).toBe("有氧耐力");
  });

  it("已完成的训练：还原那唯一一份记录并标记为偏离计划", () => {
    const actualWorkout: Workout = { ...plannedWorkout, goal: "实际改为节奏跑" };
    const form = createSessionRecordForm(session({
      status: "done",
      actualWorkout,
      actualDistanceKm: 9.6,
      actualDurationMinutes: 48,
      actualRpe: 7,
      log: "状态稳定",
    }));

    expect(form.adjustActualWorkout).toBe(true);
    expect(form.actualWorkout).toEqual(actualWorkout);
    expect(form.distanceKm).toBe(9.6);
    expect(form.durationMinutes).toBe(48);
    expect(form.rpe).toBe(7);
    expect(form.log).toBe("状态稳定");
  });

  it("按计划完成（实际内容与计划一致）不算偏离", () => {
    const form = createSessionRecordForm(session({
      status: "done",
      actualWorkout: JSON.parse(JSON.stringify(plannedWorkout)) as Workout,
      actualDistanceKm: 8,
    }));

    expect(form.adjustActualWorkout).toBe(false);
  });

  it("临时追加的训练：没有计划内容也能开始记录", () => {
    const form = createSessionRecordForm(session({ seq: 1, plannedWorkout: undefined }));

    expect(form.actualWorkout).toBeUndefined();
    expect(form.adjustActualWorkout).toBe(false);
  });

  it("合法输入被归一化成一份完成载荷（RPE 与日志会被整理）", () => {
    const form = createSessionRecordForm(session());
    Object.assign(form, { distanceKm: 8, durationMinutes: 43, rpe: 6, log: "  风有点大  " });

    expect(toCompleteSessionInput(form)).toEqual({
      actualWorkout: plannedWorkout,
      actualDistanceKm: 8,
      actualDurationMinutes: 43,
      actualRpe: 6,
      log: "风有点大",
    });
  });

  it("空值不写入载荷，避免覆盖已有记录", () => {
    const form = createSessionRecordForm(session({ plannedWorkout: undefined }));

    expect(toCompleteSessionInput(form)).toEqual({});
  });

  it("字符串输入（表单原样值）也会被转成数字", () => {
    const form = createSessionRecordForm(session());
    Object.assign(form, { distanceKm: "8.5", durationMinutes: "45", rpe: "7" } as Partial<SessionRecordForm>);

    expect(toCompleteSessionInput(form)).toMatchObject({
      actualDistanceKm: 8.5,
      actualDurationMinutes: 45,
      actualRpe: 7,
    });
  });

  it.each([
    [{ distanceKm: 0 }, "距离"],
    [{ durationMinutes: -1 }, "时长"],
    [{ rpe: 11 }, "RPE"],
    [{ rpe: 6.5 }, "RPE"],
  ])("拒绝非法的完成数据 %o", (values, message) => {
    const form = createSessionRecordForm(session());
    Object.assign(form, values);
    expect(() => toCompleteSessionInput(form)).toThrow(message);
  });

  it("结构化内容不合法时抛出可读错误", () => {
    const form = createSessionRecordForm(session());
    form.actualWorkout = { ...plannedWorkout, goal: "" } as Workout;

    expect(() => toCompleteSessionInput(form)).toThrowError();
  });

  it("重置回计划内容后与计划彻底解耦", () => {
    const form = createSessionRecordForm(session({ seq: 1, plannedWorkout: undefined }));
    form.adjustActualWorkout = true;

    // 没有计划内容时重置到空，而不是报错
    resetActualWorkoutToPlan(form);
    expect(form.actualWorkout).toBeUndefined();
    expect(form.adjustActualWorkout).toBe(false);

    const planned = createSessionRecordForm(session());
    planned.adjustActualWorkout = true;
    planned.actualWorkout = { ...plannedWorkout, goal: "临时改的" };
    resetActualWorkoutToPlan(planned);

    expect(planned.adjustActualWorkout).toBe(false);
    expect(planned.actualWorkout).toEqual(plannedWorkout);
    planned.actualWorkout!.goal = "再改一次";
    expect(plannedWorkout.goal).toBe("有氧耐力");
  });
});
