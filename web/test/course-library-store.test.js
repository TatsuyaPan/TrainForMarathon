import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLibraryCourse, parseWorkoutDsl } from "@core";
import {
  COURSE_LIBRARY_KEY,
  clearCourseLibrary,
  findCustomCourse,
  listCustomCourses,
  readCourseLibrary,
  removeCustomCourse,
  upsertCustomCourse,
} from "../src/stores/course-library.js";

function course(overrides = {}) {
  return createLibraryCourse({
    category: "T",
    workout: parseWorkoutDsl("TITLE:8 分钟阈值 ×6\nGOAL:乳酸阈能力\nMS:6x(8min@T+90s@jog)"),
    ...overrides,
  });
}

describe("course library store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
  });

  it("starts empty without an error", () => {
    expect(readCourseLibrary()).toEqual({ courses: [], error: "" });
  });

  it("round-trips a custom course", () => {
    const saved = course();
    upsertCustomCourse(saved);

    expect(listCustomCourses()).toHaveLength(1);
    expect(findCustomCourse(saved.id)?.workout.goal).toBe("乳酸阈能力");
  });

  it("updates an existing course instead of appending a duplicate", () => {
    const saved = course();
    upsertCustomCourse(saved);
    upsertCustomCourse({ ...saved, category: "M" });

    const courses = listCustomCourses();
    expect(courses).toHaveLength(1);
    expect(courses[0].category).toBe("M");
  });

  it("refuses to persist a course that fails core validation", () => {
    expect(() => upsertCustomCourse({ id: "broken", origin: "custom", category: "T", tags: [], workout: { dslVersion: 1, goal: "", phases: [] } }))
      .toThrow(/课程无效/);
    expect(listCustomCourses()).toHaveLength(0);
  });

  it("reports corrupted storage instead of crashing", () => {
    window.localStorage.setItem(COURSE_LIBRARY_KEY, "{not json");

    const library = readCourseLibrary();
    expect(library.courses).toEqual([]);
    expect(library.error).toContain("损坏");
  });

  it("reports a non-array payload", () => {
    window.localStorage.setItem(COURSE_LIBRARY_KEY, JSON.stringify({ courses: [] }));

    expect(readCourseLibrary().error).toContain("格式不正确");
  });

  it("ignores entries that are not valid custom courses", () => {
    const valid = course();
    window.localStorage.setItem(COURSE_LIBRARY_KEY, JSON.stringify([valid, { id: "x" }]));

    const library = readCourseLibrary();
    expect(library.courses.map((item) => item.id)).toEqual([valid.id]);
    expect(library.error).toContain("1 门");
  });

  it("surfaces an unavailable storage instead of pretending to save", () => {
    vi.stubGlobal("localStorage", undefined);

    const library = readCourseLibrary();
    expect(library.courses).toEqual([]);
    expect(library.error).toContain("本地存储不可用");
    expect(() => upsertCustomCourse(course())).toThrow(/本地存储不可用/);
  });

  it("removes and clears stored courses", () => {
    const first = course();
    const second = course();
    upsertCustomCourse(first);
    upsertCustomCourse(second);

    removeCustomCourse(first.id);
    expect(listCustomCourses().map((item) => item.id)).toEqual([second.id]);

    clearCourseLibrary();
    expect(listCustomCourses()).toEqual([]);
  });
});
