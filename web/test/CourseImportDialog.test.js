import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import CourseImportDialog from "../src/components/CourseImportDialog.vue";
import { COURSE_LIBRARY_KEY } from "../src/stores/course-library.js";

const ButtonStub = {
  props: ["disabled"],
  emits: ["click"],
  template: "<button :disabled=\"disabled\" @click=\"$emit('click')\"><slot /></button>",
};

function mountDialog() {
  return mount(CourseImportDialog, {
    props: { visible: true },
    global: { stubs: { "t-button": ButtonStub } },
  });
}

describe("CourseImportDialog", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("renders nothing while closed", () => {
    const wrapper = mount(CourseImportDialog, {
      props: { visible: false },
      global: { stubs: { "t-button": ButtonStub } },
    });
    expect(wrapper.find('[data-testid="import-dialog"]').exists()).toBe(false);
  });

  it("disables the confirm action for empty input", () => {
    const wrapper = mountDialog();
    expect(wrapper.get('[data-testid="import-confirm"]').attributes("disabled")).toBeDefined();
  });

  it("shows a line/column error and persists nothing when parsing fails", async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-testid="import-textarea"]').setValue("GOAL:有氧基础\nMS:40min@H");
    await wrapper.get('[data-testid="import-confirm"]').trigger("click");

    const error = wrapper.get('[data-testid="import-error"]').text();
    expect(error).toContain("第 2 行");
    expect(wrapper.find('[data-testid="import-summary"]').exists()).toBe(false);
    expect(wrapper.emitted("submit")).toBeUndefined();
    expect(window.localStorage.getItem(COURSE_LIBRARY_KEY)).toBeNull();
  });

  it("rejects a second document instead of guessing", async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-testid="import-textarea"]').setValue("GOAL:有氧基础\nMS:40min@E\nGOAL:另一份课程\nMS:10min@E");
    await wrapper.get('[data-testid="import-confirm"]').trigger("click");

    expect(wrapper.get('[data-testid="import-error"]').text()).toContain("GOAL");
    expect(wrapper.emitted("submit")).toBeUndefined();
  });

  it("previews a valid minimal course and submits the parsed workout", async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-testid="import-textarea"]').setValue("GOAL:有氧基础\nMS:40min@E");

    expect(wrapper.get('[data-testid="import-summary"]').text()).toContain("1 个阶段");
    await wrapper.get('[data-testid="import-confirm"]').trigger("click");

    const submitted = wrapper.emitted("submit")[0][0];
    expect(submitted.goal).toBe("有氧基础");
    expect(window.localStorage.getItem(COURSE_LIBRARY_KEY)).toBeNull();
  });

  it("accepts an explicit version declaration", async () => {
    const wrapper = mountDialog();
    await wrapper.get('[data-testid="import-textarea"]').setValue("WORKOUT/1\nTITLE:T 跑\nGOAL:乳酸阈能力\nMS:20min@T");
    await wrapper.get('[data-testid="import-confirm"]').trigger("click");

    expect(wrapper.emitted("submit")[0][0].dslVersion).toBe(1);
  });
});
