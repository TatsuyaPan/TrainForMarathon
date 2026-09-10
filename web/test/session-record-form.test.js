import { describe, expect, it } from "vitest";
import { createSessionRecordForm, toCompleteSessionInput } from "../src/session-record-form.js";

const plannedWorkout = {
  goal: "有氧耐力",
  segments: [{ kind: "step", intensity: { type: "pace", zone: "E" }, load: { type: "distance", meters: 8000 } }],
};

function session(overrides = {}) {
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

describe("session record form", () => {
  it("starts a planned session with an isolated copy of its planned workout", () => {
    const form = createSessionRecordForm(session());

    expect(form.adjustActualWorkout).toBe(false);
    expect(form.actualWorkout).toEqual(plannedWorkout);
    expect(form.actualWorkout).not.toBe(plannedWorkout);
    form.actualWorkout.goal = "修改副本";
    expect(plannedWorkout.goal).toBe("有氧耐力");
  });

  it("restores the unique record when editing a completed session", () => {
    const actualWorkout = { goal: "实际改为节奏跑", segments: plannedWorkout.segments };
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

  it("allows an extra session to start without structured content", () => {
    const form = createSessionRecordForm(session({ seq: 1, plannedWorkout: undefined }));

    expect(form.actualWorkout).toBeUndefined();
    expect(form.adjustActualWorkout).toBe(false);
  });

  it("normalizes valid optional fields into one completion payload", () => {
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

  it.each([
    [{ distanceKm: 0 }, "距离"],
    [{ durationMinutes: -1 }, "时长"],
    [{ rpe: 11 }, "RPE"],
    [{ rpe: 6.5 }, "RPE"],
  ])("rejects invalid completion values %o", (values, message) => {
    const form = createSessionRecordForm(session());
    Object.assign(form, values);
    expect(() => toCompleteSessionInput(form)).toThrow(message);
  });
});
