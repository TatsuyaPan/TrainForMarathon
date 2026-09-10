# Workout DSL 规范（按版本冻结）

本目录保存 Workout DSL 的**原始规范**。规范按版本冻结：一旦某个版本发布，对应目录不再改动，后续实现（core、Web、小程序、设备端或第三方平台）必须以该目录下的冻结文本为准。

## 目录约定

```text
spec/dsl/
  README.md                  # 本文件：版本政策与索引
  v1/workout-dsl-v1.md       # 版本 1 冻结规范（不再修改）
  v2/workout-dsl-v2.md       # 未来版本，另开目录
```

## 版本政策

1. **一个版本一份规范。** 每个版本目录内的规范是自包含的：领域模型、语法、词法、数值约束、版本选择、规范化与汇总规则都写在该文件中，不依赖其他版本的描述。
2. **冻结不可改。** 已发布版本目录中的文件只允许修正事实性笔误，且必须单独提交、单独说明；语义变更一律进入新版本目录。
3. **解析器与版本一一对应。** core 的 `packages/core/src/dsl/v<版本>.ts` 是该版本的基础实现；每个版本导出
   `parseWorkoutDslV<版本>(text)` 与 `serializeWorkoutV<版本>(workout, options?)`。
   平台也可以只依赖某一版：`import { parseWorkoutDslV1 } from "@train-for-marathon/core/dsl/v1"`
   （子路径入口与版本目录一一对应，不引入其它版本的解析器）。
4. **统一入口负责分发。** `packages/core/src/dsl/registry.ts` 提供 `CURRENT_WORKOUT_DSL_VERSION`、`detectWorkoutDslVersion`、`parseWorkoutDsl`、`serializeWorkout`。未声明版本时使用平台当前最新版解析器；显式声明了不支持的版本时抛出版本错误，不猜测、不降级。
5. **平台可自带解析器。** 平台可以只依赖 core 的默认实现，也可以自行实现或替换某个版本的解析器，只要满足冻结规范中的无损往返要求。
6. **规范里的示例是可执行的。** 每份规范「合法示例」一节中的每个 ```` ```text ```` 代码块都会被一致性测试解析并往返校验，因此示例本身就是实现必须满足的验收用例。

## 版本索引

| 版本 | 冻结规范 | 状态 | 解析器 / 序列化器 | 一致性测试 |
| --- | --- | --- | --- | --- |
| 1 | [v1/workout-dsl-v1.md](./v1/workout-dsl-v1.md) | 冻结 | `packages/core/src/dsl/v1.ts`：`parseWorkoutDslV1` / `serializeWorkoutV1` | `packages/core/test/workout-dsl.test.ts`、`workout-dsl-version.test.ts`、`dsl-spec-conformance.test.ts` |

版本 1 概要：首个正式版本，阶段化 Workout AST、独立恢复/休息步骤、版本声明可省略、`GOAL` 必填。

## 新增版本流程

1. 新建 `spec/dsl/v<版本>/`，先写该版本的完整自包含规范，并在上面的版本索引登记；
2. 在 core 新增 `packages/core/src/dsl/v<版本>.ts`，导出 `parseWorkoutDslV<版本>` 与 `serializeWorkoutV<版本>`；
3. 在 `packages/core/src/dsl/registry.ts` 的 `WORKOUT_DSL_PARSERS` / `WORKOUT_DSL_SERIALIZERS` 注册，并为 `CURRENT_WORKOUT_DSL_VERSION` 更新到最新版；
4. 在 `packages/core/src/dsl/index.ts` 补导出版本明确的解析入口；
5. 跑 `npm test`：`packages/core/test/dsl-spec-conformance.test.ts` 会自动要求「规范目录 ↔ 注册表」一一对应，并把新版本规范的合法示例全部往返一遍。

新版本可以**复用**旧版本的实现（例如 `v2.ts` 内部 `import { parseWorkoutDslV1 } from "./v1.js"`，只覆盖变化的部分），这是推荐做法；但复用只能通过导入，不能回头修改已冻结版本的实现。

## 相关文档

- 设计背景与课程库模型：[课程库与 Workout DSL 重构设计](../../docs/superpowers/specs/2026-09-10-course-library-dsl-design.md)
- Web 交互设计：[课程库与课程编辑器交互设计](../../docs/superpowers/specs/2026-09-10-course-library-interaction-design.md)
- 实施计划：[课程库与 Workout DSL 实施计划](../../docs/superpowers/plans/2026-09-10-course-library-dsl.md)

出现冲突时，**冻结规范优先**，实现与交互文档随之修正。
