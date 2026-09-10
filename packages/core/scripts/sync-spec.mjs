#!/usr/bin/env node
/**
 * 把冻结的 Workout DSL 规范复制进包内（packages/core/spec/dsl）。
 *
 * 规范只有一个事实来源：仓库根目录的 spec/dsl/，本脚本只做单向复制，绝不反向写回。
 * 之所以要复制，是因为「按版本的解析器」与「该版本的冻结规范」应该一起发布：
 * 外部平台只依赖 @train-for-marathon/core/dsl/v1 时，也应该能读到 v1 的冻结文本。
 * 目标路径选在包根的 spec/dsl/，因此包内相对路径与仓库相对路径完全一致，
 * 文档里的 spec/dsl/v1/workout-dsl-v1.md 在源码仓库和安装后的包里都成立。
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SPEC_ROOT = path.resolve(PACKAGE_ROOT, "..", "..", "spec", "dsl");
export const PACKAGE_SPEC_ROOT = path.join(PACKAGE_ROOT, "spec", "dsl");

/** spec/dsl/ 下的全部文件，按相对路径排序（含 README.md 与各版本目录）。 */
export function specFiles() {
  const files = [];
  const walk = (directory, prefix) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory()) walk(absolute, relative);
      else files.push({ relative, absolute });
    }
  };
  if (existsSync(SPEC_ROOT)) walk(SPEC_ROOT, "");
  return files.sort((left, right) => (left.relative < right.relative ? -1 : left.relative > right.relative ? 1 : 0));
}

/** spec/dsl/ 下已冻结的版本号列表，如 [1]。 */
export function specVersions() {
  return specFiles()
    .map((file) => /^v(\d+)\//u.exec(file.relative))
    .filter((match) => match !== null)
    .map((match) => Number(match[1]))
    .filter((version, index, all) => all.indexOf(version) === index)
    .sort((left, right) => left - right);
}

/** 复制冻结规范到 targetRoot（默认包内 spec/dsl），返回目标文件清单。 */
export function syncSpec(targetRoot = PACKAGE_SPEC_ROOT) {
  const files = specFiles();
  if (files.length === 0) throw new Error(`没有找到冻结规范：${SPEC_ROOT}`);
  rmSync(targetRoot, { recursive: true, force: true });
  for (const file of files) {
    const target = path.join(targetRoot, file.relative);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(file.absolute, target);
  }
  return files.map((file) => path.join(targetRoot, file.relative));
}

/** 目标目录里缺失或不一致的规范文件（相对路径）；用于校验包内副本没有落后于仓库。 */
export function staleSpecFiles(targetRoot = PACKAGE_SPEC_ROOT) {
  return specFiles()
    .filter((file) => {
      const target = path.join(targetRoot, file.relative);
      if (!existsSync(target)) return true;
      return !readFileSync(file.absolute).equals(readFileSync(target));
    })
    .map((file) => file.relative);
}

function main() {
  if (process.argv.includes("--check")) {
    const stale = staleSpecFiles();
    if (stale.length > 0) {
      console.error(`以下冻结规范未同步到包内，请执行 npm run build：\n${stale.map((file) => `  - ${file}`).join("\n")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`冻结规范已同步：${specFiles().length} 个文件`);
    return;
  }

  const copied = syncSpec();
  console.log(`已复制 ${copied.length} 个冻结规范文件 → ${path.relative(PACKAGE_ROOT, PACKAGE_SPEC_ROOT)}`);
  for (const version of specVersions()) console.log(`  v${version}：${path.relative(PACKAGE_ROOT, PACKAGE_SPEC_ROOT)}/v${version}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
