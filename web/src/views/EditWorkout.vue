<template>
  <div v-if="error" class="muted">{{ error }}</div>
  <template v-else-if="workout">
    <div class="page-hero">
      <t-typography-title level="h4">
        {{ heroTitle }} <span class="muted">· {{ day?.date }}</span>
      </t-typography-title>
      <p class="scope-line">
        <t-tag :theme="editingSession ? 'warning' : 'success'" variant="light">{{ scopeLabel }}</t-tag>
        <span class="muted">{{ scopeHint }}</span>
      </p>
      <p class="muted">
        已知时间 {{ headline.durationLabel ?? "—" }} · 已知距离 {{ headline.distanceLabel ?? "—" }}
      </p>
      <div class="btn-row">
        <t-button size="small" variant="outline" @click="backToDay">返回训练</t-button>
      </div>
    </div>

    <t-card :bordered="true">
      <label class="field">
        <span>训练目的（必填）</span>
        <input v-model="workout.goal" data-testid="day-goal" type="text" maxlength="40" placeholder="例：有氧基础" />
      </label>
    </t-card>

    <t-card :bordered="true" style="margin-top: 12px">
      <WorkoutEditor :workout="workout" @update:workout="applyWorkout" @error="showError" />
    </t-card>

    <t-card :bordered="true" style="margin-top: 12px">
      <div class="btn-row">
        <t-button data-testid="toggle-library" @click="libraryOpen = !libraryOpen">
          {{ libraryOpen ? "收起课程库" : "从课程库选择" }}
        </t-button>
        <t-button data-testid="toggle-dsl" @click="dslOpen = !dslOpen">{{ dslOpen ? "收起" : "导出 DSL" }}</t-button>
        <t-button data-testid="open-import" variant="outline" @click="importVisible = true">导入 DSL</t-button>
      </div>

      <div v-if="libraryOpen" class="library-picker">
        <div class="category-row">
          <button
            v-for="category in CATEGORY_ORDER"
            :key="category"
            type="button"
            class="category-chip"
            :class="{ active: libraryCategory === category }"
            @click="libraryCategory = category"
          >
            {{ category === "mixed" ? "混合" : category }}
          </button>
        </div>
        <div v-for="course in filteredLibrary" :key="course.id" class="lib-entry" :data-testid="`library-entry-${course.id}`">
          <StructurePreview
            :blocks="presentationOf(course.workout).preview.blocks"
            :mixed-units="presentationOf(course.workout).preview.mixedUnits"
            :compressed="presentationOf(course.workout).preview.compressed"
          />
          <div class="lib-head">
            <strong>{{ presentationOf(course.workout).title }}</strong>
            <span class="muted">{{ course.weeklyKmHint ?? "" }}</span>
          </div>
          <p class="muted">{{ course.workout.goal }}</p>
          <t-button size="small" theme="primary" @click="applyCourse(course)">使用此课表</t-button>
        </div>
      </div>

      <div v-if="dslOpen" class="dsl-block">
        <pre data-testid="day-dsl">{{ dslText }}</pre>
      </div>
    </t-card>

    <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>

    <div class="btn-row" style="margin-top: 16px">
      <t-button data-testid="save-day" theme="primary" size="large" :loading="saving" @click="persist">保存课表</t-button>
      <t-button size="large" @click="backToDay">取消</t-button>
    </div>

    <CourseImportDialog :visible="importVisible" @close="importVisible = false" @submit="applyImportedWorkout" />
  </template>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  BUILTIN_COURSES,
  LIBRARY_CATEGORIES,
  createDefaultWorkout,
  createWorkoutPresentation,
  serializeWorkout,
  setDayWorkout,
  setSessionPlannedWorkout,
} from "@core";
import { service } from "../app-context.js";
import WorkoutEditor from "../components/WorkoutEditor.vue";
import StructurePreview from "../components/StructurePreview.vue";
import CourseImportDialog from "../components/CourseImportDialog.vue";
import { listCustomCourses } from "../stores/course-library.js";
import { notifySuccess } from "../ui-feedback.js";

const props = defineProps({
  planId: { type: String, required: true },
  dayId: { type: String, required: true },
  /** 指定则编辑「这一次训练」的计划内容；缺省则编辑当天课表本身 */
  sessionId: { type: String, default: "" },
});

const router = useRouter();

const CATEGORY_ORDER = LIBRARY_CATEGORIES;

const error = ref("");
const errorMessage = ref("");
const saving = ref(false);
const plan = ref(null);
const day = ref(null);
const session = ref(null);
const workout = ref(null);
const libraryOpen = ref(false);
const libraryCategory = ref("T");
const dslOpen = ref(false);
const importVisible = ref(false);

const headline = computed(() => (workout.value ? createWorkoutPresentation(workout.value).headline : {}));
/** 编辑作用域：日常可见的「当天课表」还是某一次追加训练 */
const editingSession = computed(() => Boolean(session.value));
const heroTitle = computed(() => (editingSession.value ? session.value.label : day.value?.label));
const scopeLabel = computed(() => (editingSession.value ? "单独这次训练" : "当天课表"));
const scopeHint = computed(() =>
  editingSession.value
    ? "只影响这一次训练的计划内容，不改变计划本身。"
    : "写入计划课表；未完成的计划训练会跟随更新，已完成的记录保留原样。",
);
const dslText = computed(() => {
  try {
    return serializeWorkout(workout.value);
  } catch (caught) {
    return `（无法导出：${caught instanceof Error ? caught.message : "内容不完整"}）`;
  }
});
const libraryCourses = computed(() => [...BUILTIN_COURSES, ...listCustomCourses()]);
const filteredLibrary = computed(() =>
  libraryCourses.value.filter(
    (course) =>
      course.category === libraryCategory.value ||
      (libraryCategory.value !== "mixed" && course.tags.includes(libraryCategory.value)),
  ),
);

function presentationOf(value) {
  return createWorkoutPresentation(value);
}

/** 响应式对象不能直接被 structuredClone，统一用 JSON 深拷贝成普通对象 */
function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function showError(message) {
  errorMessage.value = message;
}

function applyWorkout(next) {
  workout.value = next;
  errorMessage.value = "";
}

function applyCourse(course) {
  workout.value = clone(course.workout);
  libraryOpen.value = false;
  errorMessage.value = "";
}

function applyImportedWorkout(imported) {
  workout.value = clone(imported);
  importVisible.value = false;
  errorMessage.value = "";
}

function backToDay() {
  router.push({ path: "/training/day", query: { date: day.value?.date } });
}

async function persist() {
  errorMessage.value = "";
  saving.value = true;
  try {
    if (editingSession.value) await persistSessionWorkout();
    else await persistDayWorkout();
    notifySuccess("课表已保存");
    backToDay();
  } catch (caught) {
    errorMessage.value = caught instanceof Error ? caught.message : "课表保存失败";
  } finally {
    saving.value = false;
  }
}

/** 追加训练：只改写这一次训练的计划内容 */
async function persistSessionWorkout() {
  session.value = await setSessionPlannedWorkout(service, session.value, clone(workout.value));
}

/** 当天课表：写回计划，并让未结束的计划训练跟随更新 */
async function persistDayWorkout() {
  const saved = await setDayWorkout(service, plan.value, props.dayId, clone(workout.value));
  plan.value = saved.plan;
  day.value = saved.day;
}

onMounted(async () => {
  plan.value = await service.getPlan(props.planId);
  if (!plan.value) {
    error.value = "计划不存在";
    return;
  }
  const targetWeek = plan.value.weeks.find((week) => week.days.some((entry) => entry.id === props.dayId));
  day.value = targetWeek?.days.find((entry) => entry.id === props.dayId);
  if (!day.value) {
    error.value = "训练日不存在";
    return;
  }
  if (props.sessionId) {
    const sessions = await service.listSessions(props.planId, props.dayId);
    session.value = sessions.find((entry) => entry.id === props.sessionId) ?? null;
    if (!session.value) {
      error.value = "没有找到这次训练";
      return;
    }
  }
  const planned = editingSession.value ? session.value.plannedWorkout : day.value.workout;
  // 无结构化课表时给出可编辑草稿（含休息日补课、追加训练补计划）
  workout.value = planned ? clone(planned) : createDefaultWorkout();
});
</script>

<style scoped>
.field { display: grid; gap: 4px; }
.field span { font-size: 12px; color: #607066; }
.field input { padding: 6px 9px; border: 1px solid var(--td-component-stroke); border-radius: 8px; font-size: 13px; }
.scope-line { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.category-row { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.category-chip { padding: 3px 12px; border-radius: 999px; border: 1px solid var(--td-component-stroke); background: #fff; font-size: 12px; cursor: pointer; }
.category-chip.active { background: #357a52; border-color: #357a52; color: #fff; font-weight: 700; }
.library-picker { margin-top: 10px; display: grid; gap: 10px; }
.lib-entry { padding: 10px 12px; border: 1px solid var(--td-component-stroke); border-radius: 10px; display: grid; gap: 6px; }
.lib-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.lib-head strong { font-size: 14px; }
.lib-entry p { margin: 0; }
.dsl-block pre { margin: 10px 0 0; padding: 10px; background: #f6f8f6; border-radius: 8px; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
.error-text { color: #d54941; margin-top: 10px; white-space: pre-wrap; }
.muted { color: #607066; font-size: 13px; }
</style>
