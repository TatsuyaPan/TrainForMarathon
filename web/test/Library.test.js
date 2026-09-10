import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLibraryCourse, parseWorkoutDsl } from "@core";
import Library from "../src/views/Library.vue";
import { COURSE_LIBRARY_KEY, listCustomCourses } from "../src/stores/course-library.js";
import { peekPendingDraft } from "../src/stores/course-draft.js";

const { push, route } = vi.hoisted(() => ({ push: vi.fn(), route: { query: {} } }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }), useRoute: () => route }));

const ButtonStub = {
  props: ["disabled"],
  emits: ["click"],
  template: "<button :disabled=\"disabled\" @click=\"$emit('click')\"><slot /></button>",
};

function customCourse(overrides = {}) {
  return createLibraryCourse({
    category: "T",
    workout: parseWorkoutDsl("TITLE:我的阈值课\nGOAL:乳酸阈能力\nMS:20min@T"),
    ...overrides,
  });
}

function mountLibrary() {
  return mount(Library, {
    global: {
      stubs: {
        "t-button": ButtonStub,
        "t-card": { template: "<section><slot /></section>" },
        "t-tag": { template: "<span><slot /></span>" },
      },
    },
  });
}

describe("Library", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockReset();
    route.query = {};
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("lists built-in courses for the default category", () => {
    const wrapper = mountLibrary();
    const cards = wrapper.findAll('[data-testid="course-card"]');

    expect(cards.length).toBeGreaterThan(0);
    expect(wrapper.text()).toContain("8 分钟阈值跑 ×6");
    expect(wrapper.find('[data-testid="course-dsl"]').exists()).toBe(false);
  });

  it("filters by category", async () => {
    const wrapper = mountLibrary();
    await wrapper.get('[data-testid="category-I"]').trigger("click");

    expect(wrapper.text()).toContain("亚索 800");
    expect(wrapper.find('[data-testid="custom-empty"]').exists()).toBe(true);
  });

  it("routes to a fresh course editor", async () => {
    const wrapper = mountLibrary();
    await wrapper.get('[data-testid="new-course"]').trigger("click");

    expect(push).toHaveBeenCalledWith({ path: "/library/new" });
  });

  it("copies a built-in course into a draft without persisting it", async () => {
    const wrapper = mountLibrary();
    const first = wrapper.findAll('[data-testid="copy-course"]')[0];
    await first.trigger("click");

    const draft = peekPendingDraft();
    expect(draft.mode).toBe("copy");
    expect(draft.draft.origin).toBe("custom");
    expect(draft.draft.workout.title).toContain("（副本）");
    expect(listCustomCourses()).toEqual([]);
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ path: "/library/new" }));
  });

  it("shows a stored custom course under 我的课程", () => {
    window.localStorage.setItem(COURSE_LIBRARY_KEY, JSON.stringify([customCourse()]));
    const wrapper = mountLibrary();

    const cards = wrapper.findAll('[data-testid="course-card"]');
    expect(cards.length).toBeGreaterThan(1);
    expect(wrapper.text()).toContain("我的阈值课");
    expect(wrapper.find('[data-testid="custom-empty"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="edit-course"]').exists()).toBe(true);
  });

  it("deletes a custom course only after confirmation", async () => {
    const course = customCourse();
    window.localStorage.setItem(COURSE_LIBRARY_KEY, JSON.stringify([course]));
    const wrapper = mountLibrary();

    await wrapper.get('[data-testid="delete-course"]').trigger("click");
    expect(wrapper.get('[data-testid="delete-confirm"]').text()).toContain("我的阈值课");

    await wrapper.get('[data-testid="confirm-delete"]').trigger("click");
    expect(listCustomCourses()).toEqual([]);
    expect(wrapper.find('[data-testid="custom-empty"]').exists()).toBe(true);
  });

  it("keeps the course when the delete confirmation is dismissed", async () => {
    const course = customCourse();
    window.localStorage.setItem(COURSE_LIBRARY_KEY, JSON.stringify([course]));
    const wrapper = mountLibrary();

    await wrapper.get('[data-testid="delete-course"]').trigger("click");
    await wrapper.findAll("button").find((button) => button.text() === "取消").trigger("click");

    expect(listCustomCourses()).toHaveLength(1);
    expect(wrapper.find('[data-testid="delete-confirm"]').exists()).toBe(false);
  });

  it("surfaces broken local data and can clear it", async () => {
    window.localStorage.setItem(COURSE_LIBRARY_KEY, "{broken");
    const wrapper = mountLibrary();

    expect(wrapper.get('[data-testid="library-error"]').text()).toContain("损坏");
    await wrapper.get('[data-testid="clear-invalid"]').trigger("click");

    expect(window.localStorage.getItem(COURSE_LIBRARY_KEY)).toBeNull();
    expect(wrapper.find('[data-testid="library-error"]').exists()).toBe(false);
  });

  it("explains an expired import/copy draft", () => {
    route.query = { notice: "draft-lost" };
    const wrapper = mountLibrary();

    expect(wrapper.get('[data-testid="library-notice"]').text()).toContain("已失效");
  });

  it("opens on the category requested by the editor after saving", () => {
    const course = createLibraryCourse({
      category: "mixed",
      workout: parseWorkoutDsl("GOAL:轻松有氧\nMS:30min@E"),
    });
    window.localStorage.setItem(COURSE_LIBRARY_KEY, JSON.stringify([course]));
    route.query = { category: "mixed" };

    const wrapper = mountLibrary();

    expect(wrapper.get('[data-testid="category-mixed"]').attributes("aria-pressed")).toBe("true");
    expect(wrapper.text()).toContain(course.workout.goal);
  });
});
