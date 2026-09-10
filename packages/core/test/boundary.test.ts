import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

/** 去掉注释，避免把说明文字里的 API 名字当成真实依赖 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/\/\/[^\n]*/gu, " ");
}

describe("core package boundary", () => {
  it("exposes a platform-independent package identity", () => {
    expect(core.CORE_PACKAGE).toEqual({
      name: "@train-for-marathon/core",
      schemaVersion: 1,
    });
  });

  it("does not import client, network, or WeChat runtimes", () => {
    const source = globSync("packages/core/src/**/*.ts")
      .filter((path) => !path.endsWith("generated.ts"))
      .map((path) => readFileSync(path, "utf8"))
      .join("\n");
    const packageJson = readFileSync("packages/core/package.json", "utf8");
    expect(source).not.toMatch(/\bwx\.|@cloudbase|apps\/miniprogram|XMLHttpRequest/u);
    expect(packageJson).not.toMatch(/@cloudbase|wechat|miniprogram/u);
  });

  it("只依赖 ECMAScript：不使用 HTML / 浏览器 / Node 专有 API", () => {
    const code = stripComments(
      globSync("packages/core/src/**/*.ts")
        .filter((path) => !path.endsWith("generated.ts"))
        .map((path) => readFileSync(path, "utf8"))
        .join("\n"),
    );
    // `structuredClone` 是 HTML 规范 API，微信小程序运行时并不保证提供；
    // 深拷贝统一走 src/clone.ts 的纯 JS 实现。
    expect(code).not.toMatch(/\bstructuredClone\b/u);
    expect(code).not.toMatch(
      /\b(window|document|navigator|localStorage|sessionStorage|fetch|requestAnimationFrame|TextEncoder|TextDecoder|process)\b/u,
    );
  });
});
