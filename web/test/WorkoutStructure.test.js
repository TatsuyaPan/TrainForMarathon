import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { createWorkoutPresentation, parseWorkoutDsl } from "@core";
import WorkoutStructure from "../src/components/WorkoutStructure.vue";

/** 结构树只读取 core 的展示数据，测试也从同一个来源构造 props */
function mountTree(dsl) {
  const workout = parseWorkoutDsl(dsl);
  const phase = createWorkoutPresentation(workout).phases.find((entry) => entry.role === "main");
  return mount(WorkoutStructure, { props: { nodes: phase.nodes } });
}

function visibleSteps(wrapper) {
  return wrapper.findAll('[data-testid^="structure-step-"]');
}

describe("课程结构树：循环折叠（展示层，不影响 AST）", () => {
  it("默认展开，循环内的步骤都渲染", () => {
    const wrapper = mountTree("GOAL:混合刺激\nMS:3x(5min@T+90s@jog)");

    expect(visibleSteps(wrapper)).toHaveLength(2);
    expect(wrapper.get('[data-testid="toggle-repeat-0.0"]').attributes("aria-expanded")).toBe("true");
  });

  it("收起再展开：子步骤随之隐藏与恢复", async () => {
    const wrapper = mountTree("GOAL:混合刺激\nMS:3x(5min@T+90s@jog)");
    const toggle = wrapper.get('[data-testid="toggle-repeat-0.0"]');

    await toggle.trigger("click");
    expect(visibleSteps(wrapper)).toHaveLength(0);
    expect(toggle.attributes("aria-expanded")).toBe("false");
    expect(wrapper.text()).toContain("已收起 2 个步骤");
    // 循环摘要始终可见，收起不会让人不知道这里是什么
    expect(wrapper.text()).toContain("重复 3 次");

    await toggle.trigger("click");
    expect(visibleSteps(wrapper)).toHaveLength(2);
    expect(toggle.attributes("aria-expanded")).toBe("true");
  });

  it("同级的多个循环各自独立折叠", async () => {
    const wrapper = mountTree("GOAL:混合刺激\nMS:3x(5min@T+90s@jog)+4x(400m@R+400m@jog)");

    await wrapper.get('[data-testid="toggle-repeat-0.0"]').trigger("click");

    // 第一个循环收起后，只有它的子步骤消失
    expect(visibleSteps(wrapper).map((step) => step.attributes("data-testid"))).toEqual([
      "structure-step-0.1.0",
      "structure-step-0.1.1",
    ]);
    expect(wrapper.get('[data-testid="toggle-repeat-0.1"]').attributes("aria-expanded")).toBe("true");
  });

  it("嵌套循环可以只收起内层", async () => {
    const wrapper = mountTree("GOAL:嵌套\nMS:3x(2x(1min@I+1min@jog)+5min@T)");
    expect(visibleSteps(wrapper)).toHaveLength(3);

    await wrapper.get('[data-testid="toggle-repeat-0.0.0"]').trigger("click");

    // 内层收起后只剩外层里的 5 分钟 T
    expect(visibleSteps(wrapper).map((step) => step.attributes("data-testid"))).toEqual([
      "structure-step-0.0.1",
    ]);
    expect(wrapper.get('[data-testid="toggle-repeat-0.0"]').attributes("aria-expanded")).toBe("true");
  });
});
