import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { parseWorkoutDsl } from "@core";
import CourseStructureEditor from "../src/components/CourseStructureEditor.vue";

function mountEditor(dsl) {
  return mount(CourseStructureEditor, { props: { workout: parseWorkoutDsl(dsl) } });
}

function lastWorkout(wrapper) {
  return wrapper.emitted("update:workout").at(-1)[0];
}

function buttonWith(wrapper, label) {
  const button = wrapper.findAll("button").find((entry) => entry.text() === label);
  if (!button) throw new Error(`找不到按钮：${label}`);
  return button;
}

function mainSegments(workout) {
  return workout.phases.find((phase) => phase.role === "main").segments;
}

describe("CourseStructureEditor", () => {
  it("adds a default run step to the main phase", async () => {
    const wrapper = mountEditor("GOAL:有氧基础\nMS:40min@E");
    await wrapper.get('[data-testid="add-run-MS"]').trigger("click");

    const segments = mainSegments(lastWorkout(wrapper));
    expect(segments).toHaveLength(2);
    expect(segments[1]).toMatchObject({ kind: "run", load: { type: "time", seconds: 300 }, target: { zone: "T" } });
  });

  it("adds a recovery step and a rest step", async () => {
    const wrapper = mountEditor("GOAL:有氧基础\nMS:40min@E");
    await wrapper.get('[data-testid="add-recovery"]').trigger("click");
    await wrapper.setProps({ workout: lastWorkout(wrapper) });
    await wrapper.get('[data-testid="add-rest"]').trigger("click");

    const segments = mainSegments(lastWorkout(wrapper));
    expect(segments[1].kind).toBe("recovery");
    expect(segments[2].kind).toBe("rest");
  });

  it("adds a nested loop inside an existing loop at the correct path", async () => {
    const wrapper = mountEditor("GOAL:混合刺激\nMS:3x(5min@T+90s@jog)");
    await buttonWith(wrapper, "+ 嵌套循环").trigger("click");

    const root = mainSegments(lastWorkout(wrapper))[0];
    expect(root.kind).toBe("repeat");
    expect(root.segments).toHaveLength(3);
    expect(root.segments[2].kind).toBe("repeat");
    expect(root.segments[0]).toMatchObject({ kind: "run", load: { type: "time", seconds: 300 } });
  });

  it("adds a nested run step inside a loop, not into the phase", async () => {
    const wrapper = mountEditor("GOAL:混合刺激\nMS:3x(5min@T+90s@jog)");
    const repeatBox = wrapper.get('[data-testid="editor-repeat"]');
    const nestedRun = repeatBox.findAll("button").find((entry) => entry.text() === "+ 跑步");
    await nestedRun.trigger("click");

    const root = mainSegments(lastWorkout(wrapper))[0];
    expect(root.segments).toHaveLength(3);
    expect(root.segments[2]).toMatchObject({ kind: "run", target: { type: "daniels", zone: "T" } });
    // 阶段本身没有被改动
    expect(lastWorkout(wrapper).phases[0].segments).toHaveLength(1);
  });

  it("reorders, duplicates and removes steps through pure structure operations", async () => {
    const wrapper = mountEditor("GOAL:混合刺激\nMS:5min@T+90s@jog");

    await buttonWith(wrapper, "↓").trigger("click");
    const moved = mainSegments(lastWorkout(wrapper));
    expect(moved[0].kind).toBe("recovery");
    expect(moved[1].kind).toBe("run");
  });

  it("duplicates a loop with all of its children", async () => {
    const wrapper = mountEditor("GOAL:混合刺激\nMS:3x(5min@T+90s@jog)");
    await buttonWith(wrapper, "复制").trigger("click");

    const segments = mainSegments(lastWorkout(wrapper));
    expect(segments).toHaveLength(2);
    expect(segments[1]).toEqual(segments[0]);
    expect(segments[1]).not.toBe(segments[0]);
  });

  it("removes a step", async () => {
    const wrapper = mountEditor("GOAL:混合刺激\nMS:5min@T+90s@jog");
    await buttonWith(wrapper, "删除").trigger("click");

    const segments = mainSegments(lastWorkout(wrapper));
    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe("recovery");
  });

  it("changes the repeat count", async () => {
    const wrapper = mountEditor("GOAL:混合刺激\nMS:3x(5min@T+90s@jog)");
    const input = wrapper.get('input[type="number"]');
    await input.setValue("6");
    await input.trigger("change");

    expect(mainSegments(lastWorkout(wrapper))[0].repetitions).toBe(6);
  });

  it("adds and removes warmup/cooldown phases", async () => {
    const wrapper = mountEditor("GOAL:有氧基础\nMS:40min@E");
    await wrapper.get('[data-testid="add-warmup-phase"]').trigger("click");

    const withWarmup = lastWorkout(wrapper);
    expect(withWarmup.phases.map((phase) => phase.role)).toEqual(["warmup", "main"]);
    await wrapper.setProps({ workout: withWarmup });

    await wrapper.get('[data-testid="remove-phase-WU"]').trigger("click");
    expect(lastWorkout(wrapper).phases.map((phase) => phase.role)).toEqual(["main"]);
  });
});
