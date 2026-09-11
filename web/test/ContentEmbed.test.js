import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import ContentEmbed from "../src/components/ContentEmbed.vue";
import CourseCard from "../src/components/CourseCard.vue";
import { getLibraryCourse } from "@core";
import { invalidateAthlete } from "../src/app-context.js";
import { readCourseLibrary } from "../src/stores/course-library.js";

const ATHLETE_KEY = "tfm:athletes:current";

const ButtonStub = {
  props: ["disabled"],
  emits: ["click"],
  template: "<button :disabled=\"disabled\" @click=\"$emit('click')\"><slot /></button>",
};

function mountEmbed(embed) {
  return mount(ContentEmbed, {
    props: { embed },
    global: { stubs: { "t-button": ButtonStub } },
  });
}

function seedAthlete(fields = {}) {
  window.localStorage.clear();
  window.localStorage.setItem(
    ATHLETE_KEY,
    JSON.stringify({
      id: "local-test",
      provider: "local",
      schemaVersion: 1,
      maxWeeklyKm: 60,
      thresholdPaceSecondsPerKm: 240,
      isBeginner: false,
      createdAt: "2026-09-10T08:00:00.000Z",
      updatedAt: "2026-09-10T08:00:00.000Z",
      ...fields,
    }),
  );
  invalidateAthlete();
}

describe("ContentEmbed（文章动态嵌入）", () => {
  afterEach(() => {
    window.localStorage.clear();
    invalidateAthlete();
  });

  it("courses：渲染课程卡列表，含出处链接", () => {
    const wrapper = mountEmbed({
      type: "embed",
      kind: "courses",
      afterHeading: "一些可以被选择的T跑训练",
      courseIds: ["t-20min", "t-2k-x5"],
    });
    expect(wrapper.findAll('[data-testid^="embed-course-"]')).toHaveLength(2);
    expect(wrapper.get('[data-testid="embed-course-t-20min"]').text()).toContain("20 分钟阈值连续跑");
    const source = wrapper.get('[data-testid="embed-course-t-20min"]').find(".embed-source");
    expect(source.exists()).toBe(true);
    expect(source.attributes("href")).toContain("training-types%2Fthreshold");
  });

  it("courses：收藏到课程库写入自定义课程", async () => {
    const wrapper = mountEmbed({
      type: "embed",
      kind: "courses",
      afterHeading: "一些可用的I跑训练课表",
      courseIds: ["i-yasso-800"],
    });
    await wrapper.get('[data-testid="save-course-i-yasso-800"]').trigger("click");
    const courses = readCourseLibrary().courses;
    expect(courses).toHaveLength(1);
    expect(courses[0].workout.title).toContain("亚索");
    expect(courses[0].source).toContain("复制自");
    expect(courses[0].sourceContentId).toBe("training-types/interval");
    expect(wrapper.text()).toContain("已收藏");
  });

  it("plan：渲染计划预览表与采用按钮", () => {
    const wrapper = mountEmbed({
      type: "embed",
      kind: "plan",
      afterHeading: "训练计划",
      planId: "20-week",
    });
    expect(wrapper.get('[data-testid="embed-plan"]').text()).toContain("典型 20 周训练计划");
    expect(wrapper.get('[data-testid="embed-plan"]').text()).toContain("20 周");
    expect(wrapper.findAll(".plan-table tbody tr")).toHaveLength(20);
    expect(wrapper.get(".plan-table").text()).toContain("基础期");
    expect(wrapper.get('[data-testid="use-plan"]').exists()).toBe(true);
  });

  it("plan：未知模板不渲染表格", () => {
    const wrapper = mountEmbed({
      type: "embed",
      kind: "plan",
      afterHeading: "训练计划",
      planId: "not-exist",
    });
    expect(wrapper.find('[data-testid="embed-plan"]').exists()).toBe(false);
  });

  it("pace-table：未建立能力时显示引导", async () => {
    window.localStorage.clear();
    invalidateAthlete();
    const wrapper = mountEmbed({
      type: "embed",
      kind: "pace-table",
      afterHeading: "一个典型的配速表格及对应说明",
    });
    await flushPromises();
    expect(wrapper.get('[data-testid="embed-pace-table"]').text()).toContain("尚未建立能力基准");
    expect(wrapper.get('[data-testid="go-fitness"]').exists()).toBe(true);
  });

  it("pace-table：有基础能力时展示实时配速表", async () => {
    seedAthlete();
    const wrapper = mountEmbed({
      type: "embed",
      kind: "pace-table",
      afterHeading: "一个典型的配速表格及对应说明",
    });
    await flushPromises();
    const text = wrapper.get('[data-testid="embed-pace-table"]').text();
    expect(text).toContain("我的训练配速表");
    expect(text).toContain("最大摄氧量跑");
    expect(wrapper.find('[data-testid="go-fitness"]').exists()).toBe(false);
  });

  it("courses：引用了未知课程 id 时跳过", () => {
    const wrapper = mountEmbed({
      type: "embed",
      kind: "courses",
      afterHeading: "x",
      courseIds: ["not-exist", "t-20min"],
    });
    expect(wrapper.findAll('[data-testid^="embed-course-"]')).toHaveLength(1);
  });
});

describe("CourseCard 出处活链接", () => {
  it("内置课程展示出处链接", () => {
    const course = getLibraryCourse("i-yasso-800");
    const wrapper = mount(CourseCard, {
      props: { course },
      global: { stubs: { "t-button": ButtonStub } },
    });
    const link = wrapper.get('[data-testid="course-source-link"]');
    expect(link.text()).toContain("《最大摄氧量跑》");
    expect(link.attributes("href")).toContain("training-types%2Finterval");
  });

  it("无类型化出处的课程不显示链接", () => {
    const course = { ...getLibraryCourse("i-yasso-800"), sourceContentId: undefined };
    const wrapper = mount(CourseCard, {
      props: { course },
      global: { stubs: { "t-button": ButtonStub } },
    });
    expect(wrapper.find('[data-testid="course-source-link"]').exists()).toBe(false);
  });
});
