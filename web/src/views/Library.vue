<template>
  <div class="library-page">
    <div class="page-hero">
      <t-typography-title level="h4">课程库</t-typography-title>
      <p class="muted">按训练强度分类：内置课程（原书各章推荐课表）+ 你的自定义课程。强度色阶：E 绿 → M 黄绿 → T 黄 → I 红 → R 紫。</p>
    </div>

  <div class="btn-row">
    <button
      v-for="type in TYPE_ORDER"
      :key="type"
      class="lib-tab"
      :class="{ active: activeType === type }"
      :style="tabStyle(type, activeType === type)"
      @click="activeType = type"
    >{{ LIBRARY_TYPE_LABELS[type] }}</button>
  </div>

  <template v-for="type in TYPE_ORDER" :key="type">
    <template v-if="type === activeType">
      <div v-if="customByType(type).length" class="section">
        <t-typography-title level="h5">我的自定义</t-typography-title>
        <div v-for="entry in customByType(type)" :key="entry.id" class="lib-entry">
          <span class="intensity-bar" :style="intensityBarStyle(entry.workout)"></span>
          <div class="lib-head">
            <t-tag variant="light" :style="{ background: intensityColor(entry.type), color: '#fff', borderColor: 'transparent' }">{{ entry.type === "mixed" ? "混" : entry.type }}</t-tag>
            <strong>{{ entry.name }}</strong>
            <span class="muted">{{ entry.weeklyKmHint }}</span>
          </div>
          <div class="lib-dsl muted">{{ entry.dsl }}</div>
          <div class="btn-row">
            <t-button size="small" theme="primary" @click="copyDsl(entry.dsl)">复制 DSL</t-button>
            <t-button size="small" theme="danger" variant="outline" @click="removeEntry(entry.id)">删除</t-button>
          </div>
        </div>
      </div>

      <div class="section">
        <t-typography-title level="h5">内置课程</t-typography-title>
        <div v-for="entry in builtinByType(type)" :key="entry.id" class="lib-entry">
          <span class="intensity-bar" :style="intensityBarStyle(entry.workout)"></span>
          <div class="lib-head">
            <t-tag variant="light" :style="{ background: intensityColor(entry.type), color: entry.type === 'mixed' ? '#fff' : '#fff', borderColor: 'transparent' }">{{ entry.type === "mixed" ? "混" : entry.type }}</t-tag>
            <strong>{{ entry.name }}</strong>
            <span class="muted">{{ entry.source }}</span>
            <span class="muted">{{ entry.weeklyKmHint }}</span>
          </div>
          <div class="lib-dsl muted">{{ entry.dsl }}</div>
          <div class="btn-row">
            <t-button size="small" variant="outline" @click="copyDsl(entry.dsl)">复制 DSL</t-button>
          </div>
        </div>
      </div>
    </template>
  </template>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { BUILTIN_LIBRARY, INTENSITY_COLORS, LIBRARY_TYPE_LABELS, intensityBarStyle } from "@core";
import { listCustomLibrary, removeCustomEntry } from "../stores/custom-library.js";

const TYPE_ORDER = ["E", "M", "T", "I", "R", "mixed"];
const activeType = ref("T");

const custom = computed(() => listCustomLibrary());

function intensityColor(type) {
  return INTENSITY_COLORS[type] ?? "#17211b";
}

function tabStyle(type, active) {
  const color = intensityColor(type);
  return active
    ? { background: color, borderColor: color, color: "#fff", fontWeight: 700 }
    : { background: `${color}1f`, borderColor: color, color };
}

function customByType(type) {
  return custom.value.filter((item) => item.tags.includes(type));
}

function builtinByType(type) {
  return BUILTIN_LIBRARY.filter((item) => item.tags.includes(type));
}

async function copyDsl(dsl) {
  try {
    await navigator.clipboard.writeText(dsl);
    window.alert("DSL 已复制，可粘贴分享或在编辑器导入");
  } catch {
    window.prompt("复制以下 DSL：", dsl);
  }
}

function removeEntry(id) {
  if (!window.confirm("删除该自定义课程？")) return;
  removeCustomEntry(id);
  custom.value = listCustomLibrary();
}
</script>

<style scoped>
.lib-tab {
  padding: 5px 14px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 13px;
  cursor: pointer;
  background: transparent;
}
.section { margin: 16px 0; }
.lib-entry {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--td-component-stroke);
  border-left: 6px solid var(--td-component-stroke);
  border-radius: 10px;
}
.lib-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lib-dsl { font-size: 12px; margin: 6px 0; word-break: break-all; }
</style>
