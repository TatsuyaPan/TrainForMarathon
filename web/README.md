# Train For Marathon · Web

核心包（`@train-for-marathon/core`）的**完整调用层与演示**：零登录、零配置，
clone 后直接运行。与微信小程序共用同一套核心调用（运动员模型、课表、会话生命周期、打卡与统计）。

## 运行

```bash
cd ..
npm install
npm run build      # 先生成 packages/core/dist

cd web
npm install
npm run dev        # 开发（自动同步课程图片）
npm test           # 单元测试与组件测试
npm run build      # 构建到 dist/（相对路径，可部署 GitHub Pages）
npm run preview    # 预览构建产物
```

回归验证可在仓库根目录一次跑完（core 测试 + 类型检查 + 构建 + web 测试与构建）：

```bash
npm run verify
```

## 设计

- **核心与界面分离**：业务规则全部在 `packages/core`——课表实例化、会话生命周期、
  配速与 VDOT 推算、Workout DSL 的解析与汇总。web 只负责渲染与交互，
  平台差异收敛在 `src/app-context.js` 与存储适配器（微信云数据库 / web localStorage）。
  迁移到小程序时替换这两处，即可复用同一套核心调用。
- **零登录**：首次进入自动创建虚拟运动员（`ensureAthlete`，localStorage 持久化）。
  结构与微信登录后的完全一致——微信以 openid 为 id，web 用本地生成的 id。
- **课程内容**：直接读取核心包内置内容（正文 + 图片），走「默认 manifest 相对路径」寻址；
  微信小程序则替换 manifest 到云存储。同一份内容，不同分发方式。
- **课程库**：内置课程 + 自定义课程（localStorage `tfm:course-library:v1`），
  支持新建、编辑、复制与导入 DSL；展示与编辑都以 v1 结构树为准，循环可嵌套。
- **训练记录**：一次训练最多一份实际记录；默认按计划完成，也可用可视化编辑器调整实际训练内容。

## 页面

| 路由 | 说明 |
| --- | --- |
| `/training` | 训练周期日历（每周每天的状态与完成统计） |
| `/training/week` | 训练周视图（7 天导航与当日摘要） |
| `/training/day` | 训练日视图：会话列表（待完成/已完成/未进行）+ 添加训练 |
| `/training/session` | 单次训练记录：实际内容、距离、时长、RPE、训练日志 |
| `/edit` | 课表编辑器：编辑当天课表，或某一次追加训练的计划内容 |
| `/library` | 课程库工作台：分类筛选、我的课程、新建/导入/复制/删除 |
| `/library/new`、`/library/:id/edit` | 课程编辑：元数据 + 结构编辑器 + DSL 导入导出 |
| `/courses`、`/course/:id` | 训练思想目录与正文渲染 |
| `/paces` | 自由配速计算器（6 秒规则 / VDOT），结果可保存为我的能力 |
| `/fitness` | 我的能力管理：查看、调整、清除配速基准 |
| `/settings` | 我的：配置、保存并重建课表、重置全部数据 |

## 测试

```bash
npm test        # vitest + happy-dom：单元与组件测试（test/*.test.js）
```

浏览器冒烟测试用 Playwright 跑真实交互（先 `npm run build` 并保持 `npm run preview` 运行）：

```bash
npm run preview          # 监听 4173，保持运行
python test/e2e_first_run.py          # 首次配置 → 生成课表 → 记录 → 文章
python test/e2e_session_lifecycle.py  # 一天多训练、完成/跳过、课表编辑与计划同步
python test/e2e_course_library.py     # 课程库展示、DSL 导入、新建/编辑/复制/删除
python test/e2e_settings_fitness.py   # 能力保存 → 重建课表 → 重置全部数据
python test/e2e_plan_adjust.py        # 调整课表：与本周另一天互换 / 采用备选
python test/e2e_mobile_layout.py      # 390px 手机宽度下逐页检查横向溢出
```

## 结构

```text
web/
  index.html
  vite.config.js         # @core 别名 → packages/core/dist
  vitest.config.js       # @core 别名 → packages/core/src（测试直接读源码）
  src/
    main.js              # 挂载、全局样式与错误处理
    router.js            # hash 路由
    app-context.js       # 全局 service、运动员缓存与能力保存
    stores/local-storage-store.js # localStorage DataStore
    stores/course-library.js      # 自定义课程库读写与校验
    stores/course-draft.js        # 页面级草稿传递（导入/复制）
    composables/useTrainingData.js # 计划、进度与会话加载
    components/           # 课程卡片、结构预览、结构与步骤编辑器、导入对话框
    views/                # 各页面
  test/                   # vitest 用例 + Playwright 冒烟脚本
  scripts/sync-web-assets.mjs       # 课程图片 → public/course-images/
  public/course-images/  # 构建时自动同步
```
