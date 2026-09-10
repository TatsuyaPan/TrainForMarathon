# core 复用与小程序接入指引

本文件回答一个问题：**换一个平台（微信小程序、未来其它平台）复用 `@train-for-marathon/core` 时，平台必须自己做什么、core 已经替你做了什么。**
它同时是「core 与界面分离」这条约束的验收清单：凡是这里列进 core 一侧的东西，平台都不应该再实现一遍。

## 1. 边界

| 归 core（平台无关，已有测试） | 归平台（每个端各写一次） |
| --- | --- |
| 领域模型：课表、计划实例、`TrainingSession`、进度记录 | 存储：云数据库 / localStorage / 内存 |
| 编排：初始化、会话生命周期、打卡、课表调整、首页汇总 | 页面渲染、导航、样式 |
| Workout DSL：解析、序列化、校验、结构编辑 | DSL 的输入框、复制按钮、剪贴板 |
| 课程库：内置课程、校验、新建/更新/复制/序列化 | 自定义课程的持久化位置 |
| 展示数据：阶段/步骤树、配色、汇总、配速与能力文案 | 组件实现（用哪套 UI 库） |
| 会话记录表单模型：初始化、校验、归一化 | 表单控件与布局 |

core 只依赖 ECMAScript：不使用 `structuredClone`、`window`、`document`、`localStorage`、`fetch` 等浏览器/HTML 专有 API，
这条约束由 `packages/core/test/boundary.test.ts` 强制执行。因此小程序侧只需要提供存储与界面。

### 1.1 平台不需要自己复制领域对象

core 的写入口（`ensureDaySessions`、`syncDayPlannedWorkout`、`addExtraSession`、`completeSession`、
`setSessionPlannedWorkout`、`setDayWorkout`、课程库的创建/更新/复制）都会先做一次**防御性快照**：
深拷贝再由核心归一化，然后才写入存储。所以：

- 平台可以直接把界面里的响应式对象交给 core，不需要 `JSON.parse(JSON.stringify(...))`、也不需要
  `structuredClone`；core 用 `packages/core/src/clone.ts` 的 `deepClone`（纯 ECMAScript）完成拷贝。
- 复制完再改调用方自己的对象，不会影响已存数据——这条约定由 `packages/core/test/defensive-copy.test.ts` 守住。
- 切换步骤类型后残留的 `undefined` 键由 `stripUndefinedFields` 统一清理，各端得到相同结构。

Web 侧还有一条对应的界面层守卫（`web/test/domain-boundary.test.js`）：`web/src` 里出现
JSON 往返深拷贝、`structuredClone`，或 `src/stores` 之外的 `localStorage`，测试就会失败。

## 2. 平台需要实现的适配层

### 2.1 `DataStore`（4 个方法，唯一的存储接口）

```ts
interface DataStore {
  get(collection: string, id: string): Promise<unknown | null>;
  set(collection: string, id: string, value: unknown): Promise<void>;
  list(collection: string, filters?: Record<string, unknown>): Promise<unknown[]>;
  delete(collection: string, id: string): Promise<void>;
}
```

Web 参考实现：`web/src/stores/local-storage-store.js`；小程序参考实现：`wapp/src/data-access/wechat-cloud-store.js`（已有，需按 2.3 补齐集合）。

### 2.2 `TrainingDataService`（编排层只认这 13 个方法）

直接复用 `DefaultTrainingDataService`（core 已实现）即可，平台只需把 `store` 换掉。
如果平台自己实现该接口，方法签名必须与下表一致，否则 `workflow.ts` 里的编排无法复用：

| 方法 | 用途 |
| --- | --- |
| `getAthleteProfile()` / `saveAthleteProfile(profile)` | 运动员档案（id、能力、比赛日期、当前计划） |
| `getPlan(planId)` / `savePlan(plan)` | 计划实例（含每周每天的结构化课表） |
| `listProgress(planId)` / `saveProgress(planId, record)` | 日进度（旧模型，保留兼容） |
| `listSessions(planId, dayId?)` / `saveSession(session)` / `deleteSession(sessionId)` | **训练会话（新模型：一天可有多次训练）** |
| `deleteAthleteProfile()` / `deletePlan(planId)` / `deleteProgress(planId)` | 重置全部数据 |

### 2.3 集合名

| core 集合 | 小程序云集合（建议与现有实现保持一致） | 现状 |
| --- | --- | --- |
| `athletes` | `user_profiles`（现有命名） | 现有实现用 `userProfiles`，需要补映射 |
| `plans` | `training_plans` | 已有 |
| `progress` | `training_progress` | 已有 |
| `sessions` | `training_sessions`（新增集合） | **缺失** |

`sessions` 必须新增：它是「一天可多次训练」与「完成记录」的唯一落点，替代不进 `progress`。同一个云环境里按 `planId`、`dayId`、`sessionId` 建索引即可支撑按天查询。

## 3. 每个界面复用哪些 core 能力

| 界面 | 核心调用 | Web 参考 |
| --- | --- | --- |
| 首次配置 / 我的 | `getSetupState`、`createSetup`、`updateAthleteFitness`、`resetSetup`、`listSetupTemplates` | `web/src/views/Settings.vue` |
| 训练周期（首页） | `getHomeSummary`、`findPlanWeek`、`findTodayTraining`、`calculateWeekStats`、`listPlanTemplates`、`planEndsWithRaceDay`（锚点日期是比赛日还是周期结束日）、`trainingDayMark` | `web/src/views/TrainingCalendar.vue` |
| 训练周 | `findPlanWeek`、`formatTrainingDay`、`sessionsToProgress` | `web/src/views/TrainingWeek.vue` |
| 训练日（零到多次训练） | `ensureDaySessions`、`addExtraSession`、`removeSession`、`skipSession`、`syncDayPlannedWorkout`、`setSessionPlannedWorkout`、`summarizeDaySessions`（当日小结） | `web/src/views/TrainingDay.vue` |
| 训练记录 | `createSessionRecordForm`、`toCompleteSessionInput`、`completeSession` | `web/src/views/SessionRecord.vue` |
| 课表编辑 | `parseWorkoutDsl`、`serializeWorkout`、`validateWorkout`、`insertSegment`/`removeSegment`/`moveSegment`/`replaceSegment`/`duplicateSegment`/`moveSegmentTo`、`addPhase`/`removePhase`、`createDefaultSegment` | `web/src/components/WorkoutEditor.vue`、`CourseStructureEditor.vue` |
| 课表调整 | `swapTrainingDays`、`applyDayAlternative`、`setDayWorkout` | `web/src/components/DayAdjustDialog.vue` |
| 课程库 | `BUILTIN_COURSES`、`listCoursesByCategory`、`createLibraryCourse`、`updateLibraryCourse`、`cloneLibraryCourse`、`validateLibraryCourse`、`serializeLibraryCourse`、`inferLibraryCategory`（导入 DSL 后推断分类、两条端口径一致） | `web/src/views/Library.vue`、`stores/course-library.js`、`views/CourseEditor.vue` |
| 课程展示 | `createWorkoutPresentation`（阶段、步骤树、预览条、汇总、标题兜底）、`INTENSITY_COLORS`、`formatTargetLabel` | `web/src/components/CourseCard.vue`、`StructurePreview.vue`、`WorkoutStructure.vue` |
| 配速 / 能力 | `calculateSixSecondPaces`、`pacesFromVdot`、`assessFromResults`、`athleteFitness`、`fitnessPaceRows`、`sixSecondPaceRows`、`vdotPaceRows`、`raceResultsSummary`、`formatRaceTime`、`parseRaceTime` | `web/src/views/Paces.vue`、`Fitness.vue` |
| 训练思想（正文） | `getContentIndex`、`getContentById`（含上一/下一篇导航与图片资源清单） | `web/src/views/Courses.vue`、`Course.vue` |

## 4. 交互复刻要点

页面结构与交互细节以两份设计文档为准，小程序应当复刻「信息层级与状态」，而不是像素：

- 课程库与编辑器：[课程库与课程编辑器交互设计](./2026-09-10-course-library-interaction-design.md)（卡片摘要、递归步骤树、聚焦编辑、导入、错误呈现、键盘与焦点）
- 训练生命周期：[Training Session Web Design](./2026-09-10-training-session-web-design.md)（会话卡片、状态动作、记录页、日聚合、课表调整）

必须保持一致的语义（换端也不能变）：

1. 一门课程只有一份事实来源：Workout AST；DSL 只在导入/导出/展示时序列化。
2. 一次训练最多一份记录：`actualWorkout` + 距离 + 时长 + RPE + 日志，可偏离计划。
3. 一个训练日零到多次训练；`ensureDaySessions` 只给训练日生成计划位会话，休息日不生成。
4. 日聚合：全部完成=已完成，全部未进行=未进行，其余=部分完成。
5. 未结束的计划位会跟随课表更改；已结束（done/skipped）的会话保留当时快照。
6. 训练日不会被静默改写：调整失败要给出可读原因。

## 5. 平台差异清单

| 事项 | Web | 小程序 |
| --- | --- | --- |
| 存储 | localStorage（`web/src/stores/local-storage-store.js`） | 云数据库（`wapp/src/data-access/wechat-cloud-store.js`） |
| 用户标识 | 本地生成的虚拟 id（`createLocalAthleteId`） | openid |
| 复制 DSL | `navigator.clipboard`，失败时提示手动选中 | `wx.setClipboardData` |
| 日期选择 | TDesign 日期面板 | `picker mode="date"` |
| 内容图片 | 构建期复制到 `web/public/course-images/` | 云存储或分包资源（见 `wapp/scripts/`） |
| 长列表 | 一次渲染 | 云数据库分页（`list` 已按 20 条/页翻页） |

## 6. 现有小程序需要补齐的差距（2026-09-10 核对）

对照 `wapp/`（私有仓库）当前状态，复用新版 core 还差三件事：

1. **同步 core 产物**：`wapp/src/vendor/@train-for-marathon/core/` 目前只有 `domain / pace / stats / plans / content` 等旧文件，
   没有 `workflow.js`、`dsl/`、`library.js`、`fitness.js`、`session-record.js`。执行 `cd wapp && npm run sync`（vendor + manifest + 体积检查）后才会带上会话生命周期、DSL 与课程库能力。
2. **数据层补会话**：`TrainingDataService` 缺 `listSessions / saveSession / deleteSession`，`WechatCloudDataStore.COLLECTION_NAMES` 缺 `sessions`。
   同时把档案集合映射到 core 的 `athletes`（或为 `userProfiles` 增加映射），否则 `getAthleteProfile()` 拿不到数据。
3. **页面补三块**：训练日会话列表（完成 / 跳过 / 追加 / 移除）、训练记录页、课程库（我的课程：新建 / 复制 / 导入 DSL）。

## 7. 复用是否成功的判定

- core 侧：`npm test && npm run typecheck && npm run build` 全绿（2026-09-11 核对：231 项测试 / 32 个文件；
  Web 另有 102 项组件测试 / 16 个文件与 11 支浏览器冒烟，`npm run verify` 一条命令跑完）。
- 平台侧：只用 `DataStore` + `TrainingDataService` 就能跑通「配置 → 生成课表 → 完成一次训练 → 记录实际内容 → 追加第二次训练 → 刷新后仍在」。
  Web 已经用 `web/test/e2e_full_journey.py` 把这条链固化下来，小程序可以照抄同样的断言顺序；
  另一支 `web/test/e2e_five_week_cycle.py` 覆盖第二个模板（五周循环、没有比赛日）从建立配置到训练日的路径。
- 反向检查：平台侧代码里不应该再出现配速推算、VDOT、DSL 解析、会话聚合等业务规则——出现即代表该逻辑没有复用 core。
