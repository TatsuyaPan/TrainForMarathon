import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 内容源同步守卫。
 *
 * 仓库里同一份内容有两个副本：
 * - `src/md`、`src/image`：GitBook 站点源；
 * - `ebook/src/md`、`ebook/src/image`：应用（web / 小程序）通过 content-manifest 读取的源。
 *
 * 目前需要手工双写，容易漏改一份。这里断言两份完全一致，漏改会直接让测试失败。
 */

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const GITBOOK_SOURCE = path.join(REPO_ROOT, "src");
const APP_SOURCE = path.join(REPO_ROOT, "ebook", "src");
const CONTENT_MANIFEST = path.join(REPO_ROOT, "packages", "core", "content-manifest.json");

function listFiles(root: string, directory = ""): string[] {
  const absolute = path.join(root, directory);
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = directory === "" ? entry.name : `${directory}/${entry.name}`;
    return entry.isDirectory() ? listFiles(root, relative) : [relative];
  });
}

function fileDigest(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const manifestPaths = (
  JSON.parse(readFileSync(CONTENT_MANIFEST, "utf8")) as { id: string; path: string }[]
).map((entry) => entry.path.replace(/^ebook\/src\//u, ""));

describe("内容源同步", () => {
  it("content-manifest 指向的每份文档都与 GitBook 源一致", () => {
    expect(manifestPaths.length).toBeGreaterThan(0);
    for (const relative of manifestPaths) {
      const appFile = path.join(APP_SOURCE, relative);
      const gitbookFile = path.join(GITBOOK_SOURCE, relative);
      expect(existsSync(gitbookFile), `src/${relative} 不存在：GitBook 源漏了新文档`).toBe(true);
      expect(fileDigest(gitbookFile), `src/${relative} 与 ebook/src/${relative} 内容不一致`).toBe(fileDigest(appFile));
    }
  });

  it("两份副本的文件集合一致", () => {
    for (const directory of ["md", "image"]) {
      const gitbookFiles = listFiles(path.join(GITBOOK_SOURCE, directory)).sort();
      const appFiles = listFiles(path.join(APP_SOURCE, directory)).sort();
      expect(gitbookFiles, `${directory}/ 下两份副本的文件清单不一致`).toEqual(appFiles);
    }
  });

  it("图片内容一致", () => {
    for (const relative of listFiles(path.join(APP_SOURCE, "image"))) {
      expect(
        fileDigest(path.join(GITBOOK_SOURCE, "image", relative)),
        `src/image/${relative} 与 ebook/src/image/${relative} 内容不一致`,
      ).toBe(fileDigest(path.join(APP_SOURCE, "image", relative)));
    }
  });
});
