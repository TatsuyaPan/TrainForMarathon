# 课程库与 Workout DSL 重构设计

**日期：** 2026-09-10
**状态：** 待用户最终复核
**范围：** core 数据模型与 DSL、Web 课程库、课程展示与课程编辑器

**配套交互设计：** [课程库与课程编辑器交互设计](./2026-09-10-course-library-interaction-design.md)

**冻结规范（实现依据）：** [Workout DSL v1](../../../spec/dsl/v1/workout-dsl-v1.md)

本文档定义领域模型、DSL、数据约束和功能边界；配套交互文档定义这些能力在 Web 中如何被查看和编辑。交互不得产生 DSL 无法表达的状态；若两份文档出现冲突，以本文的模型和校验约束为准，并同步修正交互文档。

DSL 规范自 v1 起按版本冻结在 `spec/dsl/<版本>/`，实现必须依据冻结文本；本文档只保留设计与取舍说明，不再作为语法事实来源。

## 1. 背景与目标

当前课程库能够展示内置课程，也能从训练日编辑器保存一条自定义课程，但缺少完整的课程管理能力：

- 不能直接在课程库中新建课程；
- 不能在课程库中编辑自定义课程；
- 不能导入单条课程；
- 不能复制内置或自定义课程；
- 课程主要以一行 DSL 展示，循环和嵌套循环难以阅读；
- 当前恢复和休息附着在前一个跑步步骤上，无法与编辑器中的独立步骤无损对应；
- 当前汇总没有正确计算恢复和休息的负荷。

本次重构目标是建立一套唯一、严格、可逆的 Workout 模型和 DSL，并在此基础上完成 Web 课程库的新增、编辑、单条导入、复制、删除和结构化展示。

设计参考 Garmin 的移动端结构预览与聚焦式步骤编辑，以及 COROS 的桌面端课程信息区、步骤卡片、循环分组、排序操作和持续汇总。只吸收信息架构与交互优点，不复制品牌视觉。

## 2. 设计原则

1. **模型与 DSL 无损往返。** 规范化结构必须满足 `parse(serialize(workout)) ≡ workout`。
2. **一个概念只有一种标准写法。** 标准导出不保留等价语法变体。
3. **恢复和休息是一等步骤。** 它们能够独立排序、复制、删除、进入循环并参与汇总。
4. **阶段不重复存储。** 热身、主训练和冷身由阶段容器表达，普通跑步步骤不再重复保存阶段字段。
5. **人类可读优先。** 使用跑者熟悉的 `WU/MS/CD`、`6x(...)`、E/M/T/I/R 等写法。
6. **机器解析必须确定。** `+` 只表示顺序，`x(...)` 只表示循环，属性必须使用明确分隔符。
7. **core 保持纯净和可开源。** core 只提供模型、解析、序列化、校验、复制、汇总与展示数据，不依赖浏览器存储或 Vue。
8. **Web 只负责交互和持久化。** localStorage、路由、编辑状态和响应式界面留在 Web。
9. **无需兼容旧版。** 产品尚未上线，旧 DSL、旧课程结构和旧自定义课程存储不进入新实现。

## 3. 范围

### 3.1 本次包含

- 全新 Workout AST；
- 全新严格 DSL 解析器和序列化器；
- 全量重写内置课程；
- Workout 校验、汇总和可读展示；
- Web 课程库列表与结构化课程卡片；
- 新建和编辑自定义课程；
- 单条 DSL 导入；
- 复制内置课程和自定义课程；
- 删除自定义课程；
- 响应式课程编辑器；
- 循环与嵌套循环的编辑和展示；
- 自动化测试与浏览器验收。

### 3.2 本次不包含

- 批量导入或导出；
- JSON 文件导入；
- Garmin、COROS 或其他设备同步；
- 课程云同步或账号系统；
- 旧 DSL/旧 localStorage 数据迁移；
- 用隐藏字段表达“跳过最后一次恢复”；
- 按热量、计圈键或开放时长结束步骤；
- 训练负荷 TL 的计算模型。

## 4. 核心领域模型

### 4.1 Workout

```ts
export interface Workout {
  dslVersion: number;
  title?: string;
  goal: string;
  note?: string;
  phases: WorkoutPhase[];
}

export interface WorkoutPhase {
  role: "warmup" | "main" | "cooldown";
  segments: WorkoutSegment[];
}
```

约束：

- `dslVersion` 在 AST 中始终存在；DSL 未声明版本时由解析器填入所选解析器版本；
- `title` 可省略或为空，空白标题规范化为 `undefined`；
- `goal` 必填且去除首尾空白后不能为空；
- `note` 可省略或为空，空白备注规范化为 `undefined`；
- `main` 阶段必须存在且只能存在一次；
- `warmup` 和 `cooldown` 各自最多存在一次；
- 阶段顺序固定为 `warmup → main → cooldown`；
- 每个阶段至少包含一个分部。

### 4.2 分部

```ts
export type WorkoutSegment =
  | RunStep
  | RecoveryStep
  | RestStep
  | RepeatBlock;

export interface RunStep {
  kind: "run";
  load: Load;
  target: TrainingTarget;
  rpe?: number;
  inclinePercent?: number;
  note?: string;
}

export interface RecoveryStep {
  kind: "recovery";
  load: Load;
  note?: string;
}

export interface RestStep {
  kind: "rest";
  durationSeconds: number;
  note?: string;
}

export interface RepeatBlock {
  kind: "repeat";
  repetitions: number;
  segments: WorkoutSegment[];
  note?: string;
}
```

`RepeatBlock` 的 `segments` 允许继续包含 `RepeatBlock`，最大嵌套深度为 10。

### 4.3 负荷

```ts
export type Load =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number };
```

内部只存储整数秒和整数米，不保存原始输入单位，避免 `1.5min` 与 `90s` 形成不同结构。

标准序列化规则：

- 整分钟输出 `Nmin`；
- 非整分钟输出 `Ns`；
- 可以精确写成有限小数公里时，距离大于等于 1000 米输出 `Nkm`；
- 其他距离输出 `Nm`。

示例：600 秒为 `10min`，90 秒为 `90s`，1500 米为 `1.5km`，800 米为 `800m`。

### 4.4 训练目标

```ts
export type DanielsZone = "E" | "M" | "T" | "I" | "R" | "ST";

export type TrainingTarget =
  | { type: "daniels"; zone: DanielsZone }
  | {
      type: "pace-range";
      fastSecondsPerKm: number;
      slowSecondsPerKm: number;
    }
  | {
      type: "heart-rate";
      basis: "max" | "reserve";
      minPercent: number;
      maxPercent: number;
    }
  | {
      type: "heart-rate-absolute";
      minBpm: number;
      maxBpm: number;
    }
  | { type: "rpe"; value: number };
```

E/M/T/I/R 是 Daniels 核心强度；ST 是本项目已有的短距离神经激活/跨步跑扩展，必须在用户文档中明确标注为项目扩展。

L 是长距离课程形态，使用长时间或长距离的 E 跑表达，不作为独立强度。H 是坡跑条件，使用 `inclinePercent` 表达，不作为独立强度。

每个跑步步骤只能有一个可执行主目标。已有主目标时，`rpe` 字段只能作为辅助体感提示。首版不允许同时设置配速主目标和心率主目标。

## 5. 五种用户可见步骤

| 用户名称 | 模型 | DSL 来源 | 行为 |
| --- | --- | --- | --- |
| 热身 | `warmup` 阶段中的 `RunStep` | `WU:` | 按指定目标完成热身跑 |
| 主训练 | `main` 阶段中的 `RunStep` | `MS:` | 按指定目标完成主要训练负荷 |
| 恢复 | `RecoveryStep` | `@jog` | 按时间或距离进行主动慢跑恢复 |
| 休息 | `RestStep` | `@rest` | 按时间进行被动恢复，不产生距离 |
| 冷身 | `cooldown` 阶段中的 `RunStep` | `CD:` | 按指定目标完成冷身跑 |

阶段容器与分部类型不重复表达同一状态：普通跑步步骤的用户角色由所在阶段决定；恢复和休息具有独立分部类型，并在任何阶段内保持其语义。

## 6. Workout DSL 正式语法

### 6.1 标准产生式

```ebnf
workout       = version?, title?, goal, note?, phase, { newline, phase } ;

version       = "WORKOUT/", positive-integer, newline ;
title         = "TITLE:", line-text?, newline ;
goal          = "GOAL:", non-empty-line-text, newline ;
note          = "NOTE:", line-text?, newline ;

phase         = phase-tag, ":", sequence ;
phase-tag     = "WU" | "MS" | "CD" ;

sequence      = segment, { "+", segment } ;
segment       = run-step
              | recovery-step
              | rest-step
              | repeat ;

repeat        = positive-integer, "x(", sequence, ")", repeat-note? ;

run-step      = load, "@", run-target, run-attribute* ;
recovery-step = load, "@jog", note-attribute? ;
rest-step     = time-load, "@rest", note-attribute? ;

load          = time-load | distance-load ;
time-load     = positive-number, ("s" | "min") ;
distance-load = positive-number, ("m" | "km") ;

run-target    = daniels-zone
              | pace-range
              | max-heart-rate
              | reserve-heart-rate
              | absolute-heart-rate
              | rpe-target ;

daniels-zone  = "E" | "M" | "T" | "I" | "R" | "ST" ;

pace-range    = "P", pace, "-", pace, "/km" ;
pace          = minutes, ":", two-digit-seconds ;

max-heart-rate      = "HR", integer, "-", integer, "%max" ;
reserve-heart-rate  = "HR", integer, "-", integer, "%hrr" ;
absolute-heart-rate = "HR", integer, "-", integer, "bpm" ;

rpe-target    = "RPE", integer ;

run-attribute = "@RPE", integer
              | "@inc", number
              | note-attribute ;

note-attribute = "@note(", quoted-text, ")" ;
repeat-note    = note-attribute ;
```

### 6.2 词法规则

- 关键字区分大小写；
- 标准关键字使用 ASCII：`WORKOUT`、`TITLE`、`GOAL`、`NOTE`、`WU`、`MS`、`CD`、`x`、`jog`、`rest`；
- UI 可以显示中文和乘号 `×`，但导出的 DSL 使用标准关键字；
- 标记之间允许空白，但标准序列化不输出多余空白；
- `TITLE` 和 `NOTE` 可省略；存在但值为空时规范化为未设置；
- `GOAL` 必须存在，值去除首尾空白后不能为空；
- `TITLE`、`GOAL` 和 `NOTE` 的值是该行第一个冒号后的全部文本，去除首尾空白且不能跨行；
- `quoted-text` 使用 JSON 字符串转义规则；
- 时间和距离解析后必须能够无损转换为整数秒或整数米；
- 不接受 `10min E`、`Run 10min@E`、逗号恢复语法等替代写法。

### 6.3 版本选择

版本声明是可选的：

```text
WORKOUT/1
```

- 声明版本时，平台应选择对应解析器；不支持该版本时抛出明确的“版本不支持”错误，不得猜测或降级；
- 未声明版本时，默认使用平台当前支持的最新版解析器；若解析失败，直接返回该解析器的语法错误，不尝试其他版本；
- 平台可以选择只提供最新版解析器，也可以维护解析器注册表、固定某个默认版本或直接调用指定版本解析器；
- core 暴露 `CURRENT_WORKOUT_DSL_VERSION`、版本识别函数和版本明确的解析入口，平台策略不写死在 DSL 文本层；
- 标准导出默认写入 `WORKOUT/<version>` 以便长期交换；紧凑导出可以省略版本，但其含义始终是“按接收平台的当前最新版解析”。

建议 API：

```ts
export const CURRENT_WORKOUT_DSL_VERSION = 1;

export function detectWorkoutDslVersion(text: string): number | undefined;

export function parseWorkoutDsl(
  text: string,
  options?: { defaultVersion?: number },
): Workout;

export function parseWorkoutDslV1(text: string): Workout;
```

`parseWorkoutDsl` 优先使用文本中的显式版本，否则使用 `options.defaultVersion`，再否则使用 `CURRENT_WORKOUT_DSL_VERSION`。平台也可以绕过统一入口，直接调用具体版本解析器。

### 6.4 属性限制

- `RunStep` 可使用辅助 RPE、坡度和备注；
- `RecoveryStep` 只可使用备注；
- `RestStep` 只可使用备注；
- `RepeatBlock` 只可使用备注；
- 被动休息只接受时间负荷；
- 不允许 `2min@rest@inc3` 等无意义组合。

### 6.5 数值约束

- 时间、距离和循环次数必须大于零；
- 循环次数必须是整数；
- RPE 范围为 1–10；
- 坡度范围为 0–20%；
- 心率百分比范围为 40–100%，下限必须小于上限；
- 绝对心率范围为合理正整数，下限必须小于上限；
- 自定义配速快端的秒/公里必须小于慢端；
- 每个循环至少包含一个分部；
- 循环最大嵌套深度为 10。

### 6.6 循环语义

循环严格重复括号内的完整序列：

```text
6x(8min@T+90s@jog)
```

表示六次主训练和六次主动恢复。DSL 不提供隐藏的“最后一次跳过恢复”标志。若实际最后一次不恢复，必须写成：

```text
5x(8min@T+90s@jog)+8min@T
```

这保证 DSL、AST、课程预览和实际执行完全一致。

### 6.7 合法精简示例（省略可选版本）

最小合法课程（轻松跑）：

```text
GOAL:有氧基础
MS:45min@E
```

阈值巡航间歇：

```text
GOAL:乳酸阈能力
WU:15min@E
MS:6x(8min@T@RPE8+90s@jog)
CD:10min@E
```

亚索 800：

```text
GOAL:最大摄氧量刺激
WU:2km@E
MS:10x(800m@I+3min@jog)
CD:2km@E
```

完全休息：

```text
GOAL:速度与跑步经济性
WU:15min@E
MS:8x(400m@R@RPE9+3min@rest)
CD:10min@E
```

最大心率百分比：

```text
GOAL:有氧基础
MS:45min@HR65-78%max
```

储备心率百分比：

```text
GOAL:轻松恢复
MS:40min@HR60-70%hrr
```

绝对心率：

```text
GOAL:稳定有氧
MS:40min@HR145-160bpm
```

自定义配速：

```text
GOAL:马拉松专项适应
WU:3km@E
MS:12km@P4:45-5:00/km@RPE7
CD:2km@E
```

RPE 主目标：

```text
GOAL:高温环境阈值体感
WU:15min@RPE3
MS:3x(10min@RPE7+2min@jog)
CD:10min@RPE2
```

嵌套循环：

```text
GOAL:I与T混合刺激
WU:15min@E
MS:2x(3x(3min@I+2min@jog)+5min@T+2min@jog)
CD:10min@E
```

短距离神经激活：

```text
GOAL:神经激活与跑姿
WU:15min@E
MS:6x(100m@ST+100m@jog)
CD:10min@E
```

## 7. 规范化与往返

解析器直接生成规范化 AST：

- 显式版本写入 `dslVersion`；缺少版本时写入实际使用的解析器版本；
- 空白 `TITLE` 和 `NOTE` 规范化为未设置；
- `GOAL` 去除首尾空白并校验非空；
- 所有时间转换为整数秒；
- 所有距离转换为整数米；
- 阶段按固定顺序保存；
- 数值范围在解析时校验；
- 备注完成转义还原；
- 不保留输入空白和原始单位；
- 不接受或保存旧字段。

序列化器只接受通过 `validateWorkout` 的 AST。在是否输出版本号的选项确定后，序列化结果唯一；默认包含版本，紧凑模式允许省略。以下差异不属于语义差异：

- `1.5min` 解析后导出为 `90s`；
- 输入中的多余空白被移除；
- 公里和米按标准单位规则重新选择。

测试必须以结构等价而不是原始字符串相等验证往返：

```ts
expect(parseWorkoutDsl(serializeWorkout(workout))).toEqual(workout);
```

## 8. 汇总规则

core 提供纯函数汇总：

```ts
interface WorkoutTotals {
  knownDistanceMeters: number;
  knownDurationSeconds: number;
  workDistanceMeters: number;
  workDurationSeconds: number;
  recoveryDistanceMeters: number;
  recoveryDurationSeconds: number;
  restDurationSeconds: number;
}
```

规则：

- 距离型热身、主训练、恢复和冷身计入已知总距离；
- 时间型热身、主训练、恢复、休息和冷身计入已知总时间；
- 被动休息不产生距离；
- 循环内全部负荷乘以循环次数；
- 主训练容量单独统计，不把热身、恢复、休息和冷身算入强度容量；
- 时间型步骤无法在没有配速上下文时转换为距离；
- 距离型步骤无法在没有配速上下文时转换为时间；
- Web 在拥有运动员配速数据时可以额外显示预计完整距离和时间，但估算结果不写入 DSL。

## 9. 课程库模型

AST 是课程内容的唯一事实来源，不同时持久化可能过期的 `dsl` 和 `workout` 两份数据。DSL 在展示或导出时即时序列化。

```ts
export interface LibraryCourse {
  id: string;
  origin: "builtin" | "custom";
  category: "E" | "M" | "T" | "I" | "R" | "ST" | "mixed";
  tags: Array<"E" | "M" | "T" | "I" | "R" | "ST">;
  weeklyKmHint?: string;
  source: string;
  workout: Workout;
  createdAt?: string;
  updatedAt?: string;
}
```

内置课程不可修改或删除。自定义课程可修改、复制和删除。

core 提供：

- `createLibraryCourse(input)`；
- `updateLibraryCourse(course, patch)`；
- `cloneLibraryCourse(course, overrides)`；
- `validateLibraryCourse(course)`；
- `serializeWorkout(course.workout)`；
- `createWorkoutPresentation(course.workout, context?)`。

这些函数不读写存储。

## 10. Web 持久化

Web 自定义课程使用新的 localStorage key，旧 key 不读取：

```text
tfm:course-library:v1
```

存储仅包含 `origin: "custom"` 的 `LibraryCourse`。写入前必须经过 core 校验。读取失败、JSON 损坏或结构校验失败时，不让页面崩溃；界面显示存储错误并允许用户清理无效数据。

自定义课程操作：

- 新建：生成新 ID、`createdAt` 和 `updatedAt`；
- 编辑：保留 ID 和 `createdAt`，更新 `updatedAt`；
- 复制：深拷贝 Workout 并生成新 ID；标题存在时默认增加“（副本）”，标题为空时保持为空；
- 删除：必须二次确认；
- 列表变更后立即更新响应式状态。

## 11. 单条 DSL 导入

课程库只支持单条 DSL 导入，不支持文件或批量导入。

流程：

1. 用户点击“导入课程”；
2. 粘贴完整 DSL；
3. Web 调用 core 解析器；
4. 解析失败时在输入框下显示错误位置和原因；
5. 解析成功后生成未持久化草稿；
6. 进入统一课程编辑页；
7. 用户按需补充标题、课程备注、分类和适用跑量；`GOAL` 已由 DSL 提供且必须非空；
8. 用户点击保存后才写入 localStorage。

关闭导入窗口、取消编辑或解析失败都不能产生课程记录。

## 12. 课程库页面

### 12.1 页面头部

- 标题与简短说明；
- “新建课程”主按钮；
- “导入课程”次按钮；
- E/M/T/I/R/ST/混合分类筛选。

### 12.2 课程卡片

课程卡片按以下顺序展示：

1. 展示标题、分类、来源和适用跑量；标题为空时使用 `GOAL` 作为展示标题；
2. 训练目的和可选课程备注；
3. 已知总距离、已知总时间、主训练容量和循环数量；
4. 彩色训练结构预览条；
5. 默认折叠的递归步骤树；
6. 次级折叠区中的原始 DSL；
7. 操作按钮。

内置课程操作：

- 展开/收起结构；
- 查看 DSL；
- 复制为自定义课程。

自定义课程操作：

- 展开/收起结构；
- 查看 DSL；
- 编辑；
- 复制；
- 删除。

## 13. 训练结构展示

### 13.1 颜色语义

- 普通跑步使用目标强度颜色；
- E 为绿色；
- M 为黄绿色；
- T 为黄色；
- I 为红色；
- R 为紫色；
- ST 为浅紫色；
- 主动恢复为浅蓝灰；
- 被动休息为灰色；
- 自定义配速、心率和 RPE 目标使用中性色加明确文字标签。

颜色不是唯一信息来源；所有步骤必须同时显示文字和图标/标签，以满足可访问性要求。

### 13.2 结构预览条

参考 Garmin，在卡片和编辑器顶部显示训练节奏概览：

- 每个步骤显示一个色块；
- 色块宽度按可比较负荷比例计算；
- 时间步骤之间按秒比较；
- 距离步骤之间按米比较；
- 同时存在时间与距离且没有配速上下文时，不伪造跨单位比例，按步骤等宽显示并标注“混合单位”；
- 循环可以展开为重复节奏，但设置合理的最大绘制块数；超过上限时使用压缩重复标识，避免 DOM 膨胀；
- 预览只呈现，不成为独立数据源。

### 13.3 递归步骤树

普通步骤显示：

- 用户步骤类型；
- 时间或距离；
- 主目标；
- 辅助 RPE；
- 坡度；
- 备注。

循环显示：

- “重复 N 次”；
- 循环备注；
- 组内递归步骤。

嵌套循环采用边框、连接线和层级编号。移动端不无限增加缩进；超过两层后保持最小内容宽度并用层级标签表达深度。

### 13.4 强度 ↔ 配速口径

DSL 与 AST 只保存强度档位（`@E`、`@T`、`@I` …）。换算成本人配速属于**展示投影**：
同一份课程可以按「强度」或「配速」展示，两者不产生新的训练语义，也不写回 DSL。

- 换算基准是运动员能力（阈值配速或 VDOT），缺失时回退强度标签；
- 配速口径保留档位字母（如 `3:45–4:00/km（T）`），强度身份不因换口径而消失；
- E、M 在配速口径下标注「估算」：原书只有 6 秒规则精确定义 T/I/R；
- ST（跨步跑）没有配速档位，保持强度标签，不伪造配速；
- 自定义配速、心率、RPE 目标不参与换算，它们本身就是明确目标。

界面开关与验收标准见交互设计文档 §19。

## 14. 统一课程编辑器

新建、编辑、复制和导入共享同一个独立路由与编辑器组件。

### 14.1 顶部

- 返回课程库；
- 当前展示标题或“新建课程”；展示标题取 `title || goal || "新建课程"`；
- 未保存状态；
- 保存按钮。

离开存在未保存修改的页面时给出提示。

### 14.2 课程信息区

参考 COROS，集中编辑：

- 可选课程标题；
- 分类；
- 必填训练目的；
- 可选课程备注；
- 适用周跑量提示。

### 14.3 结构区

- 顶部显示结构预览和实时汇总；
- WU/MS/CD 使用清晰的阶段容器；
- `MS` 默认存在；
- WU/CD 可按需添加或删除；
- 每个阶段支持添加跑步步骤、主动恢复、被动休息和循环；
- 循环内部支持相同的添加能力；
- 普通步骤和循环支持复制、删除、上移、下移；
- 桌面端支持在同一父容器内拖拽排序；
- 移动端保留明确的上移/下移操作，不能只依赖拖拽；
- 跨阶段移动普通跑步步骤时，其用户角色随目标阶段变化；
- 恢复与休息跨阶段移动时保持自身类型。

### 14.4 聚焦编辑

参考 Garmin：

- 点击步骤后进入聚焦编辑；
- 桌面端使用右侧编辑面板；
- 移动端使用全宽编辑层；
- 只显示当前步骤允许的字段；
- 改变持续类型时只显示时间或距离输入；
- 改变主目标类型时只显示对应字段；
- 无效组合不能在 UI 中创建；
- 删除操作在聚焦面板中提供，并要求确认。

页面底部固定“添加步骤”和“添加循环”；实时汇总在桌面端固定于底部，在移动端使用紧凑浮动摘要。

## 15. 编辑操作语义

### 15.1 新建

默认草稿：

- 空标题；
- 空训练目的；
- 分类 E；
- 一个 `main` 阶段；
- `main` 中包含一个 30 分钟 E 跑步骤。

默认值用于降低首次使用成本；标题可以保持为空，保存前必须填写训练目的。

### 15.2 编辑

只有自定义课程可以进入编辑模式。编辑器使用深拷贝草稿，保存前不修改列表中的原对象。

### 15.3 复制

- 复制内置课程或自定义课程都会生成出新的自定义草稿；
- 深拷贝全部 Workout 结构；
- 新 ID 只在保存时生成；
- 原标题存在时默认追加“（副本）”，原标题为空时保持为空；
- 取消编辑不产生记录。

### 15.4 删除

- 仅自定义课程可删除；
- 确认信息必须显示 `title || goal`；
- 删除完成后列表立即刷新；
- 不影响已经引用该课程生成的训练计划或 TrainingSession，因为训练计划保存的是 Workout 快照而不是课程 ID 的动态引用。

## 16. 错误处理

### 16.1 DSL 错误

错误对象包含：

- 错误代码；
- 用户可读消息；
- 字符位置；
- 行号和列号；
- 可选修复提示。

示例：

```text
第 2 行第 15 列：未知训练目标 “H”。
支持 E/M/T/I/R/ST、配速范围、心率范围和 RPE。
```

### 16.2 表单错误

- 错误显示在对应字段附近；
- 保存时滚动并聚焦第一个错误；
- 不使用只包含笼统文本的全局 alert；
- 删除确认可以使用对话框；
- 成功保存使用轻量提示并返回课程库。

### 16.3 存储错误

- localStorage 不可用或写入失败时保留当前草稿；
- 明确提示用户课程尚未保存；
- 不因读取到无效数据而让整个课程库页面崩溃。

## 17. 测试策略

### 17.1 core 单元测试

- 缺少版本时使用当前最新版解析器；
- 显式版本选择对应解析器；
- 不支持的显式版本返回版本错误且不回退；
- 平台指定默认版本覆盖当前最新版；
- `TITLE` 和 `NOTE` 缺失、为空或只有空白时规范化为未设置；
- `GOAL` 缺失、为空或只有空白时拒绝；
- 五种用户步骤的解析与序列化；
- WU/MS/CD 阶段顺序和唯一性；
- 时间、距离和配速单位规范化；
- Daniels、ST、自定义配速、三种心率和 RPE 目标；
- 跑步步骤、恢复、休息和循环的属性限制；
- 单层循环与十层以内嵌套循环；
- 超深循环拒绝；
- 空阶段、空循环和非法数值拒绝；
- JSON 风格备注转义；
- `parse(serialize(workout))` 结构等价；
- 汇总包含恢复和休息；
- 主训练容量排除热身、恢复、休息和冷身；
- 内置课程全部通过解析、校验和往返测试；
- 复制课程生成独立深拷贝。

### 17.2 Web 组件测试

- 课程库按钮和分类切换；
- 内置课程与自定义课程的不同操作；
- 新建课程草稿；
- 编辑保存并立即刷新；
- 复制内置/自定义课程；
- 删除确认；
- 单条导入成功后进入草稿；
- 单条导入失败显示行列错误且不持久化；
- 课程卡片展示汇总和递归结构；
- 嵌套循环的递归展示；
- 编辑器添加、复制、移动、删除步骤；
- 聚焦编辑按步骤类型显示合法字段；
- 未保存离开提示；
- localStorage 读取和写入错误。

### 17.3 浏览器验收

至少覆盖以下完整流程：

1. 在课程库中新建含热身、循环、恢复和冷身的课程；
2. 保存后在课程库看到正确结构预览和汇总；
3. 编辑课程并刷新页面，修改仍然存在；
4. 复制一条内置课程并修改副本，原课程不变；
5. 粘贴单条嵌套循环 DSL，进入草稿后保存；
6. 输入非法 DSL，看到精确错误且课程库未增加记录；
7. 在移动端宽度下完成步骤编辑；
8. 在桌面端完成排序和循环编辑；
9. 导出课程 DSL 后重新导入，结构等价。

## 18. 验收标准

- 用户可以直接从课程库新建自定义课程；
- 用户可以编辑、复制和删除自定义课程；
- 用户可以复制内置课程为独立自定义草稿；
- 用户可以导入且只能一次导入一条 DSL；
- 导入、复制和新建都复用同一个编辑器；
- 内置课程全部使用新 DSL 重写；
- 恢复和休息是独立、可排序、可循环的真实步骤；
- 课程结构能够无损导出和重新解析；
- 循环及嵌套循环在课程库和编辑器中均易于阅读；
- 汇总正确计算循环、恢复和休息；
- 桌面端和移动端均可完成完整编辑流程；
- core 不依赖 Web、localStorage、Vue 或设备平台；
- core 与 Web 自动化测试全部通过；
- Web 生产构建通过。
