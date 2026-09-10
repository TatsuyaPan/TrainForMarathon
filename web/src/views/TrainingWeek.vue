<template>
  <div v-if="loading" class="muted">加载中…</div>
  <div v-else-if="!week" class="muted">未找到该周课表，<router-link to="/training">返回日历</router-link></div>
  <template v-else>
    <div class="page-hero">
      <t-typography-title level="h4">
        第 {{ week.week }} 周 · {{ week.phase }}
      </t-typography-title>
      <p class="muted">
        目标跑量 {{ week.targetKm.min }}-{{ week.targetKm.max }} km
        <t-button size="small" variant="text" @click="$router.push('/training')">返回日历</t-button>
      </p>
    </div>

    <t-card
      v-for="day in days"
      :key="day.id"
      class="week-day"
      :bordered="true"
      role="button"
      tabindex="0"
      :aria-label="`${day.date} ${day.label}：打开训练日`"
      :data-testid="`week-day-${day.date}`"
      @click="$router.push({ path: '/training/day', query: { date: day.date } })"
      @keydown.enter.prevent="$router.push({ path: '/training/day', query: { date: day.date } })"
      @keydown.space.prevent="$router.push({ path: '/training/day', query: { date: day.date } })"
    >
      <div class="day-head">
        <span class="muted">{{ day.date }} · {{ day.label }}</span>
        <t-tag :theme="statusTheme(day.status)" variant="light">{{ day.statusText }}</t-tag>
      </div>
      <span class="intensity-bar" :style="day.barStyle"></span>
      <div v-if="day.goal" class="day-goal">{{ day.goal }}</div>
      <div class="day-items muted">{{ day.itemTexts.join("；") }}</div>
      <div v-if="day.distanceKm" class="accent">计划 {{ day.distanceKm }} km</div>
    </t-card>
  </template>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import { PROGRESS_STATUS_LABELS, findPlanWeek, formatTrainingDay, intensityBarStyle } from "@core";
import { service } from "../app-context.js";
import { useTrainingData } from "../composables/useTrainingData.js";

const props = defineProps({ date: { type: String, required: true } });
const { loading, plan, recordsByDay, load } = useTrainingData();
const week = ref(null);
const days = ref([]);

const daysOfWeek = computed(() => {
  if (!week.value) return [];
  return week.value.days.map((day) => {
    const formatted = formatTrainingDay(day, plan.value.paces);
    const status = recordsByDay.value.get(day.id)?.status ?? null;
    return {
      ...formatted,
      barStyle: intensityBarStyle(day.workout),
      status,
      statusText: status ? PROGRESS_STATUS_LABELS[status] : "—",
      itemTexts: formatted.items.map((item) => item.text),
    };
  });
});

function statusTheme(status) {
  return status === "completed" ? "success" : status === "partial" ? "warning" : status === "skipped" ? "default" : "default";
}

function resolveWeek() {
  if (!plan.value) return;
  week.value = findPlanWeek(plan.value, props.date)?.week ?? null;
  days.value = daysOfWeek.value;
}

onMounted(async () => {
  await load();
  resolveWeek();
});

watch(() => props.date, async () => {
  if (!plan.value) await load();
  resolveWeek();
});
</script>

<style scoped>
.week-day { cursor: pointer; margin-bottom: 10px; }
.week-day:focus-visible { outline: 2px solid var(--td-brand-color); outline-offset: 2px; }
.day-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.day-goal { margin: 8px 0 4px; font-weight: 700; color: var(--td-brand-color); }
.day-items { font-size: 12px; margin-top: 4px; }
.accent { color: var(--td-brand-color); font-weight: 600; font-size: 13px; margin-top: 4px; }
</style>
