import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  SUPPORTED_WORKOUT_DSL_VERSIONS,
  WORKOUT_DSL_SPEC_DIR,
  workoutDslSpecVersionDir,
  workoutDslSpecVersionFile,
} from "../src/dsl/registry.js";
import {
  PACKAGE_ROOT,
  PACKAGE_SPEC_ROOT,
  SPEC_ROOT,
  specFiles,
  specVersions,
  syncSpec,
} from "../scripts/sync-spec.mjs";

/**
 * 「按版本提供的基础解析器」必须与「按版本冻结的规范」一起交付。
 *
 * 规范的事实来源只有仓库根目录的 spec/dsl/；本测试保证：
 * 1. 规范目录与解析器注册表一一对应；
 * 2. 复制到包内的过程无损（逐字节一致）；
 * 3. 包配置确实会带上规范与编译产物，而不是只带源码。
 */

const tempDirs: string[] = [];

/** 包内的规范路径常量是相对仓库根写的，校验存在性时要还原到仓库根。 */
const REPO_ROOT = path.resolve(SPEC_ROOT, "..", "..");

afterAll(() => {
  for (const directory of tempDirs) rmSync(directory, { recursive: true, force: true });
});

function packageManifest(): { files?: string[]; exports?: Record<string, unknown>; scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
}

describe("冻结规范随解析器一起发布", () => {
  it("规范目录与解析器注册表的版本一一对应", () => {
    expect(specVersions()).toEqual([...SUPPORTED_WORKOUT_DSL_VERSIONS]);
  });

  it("每个受支持的版本都有非空的冻结规范文件", () => {
    expect(WORKOUT_DSL_SPEC_DIR).toBe("spec/dsl");
    expect(specFiles().some((file) => file.relative === "README.md")).toBe(true);

    for (const version of SUPPORTED_WORKOUT_DSL_VERSIONS) {
      expect(workoutDslSpecVersionDir(version)).toBe(`spec/dsl/v${version}`);
      const file = path.join(REPO_ROOT, workoutDslSpecVersionFile(version));
      expect(existsSync(file), `缺少冻结规范 ${workoutDslSpecVersionFile(version)}`).toBe(true);
      expect(statSync(file).size).toBeGreaterThan(0);
    }
  });

  it("复制到包产物的规范与仓库规范逐字节一致", () => {
    const target = mkdtempSync(path.join(os.tmpdir(), "tfm-dsl-spec-"));
    tempDirs.push(target);

    const copied = syncSpec(target);
    const source = specFiles();
    expect(copied.length).toBe(source.length);

    for (const file of source) {
      const copy = path.join(target, file.relative);
      expect(existsSync(copy), `缺少产物文件 ${file.relative}`).toBe(true);
      expect(readFileSync(copy).equals(readFileSync(file.absolute))).toBe(true);
    }
  });

  it("包配置会把规范与编译产物一起发布", () => {
    const manifest = packageManifest();
    expect(manifest.files).toContain("dist");
    expect(manifest.files).toContain("spec");
    expect(manifest.exports?.["./spec/dsl/*"]).toBe("./spec/dsl/*");
    expect(manifest.exports?.["./package.json"]).toBe("./package.json");
    expect(manifest.scripts?.build).toContain("scripts/sync-spec.mjs");
    expect(manifest.scripts?.build).toContain("scripts/clean-dist.mjs");
  });

  it("已经构建过时，包内的规范副本没有落后于仓库", () => {
    if (!existsSync(PACKAGE_SPEC_ROOT)) return; // 未构建（例如全新检出后先跑测试）时跳过
    for (const file of specFiles()) {
      const copy = path.join(PACKAGE_SPEC_ROOT, file.relative);
      expect(existsSync(copy), `包内缺少 ${file.relative}，请重新执行 npm run build`).toBe(true);
      expect(readFileSync(copy).equals(readFileSync(file.absolute))).toBe(true);
    }
  });
});
