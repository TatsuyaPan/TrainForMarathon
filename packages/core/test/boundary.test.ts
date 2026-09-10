import { describe, expect, it } from "vitest";
import * as core from "../src/index.js";
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";

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
});
