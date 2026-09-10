/**
 * 极简 Markdown 渲染器（平台无关，纯函数）。
 * 覆盖课程内容实际用到的语法：标题、段落、有序/无序列表、引用、表格、代码块、
 * 分隔线、图片、行内粗体/斜体/行内代码/链接。
 *
 * 资产寻址通过钩子与调用方解耦：
 * - resolveAsset(raw)：图片相对路径 → 实际地址（web 用仓库路径，小程序用 cloud fileID）
 * - resolveLink(href)：.md 相对链接 → content://id 等
 * 未提供钩子时：相对路径 + baseUrl 拼接，或原样保留。
 */

export interface InlineSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  image?: boolean;
  link?: { href: string; label: string };
}

export interface ListItem {
  spans: InlineSpan[];
  depth: number;
}

export type MarkdownNode =
  | { type: "heading"; level: number; spans: InlineSpan[] }
  | { type: "paragraph"; spans: InlineSpan[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "quote"; spans: InlineSpan[] }
  | { type: "table"; headers: InlineSpan[][]; rows: InlineSpan[][][] }
  | { type: "image"; alt: string; src: string }
  | { type: "code"; text: string }
  | { type: "hr" };

export interface RenderMarkdownOptions {
  assetPrefix?: string;
  /** md 所在目录的地址；图片相对路径基于它解析 */
  baseUrl?: string;
  /** .md 相对链接 → 目标 id（如 content://xxx） */
  resolveLink?: (href: string) => string;
  /** 图片相对路径 → 实际地址（优先级最高） */
  resolveAsset?: (raw: string) => string;
}

const CODE_FENCE = /^```/u;

/** 块级解析：把 markdown 切成块，逐块生成节点 */
export function renderMarkdown(markdown: string, options: RenderMarkdownOptions = {}): MarkdownNode[] {
  const assetPrefix = options.assetPrefix ?? "/assets/course";
  const baseUrl = options.baseUrl;
  const resolveLink = options.resolveLink;
  const resolveAsset = options.resolveAsset;
  const lines = String(markdown ?? "")
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n/gu, "\n")
    .split("\n");
  const nodes: MarkdownNode[] = [];
  let index = 0;

  const imageSrc = (raw: string): string =>
    resolveImage(raw, { assetPrefix, baseUrl, resolveAsset });

  while (index < lines.length) {
    const line = lines[index];

    // 代码块
    if (CODE_FENCE.test(line)) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !CODE_FENCE.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1; // 跳过结束围栏
      nodes.push({ type: "code", text: codeLines.join("\n") });
      continue;
    }

    // 标题
    const heading = /^(#{1,4})\s+(.*)$/u.exec(line);
    if (heading) {
      nodes.push({
        type: "heading",
        level: heading[1].length,
        spans: parseInline(heading[2], { resolveLink }),
      });
      index += 1;
      continue;
    }

    // 分隔线
    if (/^\s*([-*_])\1{2,}\s*$/u.test(line)) {
      nodes.push({ type: "hr" });
      index += 1;
      continue;
    }

    // 表格
    if (line.trim().startsWith("|")) {
      const tableLines: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index].trim());
        index += 1;
      }
      nodes.push(parseTable(tableLines, resolveLink));
      continue;
    }

    // 引用（连续 > 行合并为一段）
    if (/^\s*>\s?/u.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>\s?/u.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/u, ""));
        index += 1;
      }
      nodes.push({ type: "quote", spans: parseInline(quoteLines.join("\n"), { resolveLink }) });
      continue;
    }

    // 列表（连续 - / * / 数字. 行）
    const listItem = /^\s*([-*+]|\d+[.)])\s+(.*)$/u.exec(line);
    if (listItem) {
      const ordered = /\d/u.test(listItem[1]);
      const items: ListItem[] = [];
      while (index < lines.length) {
        const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/u.exec(lines[index]);
        if (!item) break;
        const depth = /^\s+/u.exec(lines[index])?.[0].length ?? 0;
        items.push({ spans: parseInline(item[2], { resolveLink }), depth: Math.floor(depth / 2) });
        index += 1;
      }
      nodes.push({ type: "list", ordered, items });
      continue;
    }

    // 图片（独立行）
    const image = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/u.exec(line);
    if (image) {
      nodes.push({ type: "image", alt: image[1], src: imageSrc(image[2]) });
      index += 1;
      continue;
    }

    // 普通段落（合并连续非空行）
    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^(#{1,4})\s+/u.test(lines[index]) &&
      !/^\s*([-*+]|\d+[.)])\s+/u.test(lines[index]) &&
      !/^\s*>\s?/u.test(lines[index]) &&
      !lines[index].trim().startsWith("|") &&
      !CODE_FENCE.test(lines[index])
    ) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    if (paragraphLines.length > 0) {
      nodes.push({ type: "paragraph", spans: parseInline(paragraphLines.join(" "), { resolveLink }) });
      continue;
    }

    index += 1; // 空行
  }

  return nodes;
}

function parseTable(
  lines: string[],
  resolveLink?: (href: string) => string,
): Extract<MarkdownNode, { type: "table" }> {
  const splitRow = (row: string): string[] =>
    row.replace(/^\||\|$/gu, "").split("|").map((cell) => cell.trim());
  const headers = splitRow(lines[0]).map((cell) => parseInline(cell, { resolveLink }));
  const rows: InlineSpan[][][] = [];
  for (const line of lines.slice(2)) {
    if (/^\s*:?-+:?\s*$/u.test(line.replace(/\|/gu, "").trim())) continue; // 分隔行
    rows.push(splitRow(line).map((cell) => parseInline(cell, { resolveLink })));
  }
  return { type: "table", headers, rows };
}

interface ParseInlineOptions {
  resolveLink?: (href: string) => string;
}

/** 行内解析：粗体 / 斜体 / 行内代码 / 链接 */
export function parseInline(text: string, options: ParseInlineOptions = {}): InlineSpan[] {
  const spans: InlineSpan[] = [];
  let buffer = "";
  let index = 0;

  const flush = (): void => {
    if (buffer) {
      spans.push({ text: buffer });
      buffer = "";
    }
  };

  while (index < text.length) {
    const rest = text.slice(index);

    // 行内代码 `code`
    const code = /^`([^`]+)`/u.exec(rest);
    if (code) {
      flush();
      spans.push({ text: code[1], code: true });
      index += code[0].length;
      continue;
    }

    // 图片（行内，罕见）
    const image = /^!\[([^\]]*)\]\(([^)]+)\)/u.exec(rest);
    if (image) {
      flush();
      spans.push({ text: image[1] || "图片", image: true });
      index += image[0].length;
      continue;
    }

    // 链接 [label](href)
    const link = /^\[([^\]]*)\]\(([^)]+)\)/u.exec(rest);
    if (link) {
      flush();
      const href = options.resolveLink ? options.resolveLink(link[2]) : link[2];
      spans.push({ text: link[1], link: { href, label: link[1] } });
      index += link[0].length;
      continue;
    }

    // 粗体 **text**
    const bold = /^\*\*([^*]+)\*\*/u.exec(rest);
    if (bold) {
      flush();
      spans.push({ text: bold[1], bold: true });
      index += bold[0].length;
      continue;
    }

    // 斜体 *text*（不跨空格，避免误伤）
    const italic = /^\*([^*\s][^*]*)\*/u.exec(rest);
    if (italic) {
      flush();
      spans.push({ text: italic[1], italic: true });
      index += italic[0].length;
      continue;
    }

    buffer += text[index];
    index += 1;
  }
  flush();
  return spans;
}

export interface ResolveImageOptions {
  assetPrefix?: string;
  baseUrl?: string;
  resolveAsset?: (raw: string) => string;
}

/** asset:// / 相对路径 / 绝对协议 统一解析为图片地址 */
export function resolveImage(raw: string, options: ResolveImageOptions = {}): string {
  const assetPrefix = options.assetPrefix ?? "/assets/course";
  if (raw.startsWith("asset://")) {
    const id = decodeURIComponent(raw.slice("asset://".length)).replace(/^\/+/u, "");
    return id ? `${assetPrefix}/${id}` : raw;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(raw) || raw.startsWith("cloud://")) return raw;
  if (options.resolveAsset) return options.resolveAsset(raw);
  if (options.baseUrl) return resolveRelativeUrl(options.baseUrl, raw);
  return raw;
}

/** 基于 baseUrl 所在目录解析相对路径（posix 语义，无 DOM 依赖） */
export function resolveRelativeUrl(baseUrl: string, relativePath: string): string {
  const base = baseUrl.replace(/\/+$/u, "");
  const schemeEnd = base.indexOf("://");
  const hostEnd = base.indexOf("/", schemeEnd + 3);
  const host = hostEnd === -1 ? base : base.slice(0, hostEnd);
  const segments = hostEnd === -1 ? [] : base.slice(hostEnd + 1).split("/").filter(Boolean);
  for (const part of relativePath.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return `${host}/${segments.join("/")}`;
}

export function spansToPlainText(spans: readonly InlineSpan[]): string {
  return (spans ?? []).map((span) => span.text).join("");
}
