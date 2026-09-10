#!/usr/bin/env node
/**
 * 把仓库根目录的 LICENSE 复制进包内（packages/core/LICENSE）。
 *
 * npm 只会打包包目录里的内容，仓库根的 LICENSE 不会自动进发布包；而授权声明应当
 * 跟着包一起发布，所以这里与冻结规范同样的做法：单向复制，绝不反向写回。
 */
import { cpSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const REPO_LICENSE = path.resolve(PACKAGE_ROOT, "..", "..", "LICENSE");
export const PACKAGE_LICENSE = path.join(PACKAGE_ROOT, "LICENSE");

/** 复制仓库 LICENSE 到包内，返回目标路径。 */
export function syncLicense() {
  if (!existsSync(REPO_LICENSE)) throw new Error(`没有找到仓库 LICENSE：${REPO_LICENSE}`);
  cpSync(REPO_LICENSE, PACKAGE_LICENSE);
  return PACKAGE_LICENSE;
}

/** 包内 LICENSE 缺失或与仓库不一致时为 true。 */
export function licenseIsStale() {
  if (!existsSync(REPO_LICENSE) || !existsSync(PACKAGE_LICENSE)) return true;
  return !readFileSync(REPO_LICENSE).equals(readFileSync(PACKAGE_LICENSE));
}

function main() {
  if (process.argv.includes("--check")) {
    if (licenseIsStale()) {
      console.error("包内 LICENSE 未同步到仓库版本，请执行 npm run build");
      process.exitCode = 1;
      return;
    }
    console.log("LICENSE 已同步");
    return;
  }

  syncLicense();
  console.log(`已复制 LICENSE → ${path.relative(PACKAGE_ROOT, PACKAGE_LICENSE)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
