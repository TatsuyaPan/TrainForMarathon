#!/usr/bin/env node
/**
 * 构建前清空包产物与规范副本。
 *
 * tsc 不会删除源文件被移除后遗留的旧编译文件（例如已下线的 workout-dsl.js），
 * 那些文件一旦进入发布包就会误导使用者，所以构建从干净的 dist 开始。
 * 包内的 spec/dsl/ 与 LICENSE 分别是仓库 spec/dsl/ 与根 LICENSE 的生成副本
 * （见 sync-spec.mjs、sync-license.mjs），同样先清空再重建。
 */
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(packageRoot, "dist"),
  path.join(packageRoot, "spec"),
  path.join(packageRoot, "LICENSE"),
];

// 只允许清理 packages/core 下的生成目录，路径不符合预期时宁可失败
if (path.basename(packageRoot) !== "core" || path.basename(path.dirname(packageRoot)) !== "packages") {
  throw new Error(`拒绝清理非预期目录：${targets.join("、")}`);
}

for (const target of targets) {
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
}
console.log(`已清空 ${targets.map((target) => path.relative(packageRoot, target)).join("、")}`);
