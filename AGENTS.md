# AGENTS.md — core 仓库统一约定

本文件是本仓库（开源共享层）开发人员与 AI 助手的统一约定。开发决策先对齐定位，再动代码。

## 定位

```text
训练思想（基点）
   └─ DSL（共享描述：公开冻结规范，互通接口）
        └─ core（本仓库：可共享的开源内核，纯 TS）
             ├─ web（本仓库内：开源的小型预览应用）
             └─ 其他平台壳（如微信小程序，闭源，各自消费本仓库产物）
```

- **训练思想是基点**：功能设计先问「它如何服务于训练思想」，而不是反过来。
- **DSL 是共享描述**：规范优先于实现；语义变更一律进入新版本目录，冻结目录不可修改。
- **core 纯 TS**：`packages/core` 平台无关，不得引入 Vue / 微信 API；平台渲染各自实现。

## 边界规则

- 共享逻辑与内容进 `packages/core`；web 只做渲染与交互，不复刻业务规则。
- 训练思想正文保持纯 markdown；程序化只做「关系」（类型化引用、指令渲染），不拆「正文」。
- 修改 `packages/core` 源码后必须先重建产物（`npm run build`），web 消费 `dist`。
- DSL 冻结规范在 `spec/dsl/`；新增版本按 `spec/dsl/README.md` 的流程执行。
- `ebook/src` 是应用正文的来源（`packages/core/src/content/generated.ts` 由脚本生成），
  `src` 与 `docs/` 是 GitBook 站点产物；修改正文时按 `packages/core/scripts` 的生成流程同步。

## 验证

```bash
npm run verify   # core 测试 + 类型检查 + 构建 + web 测试与构建
```
