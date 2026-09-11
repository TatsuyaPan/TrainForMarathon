# 南风咖啡厅的马拉松训练计划

这一套训练计划基于丹尼尔斯训练体系，包含EMTIR五种基础训练类型，通过五种不同类型的训练组合进行训练。
课表的展示方式会尽可能提供足够的自由度，方便调整。

**训练思路比具体课表更重要**，不理解训练思路（或是课表的设计思路），即使拿了一个课表也不能及时调整适应（除非你有自己的私人教练一直盯着）。因此这一套训练计划会尽可能清晰地展开说明训练的原理，希望看完后可以让大家自己安排和调整属于自己的课表。

最后祝大家科学训练，顺利PB。

个人能力有限，内容中难免出现错漏，如果发现问题，欢迎拍砖指正。

最新版本会发布在[https://tatsuyapan.github.io/TrainForMarathon/][发布地址]

[发布地址]:https://tatsuyapan.github.io/TrainForMarathon/

## 项目定位（开源共享层）

```text
训练思想（基点，本仓库的正文内容）
   └─ DSL（共享描述：公开冻结规范，互通接口，spec/dsl/）
        └─ core（本仓库：可共享的开源内核，纯 TS，平台无关）
             ├─ web（本仓库内：开源的小型预览应用，参考实现与演示）
             └─ 其他平台（微信小程序等闭源发行壳，各自消费本仓库产物）
```

- **训练思想是基点**：正文是纯 markdown 内容；程序化只做「关系」（类型化引用、指令渲染），不拆正文。
- **DSL 是共享描述**：规范优先于实现；即使不使用本仓库，也可仅凭 `spec/dsl/` 自行实现课表互通。
- **core 纯 TS**：不得引入 Vue / 微信 API；平台渲染（Web Vue / 小程序 WXML）各自实现。
- 统一前提见 [AGENTS.md](./AGENTS.md)。

## 项目结构

- `packages/core`：平台无关的训练模型、课表、会话生命周期与统计（`@train-for-marathon/core`）。
- `web`：Vue 3 + TDesign Web 应用，使用浏览器本地存储。
- `spec/dsl`：按版本冻结的 Workout DSL 原始规范。
- `ebook/src`：应用读取的课程正文与图片（见 `packages/core/content-manifest.json`）。
- `src`：GitBook 站点源文件（`SUMMARY.md`、`book.json`），构建产物在 `docs/`。
- `docs/superpowers`：设计文档与实施计划。

> `src` 与 `ebook/src` 当前是同一份内容的两份副本：前者供 GitBook 站点，后者供应用与核心包读取。
> 修改课程正文时两边都要更新，否则站点与应用会不一致。

## 训练会话生命周期

一个训练日可以有零到多个 `TrainingSession`；一次训练最多对应一份实际训练记录：

```text
planned（待完成）
  ├─ done（实际内容、距离、时长、RPE、日志、完成时间）
  └─ skipped（未进行，不产生训练记录）
```

同日多次训练会先聚合为一条日进度：全部完成为“已完成”，全部未进行为“未进行”，状态混合或仍有待完成训练为“部分完成”。

写入会话与课表前的快照（深拷贝 + 归一化）由 core 统一完成，Web 与小程序都不需要自己复制领域对象；
界面层不得出现 JSON 往返深拷贝或直接访问存储，`web/test/domain-boundary.test.js` 会守住这条边界。

## Workout DSL

课表结构（AST）是唯一事实来源，DSL 只在导入、导出与展示时序列化。规范按版本冻结，实现必须以冻结文本为准：

- 版本政策与索引：[`spec/dsl/README.md`](spec/dsl/README.md)
- v1 冻结规范：[`spec/dsl/v1/workout-dsl-v1.md`](spec/dsl/v1/workout-dsl-v1.md)
- v1 解析器 `packages/core/src/dsl/v1.ts`；版本识别与分发 `packages/core/src/dsl/registry.ts`

最小合法课程是 `GOAL:有氧基础` 加一段 `MS:40min@E`：`GOAL` 必填，`TITLE`、`NOTE` 可留空。
未声明 `WORKOUT/n` 时使用平台当前最新版；显式声明了不支持的版本会直接报错，不猜测、不降级。

## 能力与配速

能力（VDOT / 6 秒规则）的推算与档位文案属于 core：`packages/core/src/fitness.ts` 提供
`athleteFitness`、`fitnessPaceRows`、`sixSecondPaceRows`、`vdotPaceRows`、`fitnessModeLabel`
与成绩文案 `formatRaceTime` / `parseRaceTime` / `raceResultsSummary`。

各平台只负责渲染这份数据，不各自拼配速文案，避免同一份能力在不同页面、不同端出现不一致的说法。

课表展示支持**强度 ↔ 配速**两种口径（`TargetDisplayMode`）：

- 强度：DSL 的原始说法（`轻松跑（E）`、`20min@T`）；
- 配速：把档位换算成本人配速（`3:45–4:00/km（T）`、`20min@T · 3:45–4:00/km`）。

换算只发生在展示层：`packages/core/src/dsl/presentation.ts` 的 `danielsPaceDisplay` / `danielsPaceText`、
`formatTargetLabel` 与 `createWorkoutPresentation`、`packages/core/src/workflow.ts` 的 `describeWorkout` /
`formatTrainingDay` 共用同一口径；`trainingPacesFromFitness` 负责「能力 → 配速档位」。
配速口径保留档位字母，E/M 标注估算，ST 与未建立能力时回退强度标签——切换口径不改变 AST，也不写回 DSL。
交互细节见 [`docs/superpowers/specs/2026-09-10-course-library-interaction-design.md`](docs/superpowers/specs/2026-09-10-course-library-interaction-design.md) §19。

## 开发验证

```bash
npm install
npm run verify          # core 测试 + 类型检查 + 构建，然后 web 测试与 web 构建
```

分开执行：

```bash
npm test                # core 单元测试（packages/core/test）
npm run typecheck
npm run build           # 生成 packages/core/dist，web 依赖该产物

npm --prefix web test        # web 单元与组件测试（happy-dom）
npm --prefix web run build
```

浏览器冒烟测试（Playwright，需要先构建并起本地预览）：

```bash
npm --prefix web run build
npm --prefix web run preview      # 保持运行，监听 4173
python web/test/e2e_first_run.py
python web/test/e2e_full_journey.py
python web/test/e2e_session_lifecycle.py
python web/test/e2e_course_library.py
python web/test/e2e_course_editor_keyboard.py
python web/test/e2e_dsl_roundtrip.py
python web/test/e2e_settings_fitness.py
python web/test/e2e_mobile_layout.py
python web/test/e2e_plan_adjust.py
python web/test/e2e_pace_display.py
```

## 持续集成与发布

- `.github/workflows/ci.yml`：push / PR 时安装 core 与 web 依赖并执行 `npm run verify`。
- `.github/workflows/pages.yml`：`main` 分支先跑测试，再把 `web/dist` 发布到 GitHub Pages。
  站点只发布 web 构建产物，不发布仓库源码——所以课程内容、核心包与页面改动都随同一次构建上线。
