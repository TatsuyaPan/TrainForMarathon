import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@core": fileURLToPath(new URL("../packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "happy-dom",
  },
});
