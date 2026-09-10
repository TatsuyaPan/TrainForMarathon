# @train-for-marathon/core

TrainForMarathon 的平台无关领域核心。运行时代码不依赖微信、CloudBase、DOM、网络或文件系统，只使用 ECMAScript
标准能力（例如深拷贝走 `src/clone.ts` 的纯 JS 实现，而不是 HTML 规范的 `structuredClone`），
因此 Web 与小程序的差异只留在各自界面层。

## 模块地图

| 模块 | 职责 |
| --- | --- |
| `src/domain.ts` | 领域模型：课表结构、计划实例、训练日、`TrainingSession`、进度记录 |
| `src/clone.ts` | 平台无关深拷贝与空字段清理：`deepClone` / `stripUndefinedFields`，领域数据的复制统一走这里 |
| `src/workflow.ts` | 训练编排：初始化、会话生命周期（计划 → 记录 → 结束）、打卡、课表调整、首页汇总 |
| `src/session-record.ts` | 训练记录表单模型：初始化、校验、归一化成完成载荷 |
| `src/dsl/` | Workout DSL：`v1.ts` 解析/序列化、`registry.ts` 版本分发、编辑与展示 |
| `src/plans/` | 课表模板（20 周 / 五周循环）、实例化、校验与单日调整 |
| `src/fitness.ts` | 能力推算（VDOT、6 秒规则）与档位文案 |
| `src/library.ts`、`src/content/` | 课程库与内置课程正文（含按主训练档位推断分类的 `inferLibraryCategory`） |

## 训练会话生命周期

一个训练日可以有零到多个训练；一次训练最多对应一份训练记录：

```text
TrainingSession
  planned（计划生成，含 plannedWorkout）
    ├─ done（actualWorkout / 距离 / 时长 / RPE / 训练日志 / finishedAt）
    └─ skipped（未进行，不产生训练记录）
```

```ts
import {
  completeSession,
  createSessionRecordForm,
  ensureDaySessions,
  toCompleteSessionInput,
} from "@train-for-marathon/core";

const sessions = await ensureDaySessions(service, plan, "day-3"); // 惰性生成，幂等
const form = createSessionRecordForm(sessions[0]);               // 已有记录会还原
form.rpe = 6;
await completeSession(service, sessions[0], toCompleteSessionInput(form));
```

`ensureDaySessions` 只在训练日生成会话（休息日不生成），`addExtraSession` 用于同一天临时追加第二次训练。`session-record.ts` 的表单模型平台无关：Web 与小程序各自的页面只负责渲染。

写入口（`addExtraSession`、`completeSession`、`setSessionPlannedWorkout`、`ensureDaySessions`、`syncDayPlannedWorkout`
以及课程库的创建/更新/复制）都会先深拷贝再归一化，只保存属于自己的快照。因此平台可以把界面里的响应式对象
直接传进来，不需要自己复制领域对象；写入之后再改调用方的对象也不会影响已存数据
（`packages/core/test/defensive-copy.test.ts` 覆盖）。

## Workout DSL

课表结构（AST）是唯一事实来源，DSL 只在导入、导出与展示时序列化。规范按版本冻结，实现必须以冻结文本为准：

- 版本政策与索引：[`spec/dsl/README.md`](../../spec/dsl/README.md)
- v1 冻结规范：[`spec/dsl/v1/workout-dsl-v1.md`](../../spec/dsl/v1/workout-dsl-v1.md)
- v1 解析器 `src/dsl/v1.ts`；版本识别与分发 `src/dsl/registry.ts`

```ts
// 最新版（未声明 WORKOUT/n 时）
import { parseWorkoutDsl, serializeWorkout } from "@train-for-marathon/core";

// 锁定某一版，不引入其它版本的解析器
import { parseWorkoutDslV1 } from "@train-for-marathon/core/dsl/v1";
```

最小合法课程是 `GOAL:有氧基础` 加上一段 `MS:40min@E`：`GOAL` 必填，`TITLE`、`NOTE` 可留空。未声明版本时使用平台当前最新版；显式声明了不支持的版本会直接报错，不猜测、不降级。

冻结规范随解析器一起发布：构建会把仓库根目录的 `spec/dsl/` 逐字节复制到包内同名的 `spec/dsl/`（包内路径与仓库路径一致），使用方可以按
`workoutDslSpecVersionFile(1)`（`spec/dsl/v1/workout-dsl-v1.md`）定位包内规范，也可以直接引用
`@train-for-marathon/core/spec/dsl/v1/workout-dsl-v1.md`。

## 使用

```ts
import {
  athleteFitness,
  calculateStats,
  getContentById,
  instantiatePlan,
} from "@train-for-marathon/core";

const article = getContentById("training-types/pace-baseline");
const plan = instantiatePlan("20-week", {
  raceDate: "2027-03-21", // YYYY-MM-DD；作为模板最后一天
  thresholdPaceSecondsPerKm: 220,
  maxWeeklyKm: 100,
});
const stats = calculateStats(plan, []);
const fitness = athleteFitness(athlete); // 传入 AthleteProfile，得到配速基准或 null
```

日期计算使用 UTC 日历日期，避免运行设备的时区改变课表日期。周次采用倒计时：20 周课表从 20 到 1，比赛日是第 1 周的最后一天。

各平台只负责渲染 `fitness.ts` 给出的档位与文案，不各自拼配速说法，避免同一份能力在不同端出现不一致的解释。

## 开发命令

```bash
npm test          # 单元测试
npm run typecheck
npm run build     # 生成 dist；web 依赖该产物
```

构建会先清空 `dist`（避免已删除模块的旧编译文件被一起发布），再根据 `content-manifest.json` 将现有 Markdown 生成到运行时包中，
最后复制冻结规范与仓库根 `LICENSE`。`src/content/generated.ts` 是生成文件，不应手工修改。
新增 DSL 版本时需要同步的步骤见 `spec/dsl/README.md`；`packages/core/test/dsl-spec-conformance.test.ts` 会强制「冻结规范 ↔ 版本解析器」一一对应。
`npm run check:spec` 可以单独检查产物里的规范与 `LICENSE` 有没有落后于仓库。

## 发布

包不标记 `private`，作用域包在 `publishConfig.access` 里声明为公开，可以直接发布：

```bash
cd packages/core
npm login          # 首次发布前
npm run build      # dist + 冻结规范 + LICENSE
npm pack --dry-run # 确认打包内容（dist、spec、README、LICENSE）
npm publish
```
