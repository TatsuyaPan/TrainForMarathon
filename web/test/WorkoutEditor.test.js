import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import WorkoutEditor from "../src/components/WorkoutEditor.vue";

const runStep = {
  kind: "run",
  load: { type: "time", seconds: 1800 },
  target: { type: "daniels", zone: "E" },
};

const workout = {
  dslVersion: 1,
  goal: "有氧基础",
  phases: [{ role: "main", segments: [runStep] }],
};

const repeatWorkout = {
  dslVersion: 1,
  goal: "乳酸阈能力",
  phases: [{ role: "main", segments: [{ kind: "repeat", repetitions: 4, segments: [runStep] }] }],
};

function mountEditor(value = workout) {
  return mount(WorkoutEditor, { props: { workout: value }, attachTo: document.body });
}

describe("WorkoutEditor 键盘与焦点", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the focused editor with the keyboard and moves focus into it", async () => {
    const wrapper = mountEditor();
    const row = wrapper.get('[data-segment-path="0-0"]');
    row.element.focus();

    await row.trigger("keydown.enter");
    await nextTick();

    const panel = wrapper.get('[data-testid="focused-editor"]');
    expect(panel.attributes("role")).toBe("dialog");
    expect(document.activeElement).toBe(panel.element);
    wrapper.unmount();
  });

  it("closes with Escape and returns focus to the originating step", async () => {
    const wrapper = mountEditor();
    const row = wrapper.get('[data-segment-path="0-0"]');
    row.element.focus();
    await row.trigger("keydown.enter");
    await nextTick();

    await wrapper.get('[data-testid="focused-editor"]').trigger("keydown.esc");
    await nextTick();

    expect(wrapper.find('[data-testid="focused-editor"]').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('[data-segment-path="0-0"]').element);
    wrapper.unmount();
  });

  it("returns focus to the step after closing with the close button", async () => {
    const wrapper = mountEditor();
    const row = wrapper.get('[data-segment-path="0-0"]');
    await row.trigger("click");
    await nextTick();

    await wrapper.get('[data-testid="step-editor"]').get("button[aria-label='关闭步骤编辑']").trigger("click");
    await nextTick();

    expect(document.activeElement).toBe(wrapper.get('[data-segment-path="0-0"]').element);
    wrapper.unmount();
  });

  it("makes repeat blocks selectable so their settings are reachable", async () => {
    const wrapper = mountEditor(repeatWorkout);
    const repeatSettings = wrapper.get('[data-segment-path="0-0"]');
    // 循环设置是真正的按钮，键盘激活由原生语义保证
    expect(repeatSettings.element.tagName).toBe("BUTTON");
    expect(repeatSettings.attributes("data-testid")).toBeUndefined();

    await repeatSettings.trigger("keydown.enter");
    await nextTick();

    expect(wrapper.get('[data-testid="step-editor"]').text()).toContain("重复次数");
    wrapper.unmount();
  });

  it("keeps row actions out of the step selection target", async () => {
    const wrapper = mountEditor();
    const row = wrapper.get('[data-testid="segment-row-0"]');
    expect(row.element.tagName).toBe("BUTTON");

    // 操作按钮是选中主体的兄弟节点，不在按钮内部
    await wrapper.get(".segment-row button[title='上移']").trigger("click");
    await nextTick();

    expect(wrapper.emitted("update:workout")).toBeTruthy();
    expect(wrapper.emitted("update:selectedPath")).toBeUndefined();
    expect(wrapper.find('[data-testid="focused-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
