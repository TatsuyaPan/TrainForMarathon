<template>
  <article class="course-card" data-testid="course-card">
    <header class="card-head">
      <span class="category-chip" :style="{ background: categoryColor, borderColor: categoryColor }">{{ categoryLabel }}</span>
      <strong class="card-title">{{ presentation.title }}</strong>
      <span class="origin-chip">{{ course.origin === "builtin" ? "内置" : "自定义" }}</span>
      <span v-if="course.weeklyKmHint" class="muted">{{ course.weeklyKmHint }}</span>
    </header>

    <p class="card-goal">训练目的 · {{ course.workout.goal }}</p>
    <p v-if="course.workout.note" class="card-note muted">{{ course.workout.note }}</p>

    <p class="card-metrics">
      <span v-for="badge in badges" :key="badge" class="metric-badge">{{ badge }}</span>
      <span v-if="badges.length === 0" class="muted">暂无已知距离或时间</span>
    </p>

    <StructurePreview
      :blocks="presentation.preview.blocks"
      :mixed-units="presentation.preview.mixedUnits"
      :compressed="presentation.preview.compressed"
    />

    <div class="card-actions">
      <t-button v-if="course.origin === 'builtin'" data-testid="copy-course" size="small" theme="primary" @click="$emit('copy', course)">
        复制到我的课程
      </t-button>
      <template v-else>
        <t-button data-testid="edit-course" size="small" theme="primary" @click="$emit('edit', course)">编辑</t-button>
        <t-button data-testid="copy-course" size="small" variant="outline" @click="$emit('copy', course)">复制</t-button>
        <t-button data-testid="delete-course" size="small" theme="danger" variant="outline" @click="$emit('delete', course)">删除</t-button>
      </template>
      <t-button data-testid="toggle-structure" size="small" variant="text" @click="structureOpen = !structureOpen">
        {{ structureOpen ? "收起步骤" : "展开步骤" }}
      </t-button>
      <t-button data-testid="toggle-dsl" size="small" variant="text" @click="dslOpen = !dslOpen">
        {{ dslOpen ? "收起 DSL" : "查看 DSL" }}
      </t-button>
    </div>

    <section v-if="structureOpen" class="card-section" data-testid="course-structure">
      <div v-for="phase in presentation.phases" :key="phase.role" class="phase-block">
        <div class="phase-head">
          <span class="phase-tag">{{ phase.tag }}</span>
          <strong>{{ phase.label }}</strong>
          <span class="muted">{{ phase.summary }}</span>
        </div>
        <WorkoutStructure :nodes="phase.nodes" />
      </div>
    </section>

    <section v-if="dslOpen" class="card-section">
      <div class="dsl-block">
        <pre data-testid="course-dsl">{{ dsl }}</pre>
        <t-button size="small" variant="outline" @click="copyDsl">复制 DSL</t-button>
      </div>
      <p v-if="copyHint" class="muted">{{ copyHint }}</p>
    </section>
  </article>
</template>

<script setup>
import { computed, ref } from "vue";
import {
  INTENSITY_COLORS,
  LIBRARY_CATEGORY_LABELS,
  createWorkoutPresentation,
  serializeWorkout,
} from "@core";
import StructurePreview from "./StructurePreview.vue";
import WorkoutStructure from "./WorkoutStructure.vue";
import { usePaceDisplay } from "../composables/usePaceDisplay.js";

const props = defineProps({
  course: { type: Object, required: true },
});
defineEmits(["edit", "copy", "delete"]);

const structureOpen = ref(false);
const dslOpen = ref(false);
const copyHint = ref("");

// 展示口径（强度 ↔ 配速）是全局偏好：卡片只读，不在这里放开关
const { presentationContext } = usePaceDisplay();

const presentation = computed(() => createWorkoutPresentation(props.course.workout, presentationContext.value));
const categoryLabel = computed(() =>
  props.course.category === "mixed" ? "混合" : LIBRARY_CATEGORY_LABELS[props.course.category] ?? props.course.category);
const categoryColor = computed(() => INTENSITY_COLORS[props.course.category] ?? "#5b6b7c");
const dsl = computed(() => {
  try {
    return serializeWorkout(props.course.workout);
  } catch (error) {
    return `（无法导出 DSL：${error instanceof Error ? error.message : "内容不完整"}）`;
  }
});
const badges = computed(() => {
  const headline = presentation.value.headline;
  const list = [];
  if (headline.durationLabel) list.push(`已知时间 ${headline.durationLabel}`);
  if (headline.distanceLabel) list.push(`已知距离 ${headline.distanceLabel}`);
  if (headline.workLabel) list.push(headline.workLabel);
  if (headline.recoveryLabel) list.push(headline.recoveryLabel);
  if (headline.restLabel) list.push(headline.restLabel);
  if (headline.repeatCount > 0) list.push(`${headline.repeatCount} 个循环`);
  return list;
});

async function copyDsl() {
  copyHint.value = "";
  try {
    await navigator.clipboard.writeText(dsl.value);
    copyHint.value = "DSL 已复制";
  } catch {
    copyHint.value = "复制失败，请手动选中上面的文本";
  }
}
</script>

<style scoped>
.course-card {
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  background: #fff;
  padding: 12px 14px;
  display: grid;
  gap: 8px;
}
.card-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.card-title { font-size: 15px; }
.category-chip {
  font-size: 12px;
  color: #fff;
  border: 1px solid;
  border-radius: 999px;
  padding: 2px 10px;
}
.origin-chip {
  font-size: 12px;
  color: #607066;
  border: 1px solid var(--td-component-stroke);
  border-radius: 999px;
  padding: 1px 8px;
}
.card-goal { margin: 0; font-weight: 600; }
.card-note { margin: 0; }
.card-metrics { display: flex; gap: 6px; flex-wrap: wrap; margin: 0; }
.metric-badge {
  font-size: 12px;
  color: #35424f;
  background: #f2f4f2;
  border-radius: 6px;
  padding: 2px 8px;
}
.card-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.card-section { display: grid; gap: 10px; }
.phase-block { display: grid; gap: 6px; }
.phase-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.phase-tag {
  font-size: 12px;
  font-weight: 700;
  color: #357a52;
  background: #e8f1ea;
  border-radius: 6px;
  padding: 1px 7px;
}
.dsl-block { display: grid; gap: 8px; }
.dsl-block pre {
  margin: 0;
  padding: 10px;
  background: #f6f8f6;
  border-radius: 8px;
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
