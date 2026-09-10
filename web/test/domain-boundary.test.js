import { describe, expect, it } from "vitest";
import { globSync, readFileSync } from "node:fs";

/**
 * 界面层边界：领域规则只写在 core 里。
 *
 * 这两条约束对应「core 与界面分离、便于小程序复用」：
 * 1. 深拷贝由 core 的 deepClone / stripUndefinedFields 提供，页面不再自己写 JSON 往返；
 * 2. 平台存储集中在一处适配器里，页面不直接碰 localStorage。
 * 相关实现见 packages/core/src/clone.ts 与 packages/core/test/defensive-copy.test.ts。
 */

/** 去掉注释，避免把说明文字里的写法当成真实依赖 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/\/\/[^\n]*/gu, " ");
}

const SOURCE_FILES = [...globSync("src/**/*.js"), ...globSync("src/**/*.vue")];

function readSources(files = SOURCE_FILES) {
  return stripComments(files.map((file) => readFileSync(file, "utf8")).join("\n"));
}

describe("Web 界面层边界", () => {
  it("收集到了界面源码", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(10);
  });

  it("不自己实现领域深拷贝，统一用 core 的 deepClone", () => {
    const code = readSources();

    // JSON 往返会丢 undefined 字段，也不能在微信小程序里复用同一套行为
    expect(code).not.toMatch(/JSON\.parse\(\s*JSON\.stringify\(/u);
    // structuredClone 属于 HTML 规范，小程序运行时并不保证提供
    expect(code).not.toMatch(/\bstructuredClone\b/u);
  });

  it("存储适配只出现在 src/stores 里", () => {
    const outsideStores = SOURCE_FILES.filter((file) => !file.replace(/\\/gu, "/").startsWith("src/stores/"));
    expect(outsideStores.length).toBeGreaterThan(5);
    expect(readSources(outsideStores)).not.toMatch(/\blocalStorage\b/u);
  });
});
