import { describe, expect, it } from "vitest";
import { deepClone } from "../src/clone.js";
import { cloneLibraryCourse, createLibraryCourse, type LibraryCourse } from "../src/library.js";
import { parseWorkoutDsl } from "../src/dsl/registry.js";
import { addPhase, createDefaultSegment, insertSegment } from "../src/dsl/edit.js";

describe("平台无关深拷贝", () => {
  it("拷贝嵌套结构且不共享引用", () => {
    const source = { a: 1, b: { c: [1, 2, { d: "x" }] } };
    const copy = deepClone(source);

    expect(copy).toEqual(source);
    expect(copy).not.toBe(source);
    expect(copy.b).not.toBe(source.b);
    expect(copy.b.c[2]).not.toBe(source.b.c[2]);
    copy.b.c[2].d = "改过了";
    expect(source.b.c[2].d).toBe("x");
  });

  it("保留值为 undefined 的字段（structuredClone 的语义）", () => {
    const copy = deepClone({ keep: undefined, drop: 1 } as { keep?: string; drop: number });

    expect(Object.keys(copy)).toEqual(["keep", "drop"]);
    expect(copy.keep).toBeUndefined();
  });

  it("原样返回基本类型与 null", () => {
    expect(deepClone(3)).toBe(3);
    expect(deepClone("x")).toBe("x");
    expect(deepClone(null)).toBeNull();
    expect(deepClone(undefined)).toBeUndefined();
  });

  it("Vue 那样的响应式代理也能安全拷贝", () => {
    const target = { phases: [{ role: "main", segments: [] as unknown[] }] };
    const proxy = new Proxy(target, {
      get(t, key, receiver) {
        return Reflect.get(t, key, receiver);
      },
    });

    const copy = deepClone(proxy);
    expect(copy).toEqual(target);
    expect(copy).not.toBe(target);
    expect(copy.phases).not.toBe(target.phases);
  });

  it("结构编辑与课程复制仍然与入参解耦", () => {
    const workout = parseWorkoutDsl("GOAL:深拷贝\nMS:8min@E");
    const edited = insertSegment(workout, [0], 1, createDefaultSegment("recovery", "main"));
    expect(workout.phases[0].segments).toHaveLength(1);
    expect(edited.phases[0].segments).toHaveLength(2);

    const withWarmup = addPhase(workout, "warmup");
    expect(workout.phases).toHaveLength(1);
    expect(withWarmup.phases).toHaveLength(2);

    const course: LibraryCourse = createLibraryCourse({ category: "E", workout });
    const copy = cloneLibraryCourse(course);
    expect(copy.workout).not.toBe(course.workout);
    expect(copy.workout.phases[0].segments).not.toBe(course.workout.phases[0].segments);
  });
});
