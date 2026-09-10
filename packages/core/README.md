# @train-for-marathon/core

TrainForMarathon 的平台无关领域核心。运行时代码不依赖微信、CloudBase、DOM、网络或文件系统。

## 当前能力

- 内置 23 篇课程 Markdown 与稳定内容导航；
- 内置典型 20 周和五周循环课表；
- 校验课表周次、七日结构、跑量比例和训练类型；
- 按比赛日期、阈值配速和最大周跑量实例化课表；
- 计算完成次数、实际跑量、完成率和连续完成周数。

## 使用

```ts
import {
  calculateSixSecondPaces,
  calculateStats,
  getContentById,
  instantiatePlan,
} from "@train-for-marathon/core";

const paces = calculateSixSecondPaces(220); // 单位：秒/公里
const article = getContentById("training-types/pace-baseline");
const plan = instantiatePlan("20-week", {
  raceDate: "2027-03-21", // YYYY-MM-DD；作为模板最后一天
  thresholdPaceSecondsPerKm: 220,
  maxWeeklyKm: 100,
});
const stats = calculateStats(plan, []);
```

日期计算使用 UTC 日历日期，避免运行设备的时区改变课表日期。周次采用倒计时：20 周课表从 20 到 1，比赛日是第 1 周的最后一天。

## 配速限制

当前仅实现课程原文明确描述的阈值配速分档：T、I、R 每档相差 15 秒/公里。E 和 M 保持为 `null`，不虚构原文未给出的精确配速。VDOT 整表尚未接入，需先确认合法数据来源。

## 开发命令

```bash
npm test
npm run typecheck
npm run build
```

构建会根据 `content-manifest.json` 将现有 Markdown 生成到运行时包中。`src/content/generated.ts` 是生成文件，不应手工修改。
