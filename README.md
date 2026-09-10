# 南风咖啡厅的马拉松训练计划

这一套训练计划基于丹尼尔斯训练体系，包含EMTIR五种基础训练类型，通过五种不同类型的训练组合进行训练。
课表的展示方式会尽可能提供足够的自由度，方便调整。

**训练思路比具体课表更重要**，不理解训练思路（或是课表的设计思路），即使拿了一个课表也不能及时调整适应（除非你有自己的私人教练一直盯着）。因此这一套训练计划会尽可能清晰地展开说明训练的原理，希望看完后可以让大家自己安排和调整属于自己的课表。

最后祝大家科学训练，顺利PB。

个人能力有限，内容中难免出现错漏，如果发现问题，欢迎拍砖指正。

最新版本会发布在[https://tatsuyapan.github.io/TrainForMarathon/][发布地址]

[发布地址]:https://tatsuyapan.github.io/TrainForMarathon/

## 项目结构

- `packages/core`：平台无关的训练模型、课表、会话生命周期与统计。
- `web`：Vue 3 + TDesign Web 应用，使用浏览器本地存储。
- `ebook/src`：课程正文与图片源文件。

## 训练会话生命周期

一个训练日可以有零到多个 `TrainingSession`；一次训练最多对应一份实际训练记录：

```text
planned（待完成）
  ├─ done（实际内容、距离、时长、RPE、日志、完成时间）
  └─ skipped（未进行，不产生训练记录）
```

同日多次训练会先聚合为一条日进度：全部完成为“已完成”，全部未进行为“未进行”，状态混合或仍有待完成训练为“部分完成”。

## 开发验证

```bash
npm install
npm test
npm run typecheck
npm run build

cd web
npm install
npm test
npm run build
```
