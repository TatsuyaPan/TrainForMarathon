<template>
  <t-layout class="app-layout">
    <t-header class="app-header">
      <t-head-menu theme="light" :value="activeMenu" @change="onMenuChange">
        <t-menu-item value="/training">训练</t-menu-item>
        <t-menu-item value="/library">课程库</t-menu-item>
        <t-menu-item value="/courses">训练思想</t-menu-item>
        <t-menu-item value="/settings">我的</t-menu-item>
      </t-head-menu>
    </t-header>

    <t-content class="app-content">
      <router-view />
    </t-content>
  </t-layout>
</template>

<script setup>
import { computed, watch } from "vue";
import { useRoute, useRouter } from "vue-router";

const route = useRoute();
const router = useRouter();

const MENU_PATHS = ["/training", "/library", "/courses", "/settings"];
const activeMenu = computed(() => {
  const path = route.path;
  const match = MENU_PATHS.find((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return match ?? "/training";
});

function onMenuChange(value) {
  router.push(String(value));
}

// 路由切换回到页面顶部
watch(
  () => route.fullPath,
  () => {
    document.querySelector(".app-content")?.scrollTo?.(0, 0);
    window.scrollTo(0, 0);
  },
);
</script>

<style scoped>
.app-layout { min-height: 100vh; background: #f7f7f5; }
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #ffffff;
  border-bottom: 1px solid var(--td-component-stroke);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}
.app-header :deep(.t-head-menu) { background: transparent; }
.app-content {
  max-width: 980px;
  margin: 0 auto;
  padding: 20px 20px 64px;
  width: 100%;
}
</style>
