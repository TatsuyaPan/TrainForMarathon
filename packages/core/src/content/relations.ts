/**
 * 训练思想正文的动态嵌入关系（双轨制的结构化轨）。
 *
 * markdown 轨保持原文不动（课程表格已改为 DSL 代码块，其余表格保留）；
 * 结构化轨在渲染文章时按锚点标题把「紧随其后的块」替换为动态组件：
 * - courses：锚点标题之后、下一个标题之前的全部 code 块（DSL）按顺序替换为一个 embed 节点；
 * - plan / pace-table：锚点标题之后的第一个表格替换为 embed 节点。
 *
 * 关系表是纯数据：web 与小程序都可以消费，平台渲染各自实现。
 */
import type { MarkdownNode } from "../markdown.js";
import { spansToPlainText } from "../markdown.js";

export type ContentEmbedKind = "courses" | "plan" | "pace-table";

export interface ContentEmbed {
  /** 锚点：文章内的标题全文（不含 # 前缀） */
  afterHeading: string;
  kind: ContentEmbedKind;
  /** kind=courses：课程 id，与锚点后的 code 块按顺序一一对应 */
  courseIds?: string[];
  /** kind=plan：计划模板 id */
  planId?: string;
}

export type ContentEmbedNode = { type: "embed" } & ContentEmbed;
export type DisplayNode = MarkdownNode | ContentEmbedNode;

export const CONTENT_EMBEDS: Readonly<Record<string, readonly ContentEmbed[]>> = {
  "training-types/marathon": [
    { afterHeading: "M跑的可用课表", kind: "courses", courseIds: ["m-15km", "m-60min"] },
  ],
  "training-types/threshold": [
    {
      afterHeading: "一些可以被选择的T跑训练",
      kind: "courses",
      courseIds: ["t-20min", "t-2k-x5", "t-6min-x8", "t-8min-x6", "t-combo-50", "t-combo-50b"],
    },
  ],
  "training-types/interval": [
    {
      afterHeading: "一些可用的I跑训练课表",
      kind: "courses",
      courseIds: ["i-yasso-800", "i-1000-x8", "i-3min-x8", "i-pyramid", "i-400-x20"],
    },
  ],
  "training-types/repetition": [
    {
      afterHeading: "一些可用的重复跑课表跑法",
      kind: "courses",
      courseIds: ["r-200-x20", "r-400-x10", "r-200-400-combo", "r-decreasing", "r-800-hard"],
    },
  ],
  "training-types/mixed": [
    {
      afterHeading: "一些可用课表",
      kind: "courses",
      courseIds: ["mix-pyramid-54321", "mix-tm-short", "mix-tme-long", "mix-t-only", "mix-tir", "mix-tr"],
    },
  ],
  "training-types/pace-baseline": [
    { afterHeading: "一个典型的配速表格及对应说明", kind: "pace-table" },
  ],
  "plans/20-week": [
    { afterHeading: "训练计划", kind: "plan", planId: "20-week" },
  ],
  "plans/5-week-cycle": [
    { afterHeading: "训练计划内容", kind: "plan", planId: "5-week-cycle" },
  ],
};

export function contentEmbedsFor(contentId: string): readonly ContentEmbed[] {
  return CONTENT_EMBEDS[contentId] ?? [];
}

/**
 * 双轨替换（纯函数）：在节点序列中把锚点后的块替换为 embed 节点。
 * markdown 渲染器不需要任何改动；markdown 原文保持完整。
 */
export function applyContentEmbeds(contentId: string, nodes: readonly MarkdownNode[]): DisplayNode[] {
  const embeds = contentEmbedsFor(contentId);
  if (embeds.length === 0) return [...nodes];
  const out: DisplayNode[] = [];
  let lastHeading = "";
  for (const node of nodes) {
    if (node.type === "heading") {
      lastHeading = spansToPlainText(node.spans);
      out.push(node);
      continue;
    }
    if (node.type === "code") {
      const embed = embeds.find((e) => e.kind === "courses" && e.afterHeading === lastHeading);
      if (embed) {
        if (!out.some((entry) => entry.type === "embed" && entry.kind === "courses" && entry.afterHeading === lastHeading)) {
          out.push({ type: "embed", kind: "courses", afterHeading: embed.afterHeading, courseIds: embed.courseIds });
        }
        continue;
      }
      out.push(node);
      continue;
    }
    if (node.type === "table") {
      const embed = embeds.find((e) =>
        (e.kind === "plan" || e.kind === "pace-table") && e.afterHeading === lastHeading);
      if (embed && !out.some((entry) => entry.type === "embed" && entry.kind === embed.kind && entry.afterHeading === lastHeading)) {
        out.push({ type: "embed", kind: embed.kind, afterHeading: embed.afterHeading, planId: embed.planId });
        continue;
      }
      out.push(node);
      continue;
    }
    out.push(node);
  }
  return out;
}
