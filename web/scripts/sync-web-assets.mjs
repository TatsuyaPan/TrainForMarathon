/**
 * 将课程图片同步到 web/public/course-images/，供正文渲染引用。
 * 图片地址约定：/course-images/{仓库相对路径}
 */
import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(scriptDir, "..");
const repositoryRoot = resolve(webRoot, "..");
const coreRoot = resolve(repositoryRoot, "packages/core");
const manifest = JSON.parse(await readFile(resolve(coreRoot, "content-manifest.json"), "utf8"));
const destRoot = resolve(webRoot, "public/course-images");

const imageIds = new Set();
for (const entry of manifest) {
  const markdown = (await readFile(resolve(repositoryRoot, entry.path), "utf8")).replace(/^\uFEFF/u, "");
  for (const match of markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/gu)) {
    const raw = decodeURIComponent(match[1]);
    if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(raw)) continue;
    const absolutePath = resolve(dirname(resolve(repositoryRoot, entry.path)), raw);
    const id = relative(repositoryRoot, absolutePath).split(sep).join("/");
    imageIds.add(id);
  }
}

await rm(destRoot, { recursive: true, force: true });
for (const id of imageIds) {
  const target = resolve(destRoot, id);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(resolve(repositoryRoot, id), target);
}
console.log(`[sync-web-assets] copied ${imageIds.size} image(s) to ${destRoot}`);
