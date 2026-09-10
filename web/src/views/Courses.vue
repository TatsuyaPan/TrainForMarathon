<template>
  <div class="courses-page">
    <div class="page-hero">
      <t-typography-title level="h4">训练思想</t-typography-title>
      <p class="muted">书中的训练指导全文：从训练基础、训练类型到课表制定与细节。<router-link to="/library">训练课程库 →</router-link></p>
    </div>

    <template v-for="section in sections" :key="section.id">
      <div class="section-title">
        <t-typography-title level="h5">{{ section.title }}</t-typography-title>
      </div>
      <t-card
        v-for="item in section.items"
        :key="item.id"
        class="doc-link"
        :bordered="true"
        role="button"
        tabindex="0"
        :data-testid="`doc-link-${item.id}`"
        @click="$router.push(`/course/${encodeURIComponent(item.id)}`)"
        @keydown.enter.prevent="$router.push(`/course/${encodeURIComponent(item.id)}`)"
        @keydown.space.prevent="$router.push(`/course/${encodeURIComponent(item.id)}`)"
      >
        <div class="doc-row">
          <span>{{ item.title }}</span>
          <span class="arrow">›</span>
        </div>
      </t-card>
    </template>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { getContentIndex } from "@core";

const SECTION_LABELS = {
  foundations: "训练基础",
  "training-types": "训练类型",
  plans: "课表制定",
  details: "训练的其他细节",
  references: "引用说明",
};

const sections = ref([]);

onMounted(() => {
  const map = new Map();
  for (const entry of getContentIndex()) {
    if (!map.has(entry.sectionId)) {
      map.set(entry.sectionId, { id: entry.sectionId, title: SECTION_LABELS[entry.sectionId] ?? entry.sectionId, items: [] });
    }
    map.get(entry.sectionId).items.push(entry);
  }
  sections.value = [...map.values()];
});
</script>

<style scoped>
.section-title { margin: 18px 0 8px; }
.doc-link { cursor: pointer; margin-bottom: 10px; }
.doc-link:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
.doc-row { display: flex; justify-content: space-between; align-items: center; }
.arrow { color: #b3bdb7; font-size: 16px; }
</style>
