import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import WorkoutEditorPanel from "../src/views/WorkoutEditorPanel.vue";

const ButtonStub = {
  emits: ["click"],
  template: "<button @click=\"$emit('click')\"><slot /></button>",
};

function mountPanel(modelValue = { goal: "恢复", segments: [] }) {
  return mount(WorkoutEditorPanel, {
    props: { modelValue },
    global: {
      stubs: {
        "t-button": ButtonStub,
        "t-form": { template: "<form><slot /></form>" },
        "t-form-item": { template: "<label><slot /></label>" },
        "t-input": { template: "<input />" },
        "t-card": { template: "<section><slot /></section>" },
        SegmentEditor: true,
      },
    },
  });
}

function lastModel(wrapper) {
  return wrapper.emitted("update:modelValue").at(-1)[0];
}

describe("WorkoutEditorPanel", () => {
  it("adds a default structured step", async () => {
    const wrapper = mountPanel();

    await wrapper.get('[data-testid="add-workout-step"]').trigger("click");

    expect(lastModel(wrapper).segments).toEqual([{
      kind: "step",
      intensity: { type: "pace", zone: "T" },
      load: { type: "time", minutes: 5 },
    }]);
  });

  it("copies and removes a segment through the shared segment editor", async () => {
    const workout = {
      goal: "恢复",
      segments: [{ kind: "step", intensity: { type: "pace", zone: "E" }, load: { type: "time", minutes: 30 } }],
    };
    const wrapper = mountPanel(workout);
    const editor = wrapper.getComponent({ name: "SegmentEditor" });

    editor.vm.$emit("copy", [0]);
    await wrapper.vm.$nextTick();
    const copied = lastModel(wrapper);
    expect(copied.segments).toHaveLength(2);
    expect(copied.segments[1]).toEqual(copied.segments[0]);
    expect(copied.segments[1]).not.toBe(copied.segments[0]);

    await wrapper.setProps({ modelValue: copied });
    wrapper.getComponent({ name: "SegmentEditor" }).vm.$emit("remove", [0]);
    await wrapper.vm.$nextTick();
    expect(lastModel(wrapper).segments).toHaveLength(1);
  });
});
