/**
 * 自定义课程库（localStorage）。
 *
 * 课程库 = core 内置课程 + 本模块保存的自定义课程。
 * 存储只保存 origin === "custom" 的 LibraryCourse；读取时逐条校验，
 * 无效数据不会让页面崩溃，而是通过 error 状态提示并允许清理。
 */
import { validateLibraryCourse } from "@core";

export const COURSE_LIBRARY_KEY = "tfm:course-library:v1";

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** 读取自定义课程库：返回课程与读取错误（无错误时 error 为空串） */
export function readCourseLibrary() {
  const store = storage();
  if (!store) return { courses: [], error: "本地存储不可用：课程不会被保存" };
  let raw;
  try {
    raw = store.getItem(COURSE_LIBRARY_KEY);
  } catch {
    return { courses: [], error: "本地存储不可用：课程不会被保存" };
  }
  if (!raw) return { courses: [], error: "" };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { courses: [], error: "本地课程数据已损坏，无法读取" };
  }
  if (!Array.isArray(parsed)) {
    return { courses: [], error: "本地课程数据格式不正确" };
  }

  const courses = [];
  let invalidCount = 0;
  for (const item of parsed) {
    if (validateLibraryCourse(item).length === 0 && item.origin === "custom") courses.push(item);
    else invalidCount += 1;
  }
  return {
    courses,
    error: invalidCount > 0 ? `有 ${invalidCount} 门本地课程数据无效，已忽略` : "",
  };
}

export function listCustomCourses() {
  return readCourseLibrary().courses;
}

export function findCustomCourse(id) {
  return listCustomCourses().find((course) => course.id === id);
}

function persist(courses) {
  const store = storage();
  if (!store) throw new Error("本地存储不可用，课程尚未保存");
  try {
    store.setItem(COURSE_LIBRARY_KEY, JSON.stringify(courses));
  } catch (error) {
    throw new Error(`课程保存失败：${error instanceof Error ? error.message : "本地存储写入被拒绝"}`);
  }
  return courses;
}

/** 保存整门课程（新建或更新），写入前必须通过 core 校验 */
export function upsertCustomCourse(course) {
  const issues = validateLibraryCourse(course);
  if (issues.length > 0) throw new Error(`课程无效：${issues[0].message}`);
  const existing = listCustomCourses();
  const index = existing.findIndex((item) => item.id === course.id);
  const next = index === -1
    ? [...existing, course]
    : existing.map((item) => (item.id === course.id ? course : item));
  persist(next);
  return course;
}

export function removeCustomCourse(id) {
  const next = listCustomCourses().filter((course) => course.id !== id);
  persist(next);
  return next;
}

/** 清理本地课程数据（用于损坏数据的恢复入口） */
export function clearCourseLibrary() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(COURSE_LIBRARY_KEY);
  } catch {
    /* 清理失败不影响页面 */
  }
}
