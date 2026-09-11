# Workout DSL v2 冻结规范

**版本：** 2
**状态：** 冻结（本文件不再修改；语义变更进入 v3）
**冻结日期：** 2026-09-11
**适用入口：** `parseWorkoutDslV2` / `serializeWorkoutV2` / `CURRENT_WORKOUT_DSL_VERSION`

本文档是版本 2 的完整、自包含规范。任何平台的 v2 解析器、序列化器、编辑器与展示实现都以本文为准。

版本 2 是版本 1 的**严格超集**：v1 的全部合法输入在 v2 下解析结果除 `dslVersion` 外完全一致；v2 唯一新增为 **H 记法**（见 §1.4 与 §2），用于完整支持训练思想正文的书写习惯。

## 1. 领域模型

### 1.1 Workout

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

- `dslVersion` 始终存在。DSL 未声明版本时，由解析器填入它实际使用的版本（v1 解析器填 `1`）。
- `title` 可省略。缺省、空串或仅空白时规范化为 `undefined`。
- `goal` 必填。去除首尾空白后不能为空。
- `note` 可省略，规范化规则同 `title`。
- `main` 阶段必须存在且只能存在一次。
- `warmup`、`cooldown` 各自最多存在一次。
- 阶段顺序固定为 `warmup → main → cooldown`。
- 每个阶段至少包含一个分部。

### 1.2 分部

```ts
export type WorkoutSegment = RunStep | RecoveryStep | RestStep | RepeatBlock;

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

`RepeatBlock.segments` 可继续包含 `RepeatBlock`，最大嵌套深度 10（最外层循环深度记为 1）。

### 1.3 负荷

```ts
export type Load =
  | { type: "time"; seconds: number }
  | { type: "distance"; meters: number };
```

内部只保存整数秒与整数米，不保存原始输入单位，因此 `1.5min` 与 `90s` 是同一个结构。

标准序列化规则：

- 整分钟（秒数能被 60 整除）输出 `Nmin`；
- 其他时间输出 `Ns`；
- 距离大于等于 1000 米输出 `Nkm`（去掉多余小数位）；
- 其他距离输出 `Nm`。

示例：600 秒 → `10min`；90 秒 → `90s`；1500 米 → `1.5km`；800 米 → `800m`。

### 1.4 训练目标

```ts
export type DanielsZone = "E" | "M" | "T" | "I" | "R" | "ST";

export type TrainingTarget =
  | { type: "daniels"; zone: DanielsZone }
  | { type: "pace-range"; fastSecondsPerKm: number; slowSecondsPerKm: number }
  | { type: "heart-rate"; basis: "max" | "reserve"; minPercent: number; maxPercent: number }
  | { type: "heart-rate-absolute"; minBpm: number; maxBpm: number }
  | { type: "rpe"; value: number };
```

- `E`/`M`/`T`/`I`/`R` 是 Daniels 核心强度。
- `ST` 是本项目的短距离神经激活/跨步跑扩展，必须在用户文档中标注为项目扩展。
- `L`（长距离）用长时间或长距离的 `E` 跑表达，不是独立强度。
- **`H` 与 `I` 是同一强度（最大摄氧量）**。区别只在书写习惯：训练思想正文中 `H` 基于时间控制
  （如 `3min@H`），`I` 基于距离控制（如 `800m@I`）。因此：
  - `H` 记法解析为 `{ type: "daniels"; zone: "I" }`，与 `I` 完全相同；
  - `H` 目标**只允许搭配时间负荷**；`800m@H` 这类距离负荷 + `H` 的写法是错误输入，
    解析器必须明确报错（距离型 I 强度应写 `@I`）；
  - 标准序列化输出规范写法 `@I`（负荷类型已携带时间语义，见 §5）。
- 坡跑用 `@inc`（`inclinePercent`）表达，不是独立强度，与 `H` 记法无关。
- 每个跑步步骤只有一个主目标；`rpe` 字段在已存在主目标时只作为辅助体感提示。
- v2 不允许同一个跑步步骤同时设置配速主目标和心率主目标。

### 1.5 五种用户可见步骤

| 用户名称 | 模型 | DSL | 行为 |
| --- | --- | --- | --- |
| 热身 | `warmup` 阶段的 `RunStep` | `WU:` | 按指定目标完成热身跑 |
| 主训练 | `main` 阶段的 `RunStep` | `MS:` | 按指定目标完成主要训练负荷 |
| 恢复 | `RecoveryStep` | `@jog` | 按时间或距离主动慢跑恢复 |
| 休息 | `RestStep` | `@rest` | 按时间被动恢复，不产生距离 |
| 冷身 | `cooldown` 阶段的 `RunStep` | `CD:` | 按指定目标完成冷身跑 |

阶段容器与分部类型不重复表达同一状态：普通跑步步骤的角色由所在阶段决定；恢复与休息有独立分部类型，在任何阶段内都保持自身语义。

## 2. 正式语法

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

daniels-zone  = "E" | "M" | "T" | "I" | "H" | "R" | "ST" ;

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

### 2.1 词法规则

- 关键字区分大小写，标准关键字为 ASCII：`WORKOUT`、`TITLE`、`GOAL`、`NOTE`、`WU`、`MS`、`CD`、`x`、`jog`、`rest`。
- UI 可以显示中文与乘号 `×`，导出的 DSL 只使用标准关键字。
- 标记之间允许空白，标准序列化不输出多余空白。
- `TITLE`、`GOAL`、`NOTE` 的值是该行第一个冒号之后的全部文本，去除首尾空白，不能跨行。
- `quoted-text` 使用 JSON 字符串转义规则。
- 时间与距离解析后必须能无损转换为整数秒或整数米。
- 不接受 `10min E`、`Run 10min@E`、逗号分隔等替代写法。
- 头部元数据必须出现在所有阶段之前，各自最多出现一次，顺序为 `WORKOUT/n → TITLE → GOAL → NOTE`。
- 阶段行可以重复出现，但每种阶段最多一次；阶段体解析范围止于行尾，不支持跨行序列。
- 阶段顺序固定为 `WU → MS → CD`。
- 空行被忽略。

### 2.2 版本选择

```text
WORKOUT/1
```

- 声明版本时，平台选择对应解析器；不支持该版本时抛出明确的“版本不支持”错误，不猜测、不降级。
- 未声明版本时，默认使用平台当前支持的最新版解析器；该解析器解析失败时直接返回语法错误，不尝试其他版本。
- 平台可以只提供最新版解析器，也可以维护解析器注册表、固定默认版本或直接调用指定版本解析器。
- 标准导出默认写入 `WORKOUT/<版本>`；紧凑导出可以省略版本行，其含义始终是“按接收平台的当前最新版解析”：

```ts
serializeWorkout(workout);                     // 含 WORKOUT/1
serializeWorkout(workout, { version: false }); // 省略版本行
```

### 2.3 属性限制

- `RunStep`：允许 `@RPE<整数>`、`@inc<数值>`、`@note("…")`；
- `RecoveryStep`、`RestStep`、`RepeatBlock`：只允许 `@note("…")`；
- 被动休息只接受时间负荷，不接受距离；
- 不允许 `2min@rest@inc3` 这类无意义组合；
- 属性出现顺序固定为 `@RPE` → `@inc` → `@note(...)`；同一属性重复出现时后出现的覆盖先出现的。

## 3. 数值约束

| 字段 | 约束 |
| --- | --- |
| 时间负荷 | 解析后必须是正整数秒，且大于零 |
| `@H` 目标 | 只能搭配时间负荷；距离负荷 + `@H` 是错误输入 |
| 距离负荷 | 解析后必须是正整数米，且大于零 |
| 循环次数 | 正整数 |
| `@RPE` | 1–10 的整数 |
| `@inc` | 0–20，允许小数 |
| 心率百分比 | 40–100 的整数，下限小于上限 |
| 绝对心率 | 40–230 的整数，下限小于上限 |
| 自定义配速 | 每公里秒数 90–900 的整数，快端小于慢端 |
| 循环嵌套 | 最大深度 10 |
| 阶段 | `main` 必须存在且唯一，`warmup`/`cooldown` 最多各一次，每个阶段至少一个分部 |

## 4. 循环语义

循环严格重复括号内的完整序列：

```text
6x(8min@T+90s@jog)
```

表示六次主训练与六次主动恢复。DSL 不提供隐藏的“最后一次跳过恢复”标志；若最后一次不恢复，必须显式写成：

```text
5x(8min@T+90s@jog)+8min@T
```

这保证 DSL、AST、课程预览与实际执行完全一致。

## 5. 规范化与往返

解析器直接生成规范化 AST：

- 显式版本写入 `dslVersion`；缺少版本时写入解析器版本；
- 空白 `TITLE`、`NOTE` 规范化为未设置；
- `GOAL` 去除首尾空白并校验非空；
- 所有时间转换为整数秒，所有距离转换为整数米；
- 阶段按固定顺序保存；
- 数值范围在解析时校验；
- 备注按 JSON 字符串转义还原；
- 不保留输入空白与原始单位，不接受或保存旧字段。

序列化器只接受通过校验的 AST。以下差异不属于语义差异：

- `1.5min` 解析后导出为 `90s`；
- 输入中的多余空白被移除；
- 距离按标准单位规则重新选择 `km`/`m`；
- `H` 记法序列化为规范写法 `@I`（H 与 I 同一强度，负荷类型已携带时间语义）。

往返测试以结构等价（不是字符串相等）为准：

```ts
expect(parseWorkoutDsl(serializeWorkout(workout))).toEqual(workout);
```

## 6. 汇总规则

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

- 距离型热身、主训练、恢复、冷身计入已知总距离；
- 时间型热身、主训练、恢复、休息、冷身计入已知总时间；
- 被动休息不产生距离；
- 循环内全部负荷乘以循环次数；
- 主训练容量（`work*`）只统计 `main` 阶段的跑步步骤，不含热身、恢复、休息与冷身；
- 时间型步骤在没有配速上下文时不能转换为距离，距离型步骤同理；
- 平台在拥有运动员配速数据时可以额外估算完整距离与时间，估算结果不写入 DSL。

## 7. 合法示例

最小合法课程（`GOAL` + `MS` 即可）：

```text
GOAL:有氧基础
MS:40min@E
```

完整形态：

```text
WORKOUT/2
TITLE:T 跑 8min×6
GOAL:乳酸阈能力
NOTE:每组稳定完成
WU:15min@E
MS:6x(8min@T@RPE8+90s@jog)
CD:10min@E
```

亚索 800：

```text
GOAL:最大摄氧量
WU:2km@E
MS:10x(800m@I+3min@jog)
CD:2km@E
```

H 记法（I 强度按时间控制，训练思想正文的书写习惯）：

```text
WORKOUT/2
TITLE:3 分钟间歇 ×8
GOAL:最大摄氧量
WU:15min@E
MS:8x(3min@H+2min@jog)
CD:10min@E
```

同一课表的规范序列化输出（H 规范化为 @I）：

```text
WORKOUT/2
TITLE:3 分钟间歇 ×8
GOAL:最大摄氧量
WU:15min@E
MS:8x(3min@I+2min@jog)
CD:10min@E
```

被动休息：

```text
GOAL:速度与跑步经济性
WU:15min@E
MS:8x(400m@R@RPE9+3min@rest)
CD:10min@E
```

心率与配速目标：

```text
GOAL:有氧基础
MS:45min@HR65-78%max
```

```text
GOAL:轻松恢复
MS:40min@HR60-70%hrr
```

```text
GOAL:稳定有氧
MS:40min@HR145-160bpm
```

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
GOAL:I 与 T 混合刺激
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

备注转义：

```text
GOAL:有氧基础
MS:40min@E@note("压低心率，保持\"能说话\"的强度")
```

## 8. 变更政策

本文件发布后即为版本 2 的冻结文本。任何语义变更（新增步骤类型、修改关键字、放宽或收紧约束、改变规范化结果）都必须：

1. 在 `spec/dsl/v3/` 建立新规范；
2. 在 core 中新增 `dsl/v3.ts` 并注册到版本表；
3. 保持 v2 及更早版本的解析器与序列化器不变，除非是事实性笔误修正。
