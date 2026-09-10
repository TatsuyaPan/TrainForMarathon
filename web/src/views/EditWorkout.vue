<template>
  <div v-if="error" class="muted">{{ error }}</div>
  <template v-else>
    <div class="page-hero">
      <t-typography-title level="h4">
        {{ day?.label }} <span class="muted">· {{ day?.date }}</span>
      </t-typography-title>
      <p class="muted">总量 {{ totals.distanceKm }} km / {{ totals.durationMinutes }} min</p>
      <div class="btn-row">
        <t-button size="small" variant="outline" @click="$router.push({ path: '/training/day', query: { date: day?.date } })">返回训练</t-button>
      </div>
    </div>

    <WorkoutEditorPanel :model-value="workout" @update:model-value="applyWorkout" />

    <t-card :bordered="true" style="margin-top: 12px">
      <div class="btn-row">
        <t-button @click="libraryOpen = !libraryOpen">{{ libraryOpen ? "收起课程库" : "从课程库选择" }}</t-button>
        <t-button @click="customOpen = !customOpen">{{ customOpen ? "收起" : "保存为自定义课程" }}</t-button>
        <t-button variant="outline" @click="dslOpen = !dslOpen">{{ dslOpen ? "收起" : "导出 DSL" }}</t-button>
      </div>
    </t-card>

    <t-card v-if="libraryOpen" :bordered="true" style="margin-bottom: 12px">
      <div class="btn-row">
        <button
          v-for="[type, label] in typeEntries"
          :key="type"
          class="lib-tab"
          :class="{ active: libraryType === type }"
          :style="tabStyle(type, libraryType === type)"
          @click="libraryType = type"
        >{{ label }}</button>
      </div>
      <div v-for="entry in filteredLibrary" :key="entry.id" class="lib-entry">
        <span class="intensity-bar" :style="intensityBarStyle(entry.workout)"></span>
        <div class="lib-head">
          <strong>{{ entry.name }}</strong>
          <span class="muted">{{ entry.weeklyKmHint }}</span>
        </div>
        <div class="lib-dsl muted">{{ entry.dsl }}</div>
        <t-button size="small" theme="primary" @click="applyEntry(entry)">使用此课表</t-button>
      </div>
      <p class="muted"><router-link to="/library">打开完整课程库 →</router-link></p>
    </t-card>

    <t-card v-if="customOpen" :bordered="true" style="margin-bottom: 12px">
      <t-form label-align="top">
        <t-form-item label="课程名称">
          <t-input v-model="customName" :maxlength="30" placeholder="例：亚索 800×8" />
        </t-form-item>
        <t-form-item label="强度分类">
          <t-select v-model="customType" style="width: 200px">
            <t-option v-for="[type, label] in typeEntries" :key="type" :value="type" :label="label" />
          </t-select>
        </t-form-item>
      </t-form>
      <div class="lib-dsl muted">{{ dslText }}</div>
      <div class="btn-row">
        <t-button theme="primary" @click="saveCustom">保存到课程库</t-button>
      </div>
    </t-card>

    <t-card v-if="dslOpen" :bordered="true" style="margin-top: 12px">
      <t-textarea v-model="dslText" :autosize="{ minRows: 2, maxRows: 5 }" readonly label="导出（分享文案）" />
      <t-form label-align="top" style="margin-top: 12px">
        <t-form-item label="导入（粘贴 DSL 后点解析）">
          <t-textarea v-model="dslImport" :autosize="{ minRows: 2, maxRows: 5 }" placeholder="例：(6min@T@rpe8+1min@jg)*8" />
        </t-form-item>
      </t-form>
      <t-button theme="primary" @click="parseDsl">解析导入</t-button>
      <div v-if="dslError" class="muted error-text">{{ dslError }}</div>
    </t-card>

    <div class="btn-row" style="margin-top: 16px">
      <t-button theme="primary" size="large" @click="persist">保存课表</t-button>
      <t-button size="large" @click="$router.push({ path: '/training/day', query: { date: day?.date } })">取消</t-button>
    </div>
  </template>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import {
  LIBRARY_TYPE_LABELS,
  getLibraryEntry,
  intensityBarStyle,
  listLibraryByType,
  parseWorkoutDsl,
  serializeWorkout,
  validateWorkout,
  workoutTotals,
} from "@core";
import { service } from "../app-context.js";
import WorkoutEditorPanel from "./WorkoutEditorPanel.vue";
import { addCustomEntry } from "../stores/custom-library.js";

const props = defineProps({
  planId: { type: String, required: true },
  dayId: { type: String, required: true },
});

const error = ref("");
const plan = ref(null);
const day = ref(null);
const workout = reactive({ goal: "", segments: [] });
const libraryOpen = ref(false);
const libraryType = ref("T");
const customOpen = ref(false);
const customName = ref("");
const customType = ref("mixed");
const dslOpen = ref(false);
const dslImport = ref("");
const dslError = ref("");

const typeEntries = Object.entries(LIBRARY_TYPE_LABELS);
const filteredLibrary = computed(() => listLibraryByType(libraryType.value));
const totals = computed(() => workoutTotals(workout));
const dslText = computed(() => {
  try {
    return serializeWorkout(workout);
  } catch (e) {
    return `（无法导出：${e.message}）`;
  }
});

function tabStyle(type, active) {
  const colors = { E: "#3d9a5f", M: "#8fc93a", T: "#e3b93c", I: "#d9402f", R: "#8e44ad" };
  const color = colors[type] ?? "#17211b";
  return active
    ? { background: color, borderColor: color, color: "#fff" }
    : { background: `${color}1f`, borderColor: color, color };
}

function applyWorkout(value) {
  workout.goal = value.goal;
  workout.segments = value.segments;
}

function applyEntry(entry) {
  workout.goal = entry.workout.goal;
  workout.segments = structuredClone(entry.workout.segments);
  libraryOpen.value = false;
}

async function saveCustom() {
  const name = customName.value.trim();
  if (!name) { window.alert("请填写课程名称"); return; }
  try {
    addCustomEntry({ type: customType.value, name, dsl: serializeWorkout(workout), source: "自定义" });
    customOpen.value = false;
    window.alert("已保存到课程库");
  } catch (e) {
    window.alert(e.message);
  }
}

function parseDsl() {
  dslError.value = "";
  try {
    const parsed = parseWorkoutDsl(dslImport.value);
    workout.goal = parsed.goal ?? workout.goal;
    workout.segments = structuredClone(parsed.segments);
    dslImport.value = "";
    window.alert("导入成功");
  } catch (e) {
    dslError.value = e.message;
  }
}

async function persist() {
  const errors = validateWorkout(workout);
  if (errors.length > 0) {
    window.alert(errors.join("\n"));
    return;
  }
  const updated = structuredClone(plan.value);
  const targetWeek = updated.weeks.find((w) => w.days.some((d) => d.id === props.dayId));
  const targetDay = targetWeek.days.find((d) => d.id === props.dayId);
  const totalsValue = workoutTotals(workout);
  targetDay.workout = { ...workout, totalDistanceKm: totalsValue.distanceKm, totalDurationMinutes: totalsValue.durationMinutes };
  targetDay.plannedDistanceKm = targetDay.workout.totalDistanceKm;
  targetDay.plannedDurationMinutes = targetDay.workout.totalDurationMinutes;
  await service.savePlan(updated);
  window.alert("课表已保存");
  window.location.hash = `#/training/day?date=${targetDay.date}`;
}

onMounted(async () => {
  plan.value = await service.getPlan(props.planId);
  if (!plan.value) { error.value = "计划不存在"; return; }
  const targetWeek = plan.value.weeks.find((w) => w.days.some((d) => d.id === props.dayId));
  day.value = targetWeek?.days.find((d) => d.id === props.dayId);
  if (!day.value) { error.value = "训练日不存在"; return; }
  if (day.value.workout) {
    workout.goal = day.value.workout.goal;
    workout.segments = structuredClone(day.value.workout.segments);
  }
});
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
.lib-entry {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 10px;
}
.lib-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lib-dsl { font-size: 12px; margin: 6px 0; word-break: break-all; }
.empty { padding: 18px; text-align: center; }
.error-text { color: #d54941; margin-top: 8px; }
</style>
