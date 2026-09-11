import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import Course from "../src/views/Course.vue";
import { invalidateAthlete } from "../src/app-context.js";

const CardStub = { template: "<div><slot /></div>" };
const TitleStub = { template: "<h4><slot /></h4>" };
const ButtonStub = {
  emits: ["click"],
  template: "<button @click=\"$emit('click')\"><slot /></button>",
};

function mountCourse(id) {
  return mount(Course, {
    props: { id },
    global: { stubs: { "t-card": CardStub, "t-typography-title": TitleStub, "t-button": ButtonStub } },
  });
}

describe("课程文章页的动态嵌入", () => {
  afterEach(() => {
    window.localStorage.clear();
    invalidateAthlete();
  });

  it("课表文章渲染活课程卡列表，DSL 代码块不再以代码形式出现", async () => {
    const wrapper = mountCourse("training-types/threshold");
    await flushPromises();
    expect(wrapper.find('[data-testid="embed-course-t-20min"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="embed-course-"]')).toHaveLength(6);
    expect(wrapper.findAll("pre.doc-code")).toHaveLength(0);
    expect(wrapper.text()).toContain("一些可以被选择的T跑训练");
  });

  it("计划文章渲染计划预览", async () => {
    const wrapper = mountCourse("plans/20-week");
    await flushPromises();
    expect(wrapper.find('[data-testid="embed-plan"]').exists()).toBe(true);
    expect(wrapper.find(".plan-table").text()).toContain("基础期");
    expect(wrapper.find('[data-testid="use-plan"]').exists()).toBe(true);
  });

  it("配速基准文章渲染实时配速表嵌入", async () => {
    const wrapper = mountCourse("training-types/pace-baseline");
    await flushPromises();
    expect(wrapper.find('[data-testid="embed-pace-table"]').exists()).toBe(true);
  });

  it("无嵌入关系的文章不受影响", async () => {
    const wrapper = mountCourse("foundations/logic");
    await flushPromises();
    expect(wrapper.find('[data-testid^="embed-"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("渐进超负荷");
  });
});
