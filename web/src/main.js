import { createApp } from "vue";
import TDesign from "tdesign-vue-next";
import "tdesign-vue-next/es/style/index.css";
import App from "./App.vue";
import { router } from "./router.js";
import "./styles.css";

const app = createApp(App);

// 全局错误处理：打印出错的组件链，便于定位
app.config.errorHandler = (err, instance, info) => {
  console.error("[Vue error]", info, err);
  const chain = [];
  let current = instance;
  while (current) {
    chain.push(current.type?.__name ?? current.type?.name ?? "anonymous");
    current = current.parent;
  }
  console.error("component chain:", chain.join(" > ") || "(no instance)");
};

app.use(TDesign).use(router).mount("#app");
