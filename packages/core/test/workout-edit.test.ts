import { describe, expect, it } from "vitest";
import {
  addPhase,
  canMoveSegmentTo,
  createDefaultWorkout,
  createRecoveryStep,
  createRepeatBlock,
  createRestStep,
  createRunStep,
  duplicateSegment,
  insertSegment,
  isDescendantPath,
  moveSegment,
  moveSegmentTo,
  removePhase,
  removeSegment,
  replaceSegment,
  segmentAt,
  updateSegment,
} from "../src/dsl/edit.js";
import type { Workout, WorkoutSegment } from "../src/domain.js";

function withPhases(): Workout {
  return addPhase(addPhase(createDefaultWorkout(), "warmup"), "cooldown");
}

describe("课程结构编辑（纯函数）", () => {
  it("默认草稿：MS + 30 分钟 E，训练目的为空", () => {
    const workout = createDefaultWorkout();
    expect(workout.dslVersion).toBe(1);
    expect(workout.goal).toBe("");
    expect(workout.phases.map((phase) => phase.role)).toEqual(["main"]);
    expect(workout.phases[0].segments[0]).toEqual({
      kind: "run",
      load: { type: "time", seconds: 1800 },
      target: { type: "daniels", zone: "E" },
    });
  });

  it("阶段增删保持固定顺序，主训练不可删除", () => {
    const workout = withPhases();
    expect(workout.phases.map((phase) => phase.role)).toEqual(["warmup", "main", "cooldown"]);
    expect(addPhase(workout, "main").phases).toHaveLength(3);
    expect(removePhase(workout, "main").phases).toHaveLength(3);
    expect(removePhase(workout, "warmup").phases.map((phase) => phase.role)).toEqual(["main", "cooldown"]);
  });

  it("插入、替换、更新、复制与删除分部", () => {
    const base = withPhases();
    const inserted = insertSegment(base, [1], 0, createRecoveryStep());
    expect(inserted.phases[1].segments).toHaveLength(2);
    expect(inserted.phases[1].segments[0].kind).toBe("recovery");
    expect(base.phases[1].segments).toHaveLength(1); // 原对象不变

    const replaced = replaceSegment(inserted, [1, 1], createRestStep({ durationSeconds: 60 }));
    expect(segmentAt(replaced, [1, 1])).toEqual({ kind: "rest", durationSeconds: 60 });

    const updated = updateSegment(replaced, [1, 0], (segment) => ({ ...segment, note: "放松" }));
    expect(segmentAt(updated, [1, 0])).toMatchObject({ note: "放松" });

    const duplicated = duplicateSegment(updated, [1, 0]);
    expect(duplicated.phases[1].segments).toHaveLength(3);
    expect(duplicated.phases[1].segments[1]).toEqual(duplicated.phases[1].segments[0]);
    expect(duplicated.phases[1].segments[1]).not.toBe(duplicated.phases[1].segments[0]);

    const removed = removeSegment(duplicated, [1, 0]);
    expect(removed.phases[1].segments).toHaveLength(2);
  });

  it("同一父容器内上下移动，跨阶段移动保持步骤类型", () => {
    const workout = insertSegment(withPhases(), [1], 1, createRecoveryStep());
    const moved = moveSegment(workout, [1, 0], 1);
    expect(moved.phases[1].segments.map((segment) => segment.kind)).toEqual(["recovery", "run"]);
    expect(moveSegment(moved, [1, 0], -1)).toEqual(moved); // 越界不动

    const crossed = moveSegmentTo(moved, [1, 1], [2], 0);
    expect(crossed.phases[1].segments.map((segment) => segment.kind)).toEqual(["recovery"]);
    expect(crossed.phases[2].segments.map((segment) => segment.kind)).toEqual(["run", "run"]);
  });

  it("循环不能移动到自身内部", () => {
    const workout = insertSegment(withPhases(), [1], 1, createRepeatBlock());
    expect(isDescendantPath([1, 0], [1, 0, 0])).toBe(true);
    expect(isDescendantPath([1, 0], [1, 1])).toBe(false);
    expect(() => moveSegmentTo(workout, [1, 1], [1, 1, 0], 0)).toThrowError(/不能把循环移动到它自己的内部/);
    expect(canMoveSegmentTo(workout, [1, 1], [1, 1, 0])).toBe(false);
    expect(canMoveSegmentTo(workout, [1, 1], [1], 0)).toBe(true);
  });

  it("跨容器移动不会突破 10 层嵌套", () => {
    let nested: WorkoutSegment = createRunStep("main");
    for (let index = 0; index < 10; index += 1) {
      nested = { kind: "repeat", repetitions: 2, segments: [nested] };
    }
    const deep = insertSegment(replaceSegment(withPhases(), [1, 0], nested), [1], 1, createRepeatBlock());
    // 最内层循环的路径：阶段 1 → 连续 10 层循环
    const innermost = [1, ...Array<number>(10).fill(0)];
    expect(() => moveSegmentTo(deep, [1, 1], innermost, 0)).toThrowError(/循环嵌套不能超过 10 层/);
    expect(canMoveSegmentTo(deep, [1, 1], innermost)).toBe(false);
    expect(canMoveSegmentTo(deep, [1, 1], [1, 0], 0)).toBe(true);
  });

  it("插入与替换也不会突破 10 层嵌套", () => {
    let nested: WorkoutSegment = createRunStep("main");
    for (let index = 0; index < 10; index += 1) {
      nested = { kind: "repeat", repetitions: 2, segments: [nested] };
    }
    const atLimit = replaceSegment(withPhases(), [1, 0], nested);
    // 第 10 层循环内部的容器：路径为阶段 + 连续 10 层循环
    const innermostContainer = [1, ...Array<number>(10).fill(0)];
    const innermostStep = [...innermostContainer, 0];

    expect(() => insertSegment(atLimit, innermostContainer, 0, createRepeatBlock())).toThrowError(
      /循环嵌套不能超过 10 层/,
    );
    expect(() => replaceSegment(atLimit, innermostStep, createRepeatBlock())).toThrowError(
      /循环嵌套不能超过 10 层/,
    );
    // 同一位置放普通步骤不受影响：深度上限只约束循环
    expect(insertSegment(atLimit, innermostContainer, 0, createRunStep("main"))).toBeTruthy();
    expect(replaceSegment(atLimit, innermostStep, createRecoveryStep())).toBeTruthy();
    // 越界被拒绝时原对象保持不变
    expect(segmentAt(atLimit, innermostStep)?.kind).toBe("run");
  });

  it("非法路径给出明确错误", () => {
    const workout = withPhases();
    expect(() => removeSegment(workout, [1, 5])).toThrowError(/路径无效/);
    expect(() => insertSegment(workout, [9], 0, createRecoveryStep())).toThrowError(/阶段不存在/);
    expect(segmentAt(workout, [1, 5])).toBeUndefined();
  });
});
