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

describe("WorkoutEditor 行内展开与焦点", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("键盘打开行内编辑并把焦点移进去", async () => {
    const wrapper = mountEditor();
    const row = wrapper.get('[data-segment-path="0-0"]');
    row.element.focus();

    await row.trigger("keydown.enter");
    await nextTick();
    await nextTick();

    const panel = wrapper.get('[data-testid="inline-step-editor"]');
    expect(panel.attributes("role")).toBe("region");
    expect(panel.attributes("aria-expanded")).toBeUndefined();
    expect(document.activeElement).toBe(panel.element);
    wrapper.unmount();
  });

  it("Escape 收起并把焦点还给原步骤", async () => {
    const wrapper = mountEditor();
    const row = wrapper.get('[data-segment-path="0-0"]');
    row.element.focus();
    await row.trigger("keydown.enter");
    await nextTick();
    await nextTick();

    await wrapper.get('[data-testid="inline-step-editor"]').trigger("keydown.esc");
    await nextTick();

    expect(wrapper.find('[data-testid="inline-step-editor"]').exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.get('[data-segment-path="0-0"]').element);
    wrapper.unmount();
  });

  it("关闭按钮收起后焦点回到原步骤", async () => {
    const wrapper = mountEditor();
    const row = wrapper.get('[data-segment-path="0-0"]');
    await row.trigger("click");
    await nextTick();
    await nextTick();

    await wrapper.get('[data-testid="step-editor"]').get("button[aria-label='关闭步骤编辑']").trigger("click");
    await nextTick();

    expect(document.activeElement).toBe(wrapper.get('[data-segment-path="0-0"]').element);
    wrapper.unmount();
  });

  it("再点一次行就能收起（toggle）", async () => {
    const wrapper = mountEditor();
    const row = wrapper.get('[data-segment-path="0-0"]');
    await row.trigger("click");
    await nextTick();
    await nextTick();
    expect(wrapper.find('[data-testid="inline-step-editor"]').exists()).toBe(true);

    await row.trigger("click");
    await nextTick();
    expect(wrapper.find('[data-testid="inline-step-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("行内编辑字段变化通过 update 命令写回课表", async () => {
    const wrapper = mountEditor();
    const row = wrapper.get('[data-segment-path="0-0"]');
    await row.trigger("click");
    await nextTick();
    await nextTick();

    await wrapper.get('[data-testid="load-amount"]').setValue("45");
    await nextTick();

    const published = wrapper.emitted("update:workout").at(-1)[0];
    expect(published.phases[0].segments[0].load.seconds).toBe(2700);
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
    expect(wrapper.find('[data-testid="inline-step-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
