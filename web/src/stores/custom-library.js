/**
 * 用户自定义课程库（localStorage）。
 * 课程库数据 = 内置（core BUILTIN_LIBRARY）+ 自定义（本模块）。
 */
import { createLibraryEntry } from "@core";

const STORAGE_KEY = "tfm:custom-library";

export function listCustomLibrary() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persist(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/** 新增自定义课程（校验 DSL 与训练目的） */
export function addCustomEntry(input) {
  const entry = createLibraryEntry(input);
  const items = listCustomLibrary();
  if (items.some((item) => item.id === entry.id)) {
    throw new Error("课程已存在");
  }
  items.push(entry);
  persist(items);
  return entry;
}

export function removeCustomEntry(id) {
  persist(listCustomLibrary().filter((item) => item.id !== id));
}

export function clearCustomLibrary() {
  localStorage.removeItem(STORAGE_KEY);
}
