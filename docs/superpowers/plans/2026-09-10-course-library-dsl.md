# 课程库与 Workout DSL 实施计划

**日期：** 2026-09-10
**设计来源：** [课程库与 Workout DSL 重构设计](../specs/2026-09-10-course-library-dsl-design.md)、[课程库与课程编辑器交互设计](../specs/2026-09-10-course-library-interaction-design.md)

## 目标

按已确认的设计落地 Workout DSL v1：冻结版本化规范、按版本提供基础解析器、重写 core 模型与内置课程，并完成 Web 课程库（新建/编辑/复制/单条导入/删除 + 结构化展示）。

## 新增要求

1. **规范按版本保存。** 每个版本的原始规范冻结在 `spec/dsl/v<版本>/`，后续实现必须依据冻结文本，不再改动既有版本。
2. **解析器按版本提供。** core 提供版本注册表与版本明确的解析入口，平台可直接复用基础解析器，也可自带解析器。

## 实施步骤

### 一、规范冻结

- [x] 新增 `spec/dsl/README.md`：版本政策、目录约定、新增版本流程
- [x] 新增 `spec/dsl/v1/workout-dsl-v1.md`：v1 冻结规范（模型、语法、词法、数值、版本选择、规范化、汇总、示例）
- [x] 设计文档链接到冻结规范，声明冻结文本为准

### 二、core 模型与解析器

- [x] `domain.ts`：替换为 v1 AST（`Workout`/`WorkoutPhase`/`RunStep`/`RecoveryStep`/`RestStep`/`RepeatBlock`/`Load`/`TrainingTarget`）
- [x] `dsl/errors.ts`：带错误码、字符位置、行列与修复提示的错误对象
- [x] `dsl/workout.ts`：与版本无关的汇总、估算、校验
- [x] `dsl/v1.ts`：v1 语法解析器与序列化器（`parseWorkoutDslV1`/`serializeWorkoutV1`）
- [x] `dsl/registry.ts`：`CURRENT_WORKOUT_DSL_VERSION`、版本识别与分发
- [x] `dsl/edit.ts`：纯函数结构编辑（新增/更新/移动/复制/删除、阶段增删、默认草稿）
- [x] `dsl/presentation.ts`：展示数据（阶段、递归步骤、汇总、结构预览、估算）

### 三、内置课程与消费者

- [x] `library.ts`：`LibraryCourse` 模型 + 23 条内置课程按 v1 重写 + 创建/更新/复制/校验
- [x] `training-visuals.ts`：改为读取 v1 AST
- [x] `workflow.ts`：`describeWorkout`/`formatTrainingDay` 适配新模型
- [x] `plans/session-params.ts`：训练日生成器改为产出 v1 AST

### 四、Web 课程库

- [x] `stores/course-library.js`：新 key `tfm:course-library:v1`、读取校验、错误状态、清理
- [x] `stores/course-draft.js`：页面级草稿传递（导入/复制）
- [x] `components/StructurePreview.vue`、`WorkoutStructure.vue`、`CourseCard.vue`、`CourseImportDialog.vue`
- [x] `components/CourseStructureEditor.vue`、`CourseStepEditor.vue`
- [x] `components/WorkoutEditor.vue`：结构编辑器 + 聚焦步骤面板（桌面右栏 / 移动端覆盖层）
- [x] `views/Library.vue` 重写；新增 `views/CourseEditor.vue`；路由 `/library/new`、`/library/:id/edit`
- [x] `views/EditWorkout.vue` 复用新结构编辑器
- [x] 移除旧模型残留：`views/SegmentEditor.vue`、`views/WorkoutEditorPanel.vue`、`stores/custom-library.js`

### 五、验证

- [x] core 单测：版本分发、元数据、五种步骤、目标类型、属性限制、嵌套、往返、汇总、内置课程
- [x] Web 组件测试：卡片、导入、编辑器、存储
- [x] `npm test`（core + web）、`npm run typecheck`、`web npm run build`
- [x] 浏览器冒烟测试：`web/test/e2e_course_library.py`（展示/展开/导入/新建/编辑/复制/删除）与 `web/test/e2e_session_lifecycle.py`

## 验收

- 用户可在课程库新建、编辑、复制、删除自定义课程，并复制内置课程；
- 用户可导入单条 DSL，解析失败时看到行列与修复提示且不产生课程；
- 课程卡片展示彩色结构预览与递归步骤树，DSL 位于次级折叠区；
- 恢复与休息是独立、可排序、可循环的一等步骤；
- 冻结规范与实现一致，`parse(serialize(workout))` 结构等价。
