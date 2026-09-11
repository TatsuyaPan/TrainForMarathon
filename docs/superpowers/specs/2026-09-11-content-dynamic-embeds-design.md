# 训练思想动态嵌入（双轨制）设计

> 状态：设计稿（自审后待确认）
> 关联前提：仓库根 `AGENTS.md`、core `AGENTS.md`（训练思想是基点 / DSL 是共享描述 / core 开源共享）

## 1. 背景与目标

训练思想正文（markdown）是系统基点。此前正文与动态系统（课程库、计划、配速）零关联，像外挂。
本次采用**双轨制**把二者合为一体：

- **markdown 轨（永远存在）**：GitBook 站点、电子书、微信小程序（wapp）阅读；
  课程表格改为 **DSL 代码块**（丹尼尔斯档位制，天然适配），读者可复制 DSL 导入任意实现方——互通。
- **结构化轨（web 动态体验）**：渲染文章时把锚点后的 DSL 代码块 / 表格升级为活组件
  （活课程卡、计划预览、实时配速表），数据全部来自 core，markdown 渲染器不改。

目标产物：同一篇文章，读者看到可复制的 DSL；应用用户看到可交互的活课程。

## 2. 决策记录（冲突裁决）

| 议题 | 弃用 | 采纳 |
| --- | --- | --- |
| 正文训练展示 | `{{course:id}}` 指令写进 markdown | 双轨制：外部关系表 + 渲染时替换 |
| markdown 是否改动 | 完全不动 | 仅课程表格改为 DSL 代码块（其余正文不动；计划表、340 配速表保留） |
| 配速表嵌入 | 不在本次 | 纳入本次（基于非 markdown 数据渲染） |
| 概念层范围 | 完整概念图谱/反向导航/中枢页 | 本次只做最小关系：`sourceContentId` + 嵌入关系表 |
| wapp 兼容 | 改 wapp 渲染器 | 零代码改动（code 块已支持）；未来可消费 core 关系表 |
| 原书 H 写法 | 文档映射或预处理 | **DSL v2 正式支持**（§4.4，冻结流程新增版本） |

## 3. 架构

```text
markdown 轨：正文（课程表格 → DSL 代码块 + 说明行；计划表/配速表保留）
   ├─ GitBook / ebook：可读可复制
   └─ wapp：渲染器支持 code 块，零改动
结构化轨（web）：
   core content/relations.ts
     CONTENT_EMBEDS（锚点标题 → 嵌入类型 + 参数）
     applyContentEmbeds(contentId, nodes) → 锚点后的 code 块/表格 → embed 节点（纯函数）
   web Course.vue → MarkdownNodes（#embed 插槽）→ ContentEmbed.vue
     ├─ courses   → 活课程卡列表（WorkoutDisplay + 收藏 + 出处链接）
     ├─ plan      → 计划预览表 + 「去配置采用」
     └─ pace-table → 实时配速表（基于本人能力；未建档时引导）
```

## 4. 数据模型（core，纯 TS）

### 4.1 `LibraryCourse.sourceContentId`（类型化出处，最小概念关系）

`packages/core/src/library.ts`：

- `LibraryCourse` 增加 `sourceContentId?: string`
- `CreateLibraryCourseInput`、`createLibraryCourse`、`cloneLibraryCourse` 透传
- 六个出处常量改为对象，`builtin()` 兼容字符串/对象两种入参：

```ts
const LINKS = { source: "《乳酸阈值跑》", contentId: "training-types/threshold" };
const VO2 = { source: "《最大摄氧量跑》", contentId: "training-types/interval" };
const REP = { source: "《重复跑》", contentId: "training-types/repetition" };
const MARATHON = { source: "《马拉松配速跑》", contentId: "training-types/marathon" };
const EASY = { source: "《轻松跑》", contentId: "training-types/easy" };
const MIX = { source: "《混合训练》", contentId: "training-types/mixed" };
```

ST 课程（《重复跑》· 项目扩展）无对应文章表格，不设 contentId。

### 4.2 `content/relations.ts`（新增）

```ts
import type { MarkdownNode } from "../markdown.js";

export type ContentEmbedKind = "courses" | "plan" | "pace-table";

export interface ContentEmbed {
  /** 锚点：文章内的二级标题全文（不含 # 前缀），在该标题后的块被替换 */
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
    { afterHeading: "一些可以被选择的T跑训练", kind: "courses",
      courseIds: ["t-20min", "t-2k-x5", "t-6min-x8", "t-8min-x6", "t-combo-50", "t-combo-50b"] },
  ],
  "training-types/interval": [
    { afterHeading: "一些可用的I跑训练课表", kind: "courses",
      courseIds: ["i-yasso-800", "i-1000-x8", "i-3min-x8", "i-pyramid", "i-400-x20"] },
  ],
  "training-types/repetition": [
    { afterHeading: "一些可用的重复跑课表跑法", kind: "courses",
      courseIds: ["r-200-x20", "r-400-x10", "r-200-400-combo", "r-decreasing", "r-800-hard"] },
  ],
  "training-types/mixed": [
    { afterHeading: "一些可用课表", kind: "courses",
      courseIds: ["mix-pyramid-54321", "mix-tm-short", "mix-tme-long", "mix-t-only", "mix-tir", "mix-tr"] },
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
 * 双轨替换（纯函数，wapp 将来可直接复用）：
 * - courses：锚点标题之后、下一个标题之前的 code 块按顺序换成 embed 节点
 * - plan / pace-table：锚点标题之后的第一个表格换成 embed 节点
 */
export function applyContentEmbeds(
  contentId: string,
  nodes: readonly MarkdownNode[],
): DisplayNode[] {
  const embeds = contentEmbedsFor(contentId);
  if (embeds.length === 0) return [...nodes];
  const out: DisplayNode[] = [];
  let lastHeading = "";
  let usedCourses = false;
  for (const node of nodes) {
    if (node.type === "heading") {
      lastHeading = spansToPlainText(node.spans);
      usedCourses = false;
      out.push(node);
      continue;
    }
    if (node.type === "code") {
      const embed = embeds.find((e) => e.kind === "courses" && e.afterHeading === lastHeading);
      if (embed && !usedCourses) {
        out.push({ type: "embed", kind: "courses", afterHeading: embed.afterHeading, courseIds: embed.courseIds });
        continue;
      }
      out.push(node);
      continue;
    }
    if (node.type === "table") {
      const embed = embeds.find((e) =>
        (e.kind === "plan" || e.kind === "pace-table") && e.afterHeading === lastHeading);
      if (embed) {
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
```

注意：`usedCourses` 每遇到新标题即重置——同一标题下多个 code 块只整体替换一次（一个 embed 节点携带全部 courseIds，渲染器一次渲染卡列表）。plan/pace-table 同理只替换该标题后的第一个表格。

### 4.3 `describePlanTemplate`（计划预览数据，core）

`packages/core/src/plans/preview.ts`（新增）：

```ts
import type { PlanTemplate } from "../domain.js";

export interface PlanPreviewRow {
  week: number;
  phase: string;
  volumeLabel: string;
  days: string[];
  note?: string;
}

export interface PlanPreview {
  id: string;
  name: string;
  weekCount: number;
  rows: PlanPreviewRow[];
}

export function describePlanTemplate(template: PlanTemplate): PlanPreview {
  return {
    id: template.id,
    name: template.name,
    weekCount: template.weekCount,
    rows: template.weeks.map((week) => ({
      week: week.week,
      phase: week.phase,
      volumeLabel: week.volume.min === week.volume.max
        ? String(week.volume.min)
        : `${week.volume.min}–${week.volume.max}`,
      days: week.days.map((day) => day.label),
      note: week.note,
    })),
  };
}
```

由 `packages/core/src/index.ts` 导出。

### 4.4 Workout DSL v2：H 记法（按冻结流程新增版本）

原书 H 与 I 同一强度（最大摄氧量），区别仅在负荷控制方式：H 基于时间（`3min@H`）、I 基于距离（`800m@I`）。
v1 用负荷类型天然表达该区别（`3min@I`），但为**完整支持原书记法**（第三方可原文粘贴导入），按
`spec/dsl/README.md` 的新增版本流程发布 v2：

**v2 语义（相对 v1 的唯一变更）：**

- 新增词法 `@H`：解析为 `{ type: "daniels", zone: "I" }` + 负荷必须为时间类型；
  距离负荷 + `@H`（如 `800m@H`）→ 报错（H 基于时间）；
- 序列化输出**规范写法**：H 步骤输出 `@I`（负荷类型已携带时间语义；往返以结构等价为准，
  与 v1 §5 的规范化规则一致）；
- 其余语法、语义、约束与 v1 完全一致（v2 是 v1 的严格超集）。

**版本策略：**

- `CURRENT_WORKOUT_DSL_VERSION` 更新为 2（按 spec README 流程）；v2 兼容 v1 全部合法输入，
  未声明版本的旧内容解析结果除 `dslVersion` 外不变；
- 受影响的现有测试：断言 `dslVersion === 1` 或导出含 `WORKOUT/1` 行头的用例改为
  `WORKOUT/2` 或结构断言；
- 序列化不再保留 H 字母的原因：保留 H 需要在 AST 增加记法标记并整体重写 v1 解析器
  （冻结规范禁止回头修改 v1 实现），收益仅为导出文本字形；语义无损，故不保留。

**实现（全部新增，不改 v1.ts）：**

- `spec/dsl/v2/workout-dsl-v2.md`：自包含完整规范（v1 全文 + H 记法节）+ 合法示例（含 H）
- `packages/core/src/dsl/v2.ts`：
  - `parseWorkoutDslV2`：正则校验 H 用法（`距离负荷@H` 报错）→ `@H` 替换为 `@I` →
    `parseWorkoutDslV1` → `dslVersion = 2`；
  - `serializeWorkoutV2`：`dslVersion = 1` 的浅拷贝 → `serializeWorkoutV1(..., { version: false })` →
    头部 `WORKOUT/2`（`options.version !== false` 时）；
- `registry.ts`：注册 v2 解析器/序列化器，`CURRENT_WORKOUT_DSL_VERSION = 2`，
  `SUPPORTED_WORKOUT_DSL_VERSIONS = [1, 2]`；
- `packages/core/src/dsl/index.ts` 补导出 `parseWorkoutDslV2` / `serializeWorkoutV2`；
- 一致性自动覆盖：`dsl-spec-conformance.test.ts` 要求「规范目录 ↔ 注册表」一一对应，
  并往返 v2 规范全部合法示例。

**markdown H 行的写法：** 显式声明 `WORKOUT/2`（老版本消费方收到明确版本错误，而不是误解析）：

````markdown
```text
WORKOUT/2
TITLE:3 分钟间歇 ×8
GOAL:最大摄氧量
WU:15min@E
MS:8x(3min@H@RPE9+2min@jog)
CD:10min@E
```
````

其余（I 距离行、T/M/R/mixed 全部课程）保持无版本声明的规范写法。

## 5. markdown 内容改造（5 篇 × 2 副本）

副本位置：`ebook/src/md/`（应用读取源）与 `src/`（GitBook 站点源），两份必须同步。

涉及文件（精确路径）：

```text
2-训练类型/3-马拉松配速跑.md        → m-15km, m-60min
2-训练类型/4-乳酸阈值跑.md          → t-20min, t-2k-x5, t-6min-x8, t-8min-x6, t-combo-50, t-combo-50b
2-训练类型/5-最大摄氧量跑.md        → i-yasso-800, i-1000-x8, i-3min-x8, i-pyramid, i-400-x20
2-训练类型/6-重复跑.md             → r-200-x20, r-400-x10, r-200-400-combo, r-decreasing, r-800-hard
2-训练类型/7-混合训练.md           → mix-pyramid-54321, mix-tm-short, mix-tme-long, mix-t-only, mix-tir, mix-tr
```

（`1-训练基准和训练类型划分.md` 的 340 配速表、`2-轻松跑.md` 无表格，均不动。）

改造规则（只改课表表格，正文其余不动）：

1. 删除原课表表格（`|课表内容|说明|选择建议|备注|` 结构）。
2. 每个课程依次输出：
   - 一个 ```text 代码块：**与库课程完全一致的序列化 DSL**（从 `library.ts` 的 builtin() DSL 逐字复制）
   - 一行正文说明：`说明：…；选择建议：…；备注：…`（信息来自原表格，没有的列省略）

示例（`training-types/threshold` 中第一个课程）：

````markdown
```text
TITLE:20 分钟阈值连续跑
GOAL:乳酸阈能力
MS:20min@T@RPE7
```

说明：以 T 配速连续跑 20 分钟。选择建议：适合周跑量较低的跑者、连续一周低强度慢跑后的简单心肺刺激，也可以作为基本元素插入混合课表中。备注：部分情况下可以直接跑 20min×2 甚至 20min×3。
````

（无 `WORKOUT/1` 声明时按当前最新版解析，与库课程序列化输出一致。）

一致性由 §7 测试保证：每个 code 块的 DSL 解析+序列化后必须与对应库课程完全一致。

特殊说明：
- `interval` 文章的 H 行（`(3min@H+2min@jg)*7~10`、`(3min@H+2min@jg)*3+…`）：DSL 块声明
  `WORKOUT/2` 并使用 `@H` 记法（§4.4），忠实原书；说明行注明「原书以 H 表示按时间控制的 I 强度」。
- 计划表（20 周/五周）与 340 配速表**不动**——它们没有 DSL 形态，markdown 轨保留原文。

改造后运行 `node packages/core/scripts/generate-content.mjs` 重新生成 `generated.ts`。

## 6. web 渲染

### 6.1 `MarkdownNodes.vue`：embed 分支

```vue
<div v-else-if="node.type === 'embed'" class="doc-embed">
  <slot name="embed" :embed="node" />
</div>
```

### 6.2 `ContentEmbed.vue`（新增，`web/src/components/`）

props：`embed`（ContentEmbedNode）。三分支：

- **courses**：`embed.courseIds` 逐个 `getLibraryCourse(id)`（内置课程）→
  卡片：课程名 + `WorkoutDisplay(:workout)` + 底部操作行：
  - 「收藏到课程库」：`upsertCustomCourse(cloneLibraryCourse(course))` + `notifySuccess`
  - 出处链接（`sourceContentId` → `#/course/:id`，仅存在时显示）
  - `data-testid="embed-course-<id>"`
- **plan**：`describePlanTemplate(getPlanTemplate(embed.planId))` → 紧凑表
  （周次 / 阶段 / 跑量 / 周一~周日训练安排，`note` 显示为小字）+
  底部按钮「去配置采用」→ `#/settings`（配置页可重选模板并重建课表）
- **pace-table**：`athleteFitness(getAthlete())` 计算：
  - 有 `mode`：`fitnessPaceRows(fitness)` 渲染行（档位色 chip + 名称 + 区间，与 Fitness.vue 一致）
  - 无：提示卡「尚未建立能力基准 → 去配置」链接 `#/fitness`
  - `data-testid="embed-pace-table"`

### 6.3 `Course.vue` 接线

```js
import { applyContentEmbeds } from "@core";
nodes.value = applyContentEmbeds(props.id, renderMarkdown(content.markdown, { ... }));
```

模板：

```vue
<MarkdownNodes :nodes="nodes">
  <template #embed="{ embed }">
    <ContentEmbed :embed="embed" />
  </template>
</MarkdownNodes>
```

### 6.4 `CourseCard.vue` 出处活链接

`course.sourceContentId` 存在时，卡片头部渲染 `course.source` 为链接 chip（`#/course/:sourceContentId`），替代纯文本。

## 7. 测试

### 7.1 core 测试

**DSL v2（新增 `packages/core/test/workout-dsl-v2.test.ts` 或并入现有 dsl 测试）：**

- `parseWorkoutDslV2("WORKOUT/2\nMS:8x(3min@H+2min@jog)")` → 目标 zone "I"、时间负荷、dslVersion 2；
- `800m@H` → 明确报错（H 基于时间）；
- 往返：`parseWorkoutDslV2(serializeWorkoutV2(w))` 结构等于 `w`；
- 序列化规范输出：H 步骤导出为 `@I`，头部 `WORKOUT/2`；
- v2 兼容 v1 全部合法输入（抽样回归）；
- 版本分发：`WORKOUT/1` 文本走 v1 解析器、`WORKOUT/2` 走 v2、未声明走 CURRENT(2)；
- 一致性：`dsl-spec-conformance.test.ts` 自动覆盖「v2 规范目录 ↔ 注册表」+ v2 合法示例往返。

**嵌入关系（新增 `packages/core/test/content-embeds.test.ts`）：**

- `applyContentEmbeds` 单元：锚点后 code 块替换、plan/pace-table 表格替换、无锚点不动、锚点漂移（标题不存在）时输出不变。
- 关系表一致性：
  - 每个 embed 的 `afterHeading` 存在于对应文章 markdown 的标题中；
  - courses：锚点后的 code 块数量 == `courseIds` 数量；每个块 `parseWorkoutDsl`（尊重块内声明的版本）后与 `getLibraryCourse(id).workout` 结构一致（dslVersion 归一）；
  - plan：`planId` 在 `listPlanTemplates()` 中存在。
- `describePlanTemplate`：周数、行数、volumeLabel 拼接、day 标签。
- `sourceContentId`：内置 T/I/R/M/E/mixed 课程均带出处；`cloneLibraryCourse` 保留出处。

### 7.2 web 测试

- `ContentEmbed` 组件：courses 渲染卡列表与收藏动作；plan 渲染周表；pace-table 有/无能力两态。
- `Course.vue`：嵌入文章渲染出 embed 块（`data-testid` 存在）、非嵌入文章照旧。
- `CourseCard`：内置课程出处链接存在、自定义课程无链接。

### 7.3 验证命令

```bash
cd core
npm run verify          # core 测试 + typecheck + build + web 测试与构建
```

浏览器 DOM 断言（Playwright）：文章页表格已被活课程卡替换、计划预览表渲染、pace-table 两态、收藏动作落库。

## 8. 明确不做（本次）

- 概念图谱中枢页、文章反向导航列表（后续工作项）
- wapp 代码改动（零改动；markdown 变更只是内容）
- DSL 冻结规范改动
- 340 配速表、计划表在 markdown 轨的改动

## 9. 任务分解（TDD，每步提交）

1. core：`sourceContentId` 收尾（常量对象化、builtin 兼容、clone 透传）+ 测试
2. core：DSL v2——`spec/dsl/v2/workout-dsl-v2.md` + `dsl/v2.ts` + 注册表（CURRENT=2）+ 导出 + 受影响旧测试修正
3. core：`content/relations.ts`（CONTENT_EMBEDS + applyContentEmbeds）+ 单元测试
4. core：`plans/preview.ts`（describePlanTemplate）+ 测试
5. core：一致性测试（关系表 ↔ 内容 ↔ 课程库 ↔ registry）
6. markdown：5 篇 × 2 副本课程表格 → DSL 代码块（H 行声明 WORKOUT/2）；重新生成 `generated.ts`
7. web：`MarkdownNodes` embed 分支 + `ContentEmbed.vue` + `Course.vue` 接线 + `CourseCard` 出处链接
8. web：组件测试
9. `npm run verify` + 浏览器 DOM 断言

## 10. 风险与自审要点

- **锚点漂移**：内容将来改标题 → 一致性测试在 core 测试阶段报错，不会静默失效。
- **code 块顺序匹配**：按顺序一一对应 + 数量校验 + 结构一致校验，三重保险。
- **DSL v2 影响面**：CURRENT 升 2 后所有未声明版本内容按 v2 解析，AST 的 `dslVersion` 变为 2、导出带 `WORKOUT/2` 行头；受影响断言按结构等价改。wapp 通过 vendor 同步产物，若有对导出文本的断言需同步核查。
- **双副本同步**：`ebook/src` 与 `src` 同时修改；测试只覆盖 ebook 源，GitBook 副本靠人工同步（沿用现有约定）。
- **wapp 回归**：wapp 渲染器对 code 块的支持已有测试；本次不碰 wapp 代码，仅内容变化。
- **pace-table 无能力态**：必须处理（新用户直接看文章时未建档）。
- **收藏幂等**：收藏用 `upsertCustomCourse(cloneLibraryCourse(course))`，每次生成新 id，不覆盖已有自定义课程。
