<template>
  <div class="content-embed">
    <template v-if="embed.kind === 'courses'">
      <section
        v-for="course in courses"
        :key="course.id"
        class="embed-course"
        :data-testid="`embed-course-${course.id}`"
      >
        <div class="embed-course-head">
          <strong class="embed-title">{{ course.workout.title || course.workout.goal }}</strong>
          <a
            v-if="course.sourceContentId"
            class="embed-source"
            :href="`#/course/${encodeURIComponent(course.sourceContentId)}`"
          >{{ course.source }} →</a>
        </div>
        <WorkoutDisplay :workout="course.workout" />
        <div class="embed-actions">
          <t-button size="small" theme="primary" :data-testid="`save-course-${course.id}`" @click="saveCourse(course)">
            收藏到课程库
          </t-button>
          <span v-if="savedIds.has(course.id)" class="muted">已收藏</span>
        </div>
      </section>
    </template>

    <template v-else-if="embed.kind === 'plan'">
      <section v-if="preview" class="embed-plan" data-testid="embed-plan">
        <div class="embed-plan-head">
          <strong class="embed-title">{{ preview.name }}</strong>
          <span class="muted">{{ preview.weekCount }} 周</span>
        </div>
        <table class="plan-table">
          <thead>
            <tr>
              <th>周</th>
              <th>阶段</th>
              <th>跑量</th>
              <th>每日安排</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in preview.rows" :key="row.week">
              <td>{{ row.week }}</td>
              <td>{{ row.phase }}</td>
              <td>{{ row.volumeLabel }}</td>
              <td class="plan-days">{{ row.days.join(" · ") }}</td>
            </tr>
          </tbody>
        </table>
        <div class="embed-actions">
          <t-button size="small" theme="primary" data-testid="use-plan" @click="goSetup">去配置采用</t-button>
        </div>
      </section>
    </template>

    <template v-else-if="embed.kind === 'pace-table'">
      <section class="embed-paces" data-testid="embed-pace-table">
        <template v-if="paceRows">
          <div class="embed-plan-head">
            <strong class="embed-title">我的训练配速表</strong>
            <span class="muted">{{ modeLabel }} · 基于当前能力自动计算</span>
          </div>
          <div class="pace-rows">
            <div v-for="row in paceRows" :key="row.zone" class="pace-row">
              <span class="zone-chip" :style="{ background: colorOf(row.zone) }">{{ row.zone }}</span>
              <span><strong>{{ row.name }}</strong> · {{ row.value }}</span>
              <span v-if="row.note" class="muted">{{ row.note }}</span>
            </div>
          </div>
        </template>
        <template v-else>
          <p class="muted">尚未建立能力基准，这里展示的是你的实时配速表。</p>
          <div class="embed-actions">
            <t-button size="small" theme="primary" data-testid="go-fitness" @click="goFitness">去建立能力</t-button>
          </div>
        </template>
      </section>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import {
  INTENSITY_COLORS,
  athleteFitness,
  cloneLibraryCourse,
  describePlanTemplate,
  fitnessModeLabel,
  fitnessPaceRows,
  getLibraryCourse,
  getPlanTemplate,
} from "@core";
import WorkoutDisplay from "./WorkoutDisplay.vue";
import { getAthlete } from "../app-context.js";
import { upsertCustomCourse } from "../stores/course-library.js";
import { notifySuccess } from "../ui-feedback.js";

const props = defineProps({
  embed: { type: Object, required: true },
});

const savedIds = ref(new Set());

const courses = computed(() =>
  (props.embed.courseIds ?? [])
    .map((id) => getLibraryCourse(id))
    .filter((course) => course !== undefined),
);

const preview = computed(() => {
  if (props.embed.kind !== "plan" || !props.embed.planId) return null;
  try {
    return describePlanTemplate(getPlanTemplate(props.embed.planId));
  } catch {
    return null;
  }
});

const athlete = ref(null);
onMounted(async () => {
  athlete.value = await getAthlete();
});
const fitness = computed(() => athleteFitness(athlete.value));
const modeLabel = computed(() => fitnessModeLabel(fitness.value));
const paceRows = computed(() => (fitness.value?.mode ? fitnessPaceRows(fitness.value) : null));

function colorOf(zone) {
  return INTENSITY_COLORS[zone] ?? "#9aa2ab";
}

function saveCourse(course) {
  upsertCustomCourse(cloneLibraryCourse(course));
  savedIds.value = new Set([...savedIds.value, course.id]);
  notifySuccess(`已收藏《${course.workout.title ?? course.workout.goal}》到课程库`);
}

function goSetup() {
  window.location.hash = "/settings";
}

function goFitness() {
  window.location.hash = "/fitness";
}
</script>

<style scoped>
.content-embed { display: grid; gap: 14px; margin: 12px 0; }
.embed-course,
.embed-plan,
.embed-paces {
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  padding: 12px 14px;
  background: #fcfdfc;
  display: grid;
  gap: 10px;
}
.embed-course-head,
.embed-plan-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.embed-title { font-size: 15px; }
.embed-source { font-size: 13px; color: #357a52; text-decoration: none; }
.embed-source:hover { text-decoration: underline; }
.embed-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.plan-table { border-collapse: collapse; width: 100%; font-size: 13px; }
.plan-table th, .plan-table td { border: 1px solid var(--td-component-stroke); padding: 6px 8px; text-align: left; }
.plan-table th { background: var(--td-brand-color-light); }
.plan-days { font-size: 12px; line-height: 1.6; }
.pace-rows { display: grid; gap: 6px; }
.pace-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.zone-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  padding: 2px 6px;
  border-radius: 6px;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
}
</style>
