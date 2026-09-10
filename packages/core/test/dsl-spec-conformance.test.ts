import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CURRENT_WORKOUT_DSL_VERSION,
  SUPPORTED_WORKOUT_DSL_VERSIONS,
  WORKOUT_DSL_PARSERS,
  WORKOUT_DSL_SERIALIZERS,
  parseWorkoutDsl,
  serializeWorkout,
} from "../src/dsl/registry.js";
import { parseWorkoutDslV1 } from "../src/dsl/v1.js";

/**
 * 冻结规范与实现的对应关系守卫。
 *
 * 版本政策见 spec/dsl/README.md：一个版本一份规范，解析器与版本一一对应。
 * 这里用机械方式保证以后新增 v2 时不会出现「有规范没解析器」或「有解析器没规范」，
 * 并直接拿冻结规范里的合法示例做往返校验，防止实现与规范悄悄漂移。
 */

const SPEC_ROOT = fileURLToPath(new URL("../../../spec/dsl/", import.meta.url));

function specVersionDirs(): number[] {
  if (!existsSync(SPEC_ROOT)) return [];
  return readdirSync(SPEC_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => /^v(\d+)$/u.exec(entry.name))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => Number(match[1]))
    .filter((version) => specFiles(version).length > 0)
    .sort((left, right) => left - right);
}

function specDir(version: number): string {
  return path.join(SPEC_ROOT, `v${version}`);
}

function specFiles(version: number): string[] {
  const directory = specDir(version);
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(".md")).map((name) => path.join(directory, name));
}

function readSpec(version: number): string {
  return specFiles(version)
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}

/** 取出冻结规范里某一节内的 ```text 代码块，按出现顺序返回。 */
function textBlocksInSection(markdown: string, sectionHeading: string): string[] {
  const lines = markdown.split(/\r\n|\n|\r/u);
  const start = lines.findIndex((line) => line.trimStart().startsWith(sectionHeading));
  if (start < 0) return [];
  const nextHeading = lines.findIndex(
    (line, index) => index > start && /^##\s/u.test(line) && !line.trimStart().startsWith(sectionHeading),
  );
  const section = lines.slice(start + 1, nextHeading < 0 ? lines.length : nextHeading);

  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of section) {
    const fence = /^\s*```(\w*)\s*$/u.exec(line);
    if (fence) {
      if (current === null) {
        current = fence[1] === "text" ? [] : null;
      } else {
        blocks.push(current.join("\n").trim());
        current = null;
      }
      continue;
    }
    if (current !== null) current.push(line);
  }
  return blocks.filter((block) => block !== "");
}

describe("冻结规范与解析器一一对应", () => {
  it("每个冻结版本都有对应规范目录", () => {
    for (const version of SUPPORTED_WORKOUT_DSL_VERSIONS) {
      expect(specFiles(version).length, `版本 ${version} 缺少 spec/dsl/v${version}/ 下的规范文件`).toBeGreaterThan(0);
    }
  });

  it("每个规范目录都注册了对应解析器与序列化器", () => {
    const versions = specVersionDirs();
    expect(versions.length).toBeGreaterThan(0);
    for (const version of versions) {
      expect(WORKOUT_DSL_PARSERS[version], `spec/dsl/v${version} 没有注册解析器`).toBeTypeOf("function");
      expect(WORKOUT_DSL_SERIALIZERS[version], `spec/dsl/v${version} 没有注册序列化器`).toBeTypeOf("function");
      expect(SUPPORTED_WORKOUT_DSL_VERSIONS).toContain(version);
    }
  });

  it("注册表不含没有规范的版本，且当前版本是最新规范版本", () => {
    const versions = specVersionDirs();
    for (const version of SUPPORTED_WORKOUT_DSL_VERSIONS) {
      expect(versions, `注册了版本 ${version} 但 spec/dsl/v${version}/ 不存在`).toContain(version);
    }
    expect(CURRENT_WORKOUT_DSL_VERSION).toBe(Math.max(...versions));
  });
});

describe("冻结规范中的合法示例可以往返", () => {
  const samples = textBlocksInSection(readSpec(1), "## 7.");

  it("v1 规范至少包含一个合法示例", () => {
    expect(samples.length).toBeGreaterThan(0);
  });

  it.each(samples.map((sample, index) => [index + 1, sample] as const))("示例 %i 可以往返", (_index, sample) => {
    const workout = parseWorkoutDslV1(sample);
    expect(workout.dslVersion).toBe(1);

    // 标准导出写入版本行，紧凑导出省略；两者都能被重新解析为等价结构
    const standard = serializeWorkout(workout);
    expect(standard.startsWith("WORKOUT/1")).toBe(true);
    expect(parseWorkoutDsl(standard)).toEqual(workout);
    expect(parseWorkoutDslV1(sample)).toEqual(workout);
  });
});
