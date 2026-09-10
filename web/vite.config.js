import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  // 相对路径，便于部署到 GitHub Pages 等子路径
  base: "./",
  plugins: [vue()],
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("../packages/core/dist/index.js", import.meta.url)),
    },
  },
});
