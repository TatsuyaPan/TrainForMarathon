import { describe, expect, it } from "vitest";
import {
  BUILTIN_COURSES,
  LIBRARY_CATEGORY_LABELS,
  cloneLibraryCourse,
  createLibraryCourse,
  getLibraryCourse,
  inferLibraryCategory,
  listCoursesByCategory,
  recommendLibraryCourse,
  updateLibraryCourse,
  validateLibraryCourse,
} from "../src/library.js";
import { parseWorkoutDsl, serializeWorkout } from "../src/dsl/registry.js";
import { createDefaultWorkout } from "../src/dsl/edit.js";
import { workoutTotals } from "../src/dsl/workout.js";

describe("内置课程库", () => {
  it("覆盖书内全部课程分类", () => {
    expect(BUILTIN_COURSES.length).toBeGreaterThanOrEqual(20);
    for (const category of Object.keys(LIBRARY_CATEGORY_LABELS)) {
      expect(BUILTIN_COURSES.some((course) => course.category === category)).toBe(true);
    }
  });

  it("全部内置课程通过校验、可往返且总量大于零", () => {
    for (const course of BUILTIN_COURSES) {
      expect(validateLibraryCourse(course)).toEqual([]);
      const dsl = serializeWorkout(course.workout);
      expect(dsl).toContain("WORKOUT/2");
      expect(parseWorkoutDsl(dsl)).toEqual(course.workout);
      const totals = workoutTotals(course.workout);
      expect(totals.knownDistanceMeters + totals.knownDurationSeconds).toBeGreaterThan(0);
      expect(course.workout.goal.trim()).not.toBe("");
    }
  });

  it("每门内置课程都有主训练阶段与展示标题来源", () => {
    for (const course of BUILTIN_COURSES) {
      expect(course.workout.phases.some((phase) => phase.role === "main")).toBe(true);
      expect(course.workout.title?.trim() || course.workout.goal.trim()).toBeTruthy();
      expect(course.source).toContain("《");
    }
  });

  it("内置课程带类型化出处，复制课程保留出处", () => {
    expect(getLibraryCourse("t-20min")?.sourceContentId).toBe("training-types/threshold");
    expect(getLibraryCourse("i-yasso-800")?.sourceContentId).toBe("training-types/interval");
    expect(getLibraryCourse("r-400-x10")?.sourceContentId).toBe("training-types/repetition");
    expect(getLibraryCourse("m-15km")?.sourceContentId).toBe("training-types/marathon");
    expect(getLibraryCourse("e-40min")?.sourceContentId).toBe("training-types/easy");
    expect(getLibraryCourse("mix-tir")?.sourceContentId).toBe("training-types/mixed");
    const copy = cloneLibraryCourse(getLibraryCourse("i-yasso-800")!);
    expect(copy.sourceContentId).toBe("training-types/interval");
  });

  it("按分类筛选与推荐", () => {
    const tCourses = listCoursesByCategory(BUILTIN_COURSES, "T");
    expect(tCourses.length).toBeGreaterThanOrEqual(6);
    expect(tCourses.every((course) => course.category === "T" || course.tags.includes("T"))).toBe(true);
    const mixed = listCoursesByCategory(BUILTIN_COURSES, "mixed");
    expect(mixed.every((course) => course.category === "mixed")).toBe(true);
    expect(recommendLibraryCourse("I")?.category).toBe("I");
    expect(listCoursesByCategory(BUILTIN_COURSES)).toHaveLength(BUILTIN_COURSES.length);
  });

  it("按 id 查课程（含自定义课程）", () => {
    expect(getLibraryCourse("i-yasso-800")?.workout.title).toContain("亚索");
    const custom = createLibraryCourse({ category: "T", workout: parseWorkoutDsl("GOAL:x\nMS:10min@T") });
    expect(getLibraryCourse(custom.id, [custom])?.origin).toBe("custom");
    expect(getLibraryCourse("not-exist")).toBeUndefined();
  });

  it("按主训练档位推断分类，热身与冷身不参与", () => {
    expect(inferLibraryCategory(parseWorkoutDsl("GOAL:有氧基础\nMS:40min@E"))).toBe("E");
    // 只有主训练决定分类：WU/CD 的 E 不参与判断
    expect(inferLibraryCategory(parseWorkoutDsl("GOAL:乳酸阈能力\nWU:15min@E\nMS:4x(8min@T+90s@jog)\nCD:10min@E"))).toBe("T");
    // 多个档位归为混合刺激
    expect(inferLibraryCategory(parseWorkoutDsl("GOAL:混合刺激\nMS:2x(3min@I+2min@jog)+5min@T"))).toBe("mixed");
    // 没有主训练时不猜测，归为混合刺激
    const warmupOnly = createDefaultWorkout();
    warmupOnly.phases = warmupOnly.phases.filter((phase) => phase.role !== "main");
    expect(inferLibraryCategory(warmupOnly)).toBe("mixed");
  });
});

describe("课程库操作", () => {
  function draft(goal = "有氧基础") {
    const workout = createDefaultWorkout();
    workout.goal = goal;
    return workout;
  }

  it("创建自定义课程：校验训练目的并生成时间戳", () => {
    const course = createLibraryCourse({ category: "E", workout: draft() });
    expect(course.origin).toBe("custom");
    expect(course.id).toMatch(/^course-/);
    expect(course.createdAt).toBeTruthy();
    expect(course.updatedAt).toBe(course.createdAt);
    expect(course.tags).toEqual(["E"]);
    expect(() => createLibraryCourse({ category: "E", workout: draft(" ") })).toThrowError(/训练目的/);
  });

  it("更新课程保留 id 与创建时间，刷新更新时间", () => {
    const course = createLibraryCourse({ category: "E", workout: draft() });
    const updated = updateLibraryCourse(course, {
      category: "T",
      workout: { ...course.workout, goal: "乳酸阈能力" },
    });
    expect(updated.id).toBe(course.id);
    expect(updated.createdAt).toBe(course.createdAt);
    expect(updated.category).toBe("T");
    expect(updated.tags).toEqual(["T"]);
    expect(updated.workout.goal).toBe("乳酸阈能力");
  });

  it("复制课程：深拷贝、生成新 id，标题追加副本标记", () => {
    const source = getLibraryCourse("i-yasso-800")!;
    const copy = cloneLibraryCourse(source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.origin).toBe("custom");
    expect(copy.workout.title).toBe("亚索 800（副本）");
    expect(copy.source).toContain("复制自");
    copy.workout.phases[0].segments.length = 0;
    expect(source.workout.phases[0].segments.length).toBeGreaterThan(0);

    const untitled = createLibraryCourse({ category: "E", workout: { ...draft(), title: undefined } });
    expect(cloneLibraryCourse(untitled).workout.title).toBeUndefined();
  });

  it("校验拒绝缺少目的、未知分类与空阶段", () => {
    const course = createLibraryCourse({ category: "E", workout: draft() });
    const badCategory = { ...course, category: "Z" as never };
    expect(validateLibraryCourse(badCategory).some((issue) => issue.code === "invalid-category")).toBe(true);
    const noGoal = { ...course, workout: { ...course.workout, goal: "" } };
    expect(validateLibraryCourse(noGoal).some((issue) => issue.code === "missing-goal")).toBe(true);
    const emptyPhase = {
      ...course,
      workout: { ...course.workout, phases: [{ role: "main" as const, segments: [] }] },
    };
    expect(validateLibraryCourse(emptyPhase).some((issue) => issue.code === "empty-phase")).toBe(true);
  });
});
