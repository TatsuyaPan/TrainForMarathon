import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PACKAGE_ROOT } from "../scripts/sync-spec.mjs";
import { PACKAGE_LICENSE, REPO_LICENSE, licenseIsStale } from "../scripts/sync-license.mjs";

/**
 * core 是独立开源仓库，要能被外部平台直接安装。
 *
 * 这里守住两条发布前提：包不标记 private（作用域包显式公开），
 * 并且授权声明跟着包一起走——仓库根的 LICENSE 不是包目录里的文件，
 * 不复制就进不了发布包。
 */

interface PackageManifest {
  private?: boolean;
  license?: string;
  files?: string[];
  publishConfig?: { access?: string };
  repository?: { url?: string; directory?: string };
}

const manifest: PackageManifest = JSON.parse(
  readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"),
);

describe("core 包可以直接发布", () => {
  it("不再标记 private，并带上公开发布必需的字段", () => {
    expect(manifest.private).not.toBe(true);
    expect(manifest.license).toBe("CC0-1.0");
    // 作用域包默认 restricted，必须显式声明公开
    expect(manifest.publishConfig?.access).toBe("public");
    expect(manifest.repository?.url).toContain("TrainForMarathon");
    expect(manifest.repository?.directory).toBe("packages/core");
    expect(manifest.files).toEqual(expect.arrayContaining(["dist", "spec"]));
  });

  it("授权声明复制进包目录，才会被 npm 一起打包", () => {
    expect(existsSync(REPO_LICENSE)).toBe(true);
    expect(path.dirname(PACKAGE_LICENSE)).toBe(PACKAGE_ROOT);
    expect(path.basename(PACKAGE_LICENSE)).toBe("LICENSE");
  });

  it("已经构建过时，包内 LICENSE 与仓库逐字节一致", () => {
    if (!existsSync(PACKAGE_LICENSE)) return; // 未构建时跳过
    expect(licenseIsStale()).toBe(false);
  });
});
