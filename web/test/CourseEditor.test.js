import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLibraryCourse, parseWorkoutDsl } from "@core";
import CourseEditor from "../src/views/CourseEditor.vue";
import { COURSE_LIBRARY_KEY, findCustomCourse, listCustomCourses } from "../src/stores/course-library.js";
import { setPendingDraft } from "../src/stores/course-draft.js";

const { push, replace, route } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  route: { params: {}, query: {} },
}));

vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => route,
}));

const ButtonStub = {
  props: ["disabled"],
  emits: ["click"],
  template: "<button :disabled=\"disabled\" @click=\"$emit('click')\"><slot /></button>",
};

async function mountEditor() {
  const wrapper = mount(CourseEditor, {
    global: {
      stubs: {
        "t-button": ButtonStub,
        "t-card": { template: "<section><slot /></section>" },
        "t-tag": { template: "<span><slot /></span>" },
      },
    },
  });
  // onMounted 里才准备草稿，等一次刷新后再断言
  await flushPromises();
  return wrapper;
}

function seedStoredCourse() {
  const course = createLibraryCourse({
    category: "T",
    workout: parseWorkoutDsl("TITLE:已有阈值课\nGOAL:乳酸阈能力\nMS:20min@T"),
  });
  window.localStorage.setItem(COURSE_LIBRARY_KEY, JSON.stringify([course]));
  return course;
}

describe("CourseEditor", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockReset();
    replace.mockReset();
    route.params = {};
    route.query = {};
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("starts a new draft with a required goal and refuses to save it empty", async () => {
    const wrapper = await mountEditor();

    expect(wrapper.get('[data-testid="editor-title"]').text()).toBe("新建课程");
    expect(wrapper.vm.$.setupState.draft.workout.phases).toHaveLength(1);

    await wrapper.get('[data-testid="save-course"]').trigger("click");

    expect(wrapper.get('[data-testid="goal-error"]').text()).toContain("训练目的");
    expect(listCustomCourses()).toEqual([]);
    expect(push).not.toHaveBeenCalled();
  });

  it("shows summary values without repeating the row label", async () => {
    const wrapper = await mountEditor();
    const rows = wrapper.findAll('[data-testid="editor-headline"] div');
    const rowFor = (label) => rows.find((row) => row.get("dt").text() === label);

    // 默认草稿是 30 分钟主训练：dd 只是数值，不应再带上「主训练」
    expect(rowFor("主训练").get("dd").text()).toBe("30 分钟");
    expect(wrapper.get('[data-testid="editor-headline"]').text()).not.toContain("30 分钟 主训练");
  });

  it("saves a validated course and returns to the library", async () => {
    const wrapper = await mountEditor();
    await wrapper.get('[data-testid="course-title"]').setValue("我的新课程");
    await wrapper.get('[data-testid="course-goal"]').setValue("有氧基础");
    await wrapper.get('[data-testid="course-category"]').setValue("E");
    await wrapper.get('[data-testid="save-course"]').trigger("click");

    const stored = listCustomCourses();
    expect(stored).toHaveLength(1);
    expect(stored[0].workout.title).toBe("我的新课程");
    expect(stored[0].category).toBe("E");
    expect(stored[0].tags).toEqual(["E"]);
    expect(push).toHaveBeenCalledWith({ path: "/library", query: { category: "E" } });
  });

  it("creates a draft from a pending import and infers the category", async () => {
    const workout = parseWorkoutDsl("TITLE:导入的 I 课\nGOAL:最大摄氧量\nWU:15min@E\nMS:8x(1000m@I+3min@jog)\nCD:10min@E");
    setPendingDraft(workout, "import");
    route.query = { source: "import" };

    const wrapper = await mountEditor();
    expect(wrapper.get('[data-testid="editor-title"]').text()).toBe("导入的 I 课");
    expect(wrapper.vm.$.setupState.draft.category).toBe("I");

    await wrapper.get('[data-testid="save-course"]').trigger("click");
    expect(listCustomCourses()[0].workout.phases).toHaveLength(3);
  });

  it("returns to the library when a copy/import draft is missing after a refresh", async () => {
    route.query = { source: "copy" };
    const wrapper = await mountEditor();

    expect(wrapper.text()).toContain("草稿已失效");
    expect(replace).toHaveBeenCalledWith({ path: "/library", query: { notice: "draft-lost" } });
  });

  it("edits an existing custom course in place", async () => {
    const existing = seedStoredCourse();
    route.params = { id: existing.id };

    const wrapper = await mountEditor();
    expect(wrapper.get('[data-testid="editor-title"]').text()).toBe("已有阈值课");

    await wrapper.get('[data-testid="course-goal"]').setValue("乳酸阈能力（提高）");
    await wrapper.get('[data-testid="save-course"]').trigger("click");

    const courses = listCustomCourses();
    expect(courses).toHaveLength(1);
    expect(courses[0].id).toBe(existing.id);
    expect(findCustomCourse(existing.id).workout.goal).toBe("乳酸阈能力（提高）");
  });

  it("shows nested repeats in the structure editor", async () => {
    const workout = parseWorkoutDsl("GOAL:混合刺激\nMS:3x(5x(400m@R+400m@jog)+3min@jog)");
    setPendingDraft(workout, "import");
    route.query = { source: "import" };

    const wrapper = await mountEditor();
    expect(wrapper.findAll('[data-testid="editor-repeat"]').length).toBe(2);
  });
});
