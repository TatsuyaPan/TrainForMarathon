# Train For Marathon · Web

核心包（`@train-for-marathon/core`）的**完整调用层与演示**：零登录、零配置，
clone 后直接运行。与微信小程序共用同一套核心调用（运动员模型、课表、打卡、统计）。

## 运行

```bash
cd web
npm install
npm run dev        # 开发（自动同步课程图片）
npm run build      # 构建到 dist/（相对路径，可部署 GitHub Pages）
npm run preview    # 预览构建产物
```

## 设计

- **零登录**：首次进入自动创建虚拟运动员（`ensureAthlete`，localStorage 持久化）。
  运动员数据结构与微信登录后的完全一致——微信以 openid 为 id，web 用本地生成的 id，
  差异只收敛在存储适配器（微信云数据库 / web localStorage）。
- **课程内容**：直接读取核心包内置内容（正文 + 图片），走「默认 manifest 相对路径」寻址；
  微信小程序则替换 manifest 到云存储。同一份内容，不同分发方式。
- **页面**：训练（当前周/今日训练/打卡/统计）、课表（周导航）、课程（目录 + 正文渲染）、
  配速（10k PB → 各档配速）、我的（配置/重置）。

## 结构

```
web/
  index.html
  vite.config.js         # @core 别名 → packages/core/dist
  src/
    main.js              # hash 路由 + 运动员会话
    stores/local-storage-store.js   # localStorage DataStore
    views/               # home / plan / courses / course / paces / settings
  scripts/sync-web-assets.mjs       # 课程图片 → public/course-images/
  public/course-images/  # 构建时自动同步
```
