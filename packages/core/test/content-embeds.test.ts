import { describe, expect, it } from "vitest";
import { renderMarkdown, spansToPlainText, type MarkdownNode } from "../src/markdown.js";
import {
  applyContentEmbeds,
  contentEmbedsFor,
  CONTENT_EMBEDS,
  type DisplayNode,
} from "../src/content/relations.js";
import { getContentById } from "../src/content/catalog.js";
import { parseWorkoutDsl } from "../src/dsl/registry.js";
import { getLibraryCourse, BUILTIN_COURSES } from "../src/library.js";
import { listPlanTemplates } from "../src/plans/registry.js";
import { describePlanTemplate } from "../src/plans/preview.js";
import type { Workout } from "../src/domain.js";

function codeBlocksBetween(nodes: readonly MarkdownNode[], headingText: string): string[] {
  const blocks: string[] = [];
  let active = false;
  for (const node of nodes) {
    if (node.type === "heading") {
      active = spansToPlainText(node.spans) === headingText;
      continue;
    }
    if (active && node.type === "code") blocks.push(node.text);
  }
  return blocks;
}

function firstTableAfter(nodes: readonly MarkdownNode[], headingText: string): boolean {
  let active = false;
  for (const node of nodes) {
    if (node.type === "heading") {
      active = spansToPlainText(node.spans) === headingText;
      continue;
    }
    if (active && node.type === "table") return true;
  }
  return false;
}

function stripVersion(workout: Workout): Omit<Workout, "dslVersion"> {
  const { dslVersion: _version, ...rest } = workout;
  return rest;
}

describe("applyContentEmbeds（双轨替换）", () => {
  const nodes = (): MarkdownNode[] => [
    { type: "heading", level: 2, spans: [{ text: "一些可用课表" }] },
    { type: "paragraph", spans: [{ text: "说明文字" }] },
    { type: "code", text: "GOAL:混合刺激\nMS:5km@M" },
    { type: "code", text: "GOAL:混合刺激\nMS:20min@T" },
    { type: "heading", level: 2, spans: [{ text: "训练计划" }] },
    { type: "table", headers: [[{ text: "周次" }]], rows: [] },
  ];

  it("courses：锚点后的 code 块整体替换为一个 embed 节点", () => {
    const out = applyContentEmbeds("training-types/mixed", nodes());
    const embeds = out.filter((node): node is DisplayNode & { type: "embed" } => node.type === "embed");
    expect(embeds).toHaveLength(1);
    expect(embeds[0].kind).toBe("courses");
    expect(embeds[0].courseIds).toHaveLength(6);
    expect(out.filter((node) => node.type === "code")).toHaveLength(0);
    expect(out.some((node) => node.type === "paragraph")).toBe(true);
  });

  it("plan：锚点后的表格替换为 embed 节点", () => {
    const out = applyContentEmbeds("plans/20-week", [
      { type: "heading", level: 2, spans: [{ text: "训练计划" }] },
      { type: "table", headers: [], rows: [] },
    ]);
    expect(out).toEqual([
      { type: "heading", level: 2, spans: [{ text: "训练计划" }] },
      { type: "embed", kind: "plan", afterHeading: "训练计划", planId: "20-week" },
    ]);
  });

  it("锚点漂移（标题不存在）时输出不变", () => {
    const source = [
      { type: "heading", level: 2, spans: [{ text: "别的标题" }] },
      { type: "code", text: "GOAL:x\nMS:10min@E" },
    ] as MarkdownNode[];
    expect(applyContentEmbeds("training-types/mixed", source)).toEqual(source);
  });

  it("无嵌入关系的文章原样返回", () => {
    const source = [{ type: "paragraph", spans: [{ text: "hello" }] }] as MarkdownNode[];
    expect(applyContentEmbeds("foundations", source)).toEqual(source);
  });

  it("同一锚点下只替换一次（不重复插入）", () => {
    const source: MarkdownNode[] = [
      { type: "heading", level: 2, spans: [{ text: "一些可用课表" }] },
      { type: "code", text: "GOAL:混合刺激\nMS:5km@M" },
      { type: "code", text: "GOAL:混合刺激\nMS:20min@T" },
      { type: "code", text: "GOAL:混合刺激\nMS:3km@M" },
    ];
    const out = applyContentEmbeds("training-types/mixed", source);
    expect(out.filter((node) => node.type === "embed")).toHaveLength(1);
    expect(out.filter((node) => node.type === "code")).toHaveLength(0);
  });
});

describe("嵌入关系表一致性", () => {
  it("每个锚点标题都存在于对应文章", () => {
    for (const [contentId, embeds] of Object.entries(CONTENT_EMBEDS)) {
      const content = getContentById(contentId);
      const nodes = renderMarkdown(content.markdown);
      const headings = new Set(
        nodes.filter((node) => node.type === "heading").map((node) => spansToPlainText(node.spans)),
      );
      for (const embed of embeds) {
        expect(headings, `${contentId} 缺少锚点标题「${embed.afterHeading}」`).toContain(embed.afterHeading);
      }
    }
  });

  it("courses：code 块数量与顺序和课程库一一对应，DSL 结构一致", () => {
    for (const [contentId, embeds] of Object.entries(CONTENT_EMBEDS)) {
      const content = getContentById(contentId);
      const nodes = renderMarkdown(content.markdown);
      for (const embed of embeds) {
        if (embed.kind !== "courses") continue;
        const blocks = codeBlocksBetween(nodes, embed.afterHeading);
        expect(blocks.length, `${contentId}「${embed.afterHeading}」code 块数量`).toBe(embed.courseIds!.length);
        embed.courseIds!.forEach((courseId, index) => {
          const course = getLibraryCourse(courseId);
          expect(course, `${contentId} 引用了不存在的课程 ${courseId}`).toBeDefined();
          const parsed = parseWorkoutDsl(blocks[index]);
          expect(stripVersion(parsed), `${contentId} 第 ${index + 1} 个 DSL 块与课程 ${courseId} 不一致`).toEqual(
            stripVersion(course!.workout),
          );
        });
      }
    }
  });

  it("plan：planId 都存在于计划注册表", () => {
    const ids = new Set(listPlanTemplates().map((template) => template.id));
    for (const embeds of Object.values(CONTENT_EMBEDS)) {
      for (const embed of embeds) {
        if (embed.kind !== "plan") continue;
        expect(ids, `未知计划模板 ${embed.planId}`).toContain(embed.planId);
      }
    }
  });

  it("pace-table 锚点后有表格可供替换", () => {
    const content = getContentById("training-types/pace-baseline");
    const nodes = renderMarkdown(content.markdown);
    expect(firstTableAfter(nodes, "一个典型的配速表格及对应说明")).toBe(true);
  });

  it("plan 锚点后有表格可供替换", () => {
    expect(firstTableAfter(renderMarkdown(getContentById("plans/20-week").markdown), "训练计划")).toBe(true);
    expect(firstTableAfter(renderMarkdown(getContentById("plans/5-week-cycle").markdown), "训练计划内容")).toBe(true);
  });

  it("内置课程 id 全部存在（关系表无孤儿引用）", () => {
    const ids = new Set(BUILTIN_COURSES.map((course) => course.id));
    for (const [contentId, embeds] of Object.entries(CONTENT_EMBEDS)) {
      for (const embed of embeds) {
        if (embed.kind !== "courses") continue;
        for (const courseId of embed.courseIds!) {
          expect(ids, `${contentId} 引用了不存在的课程 ${courseId}`).toContain(courseId);
        }
      }
    }
  });
});

describe("describePlanTemplate（计划预览数据）", () => {
  it("周数、行数、跑量与每日安排标签", () => {
    const preview = describePlanTemplate(listPlanTemplates().find((t) => t.id === "20-week")!);
    expect(preview.id).toBe("20-week");
    expect(preview.weekCount).toBe(20);
    expect(preview.rows).toHaveLength(20);
    const first = preview.rows[0];
    expect(first.week).toBe(20);
    expect(first.phase).toBe("基础期");
    expect(first.volumeLabel).toBe("0.6–0.7");
    expect(first.days).toHaveLength(7);
    expect(first.days[0]).toBe("跑休");
    expect(preview.rows[12]?.phase).toBe("巅峰期");
  });

  it("五周循环计划行数与说明", () => {
    const preview = describePlanTemplate(listPlanTemplates().find((t) => t.id === "5-week-cycle")!);
    expect(preview.weekCount).toBe(5);
    expect(preview.rows).toHaveLength(5);
  });

  it("contentEmbedsFor 对无关系的文章返回空", () => {
    expect(contentEmbedsFor("foundations")).toEqual([]);
    expect(contentEmbedsFor("training-types/threshold")).toHaveLength(1);
  });
});
