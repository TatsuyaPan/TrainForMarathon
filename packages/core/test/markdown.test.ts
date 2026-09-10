import { describe, expect, it } from "vitest";
import {
  parseInline,
  renderMarkdown,
  resolveImage,
  resolveRelativeUrl,
  spansToPlainText,
} from "../src/markdown.js";

describe("markdown renderer", () => {
  it("parses headings and merges paragraphs", () => {
    const nodes = renderMarkdown("# 标题\n\n第一段\n第二段继续");
    expect(nodes[0].type).toBe("heading");
    expect(nodes[0].level).toBe(1);
    expect(spansToPlainText(nodes[0].spans)).toBe("标题");
    expect(nodes[1].type).toBe("paragraph");
    expect(spansToPlainText(nodes[1].spans)).toBe("第一段 第二段继续");
  });

  it("parses lists and quotes", () => {
    const nodes = renderMarkdown("> 引用内容\n\n1. 第一\n2. 第二\n\n- 无序A");
    expect(nodes[0].type).toBe("quote");
    expect(spansToPlainText(nodes[0].spans)).toBe("引用内容");
    expect(nodes[1].type).toBe("list");
    expect(nodes[1].ordered).toBe(true);
    expect(nodes[1].items.length).toBe(2);
    expect(nodes[2].type).toBe("list");
    expect(nodes[2].ordered).toBe(false);
  });

  it("parses tables and drops the separator row", () => {
    const nodes = renderMarkdown("|类型|配速|\n|:-:|:-:|\n|T|325|\n|I|310|");
    const table = nodes[0];
    expect(table.type).toBe("table");
    expect(table.headers.map(spansToPlainText)).toEqual(["类型", "配速"]);
    expect(table.rows.map((row) => row.map(spansToPlainText))).toEqual([
      ["T", "325"],
      ["I", "310"],
    ]);
  });

  it("parses inline bold / code / links / italic", () => {
    const spans = parseInline("**粗体** `代码` [链接](https://example.com) *斜体*");
    expect(spans.some((s) => s.bold && s.text === "粗体")).toBe(true);
    expect(spans.some((s) => s.code && s.text === "代码")).toBe(true);
    expect(spans.some((s) => s.link?.href === "https://example.com")).toBe(true);
    expect(spans.some((s) => s.italic && s.text === "斜体")).toBe(true);
  });

  it("resolveAsset hook wins over baseUrl", () => {
    const src = resolveImage("../../image/x.png", {
      baseUrl: "https://cdn.example.com/a/b",
      resolveAsset: () => "cloud://env.abc/course-assets/x.png",
    });
    expect(src).toBe("cloud://env.abc/course-assets/x.png");
  });

  it("resolves relative paths against the md directory", () => {
    const baseUrl = "https://cdn.example.com/gh/u/r@b/src/md/2-训练类型";
    expect(resolveRelativeUrl(baseUrl, "../../image/taper_1.jpg")).toBe(
      "https://cdn.example.com/gh/u/r@b/src/image/taper_1.jpg",
    );
  });

  it("resolves asset://, absolute protocols, and passthrough", () => {
    expect(resolveImage("asset://src%2Fimage%2Fx.png")).toBe("/assets/course/src/image/x.png");
    expect(resolveImage("https://cdn.example.com/x.png")).toBe("https://cdn.example.com/x.png");
    expect(resolveImage("cloud://env.abc/x.png")).toBe("cloud://env.abc/x.png");
    expect(resolveImage("../../image/x.png")).toBe("../../image/x.png");
  });

  it("resolveLink hook converts .md links to content://", () => {
    const resolveLink = (href) => (href.endsWith(".md") ? `content://${href}` : href);
    const spans = parseInline("[轻松跑](2-轻松跑.md)", { resolveLink });
    expect(spans[0].link.href).toBe("content://2-轻松跑.md");
  });
});
