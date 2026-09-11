<template>
  <article class="course-card" data-testid="course-card">
    <header class="card-head">
      <span class="category-chip" :style="{ background: categoryColor, borderColor: categoryColor }">{{ categoryLabel }}</span>
      <strong class="card-title">{{ presentation.title }}</strong>
      <span class="origin-chip">{{ course.origin === "builtin" ? "内置" : "自定义" }}</span>
      <a
        v-if="course.sourceContentId"
        class="source-link"
        :href="`#/course/${encodeURIComponent(course.sourceContentId)}`"
        data-testid="course-source-link"
      >{{ course.source }} →</a>
      <span v-if="course.weeklyKmHint" class="muted">{{ course.weeklyKmHint }}</span>
    </header>

    <p class="card-goal">训练目的 · {{ course.workout.goal }}</p>
    <p v-if="course.workout.note" class="card-note muted">{{ course.workout.note }}</p>

    <p class="card-metrics">
      <span v-for="badge in badges" :key="badge" class="metric-badge">{{ badge }}</span>
      <span v-if="badges.length === 0" class="muted">暂无已知距离或时间</span>
    </p>

    <WorkoutDisplay :workout="course.workout">
      <template #after>
        <div class="card-actions">
          <t-button v-if="course.origin === 'builtin'" data-testid="copy-course" size="small" theme="primary" @click="$emit('copy', course)">
            复制到我的课程
          </t-button>
          <template v-else>
            <t-button data-testid="edit-course" size="small" theme="primary" @click="$emit('edit', course)">编辑</t-button>
            <t-button data-testid="copy-course" size="small" variant="outline" @click="$emit('copy', course)">复制</t-button>
            <t-button data-testid="delete-course" size="small" theme="danger" variant="outline" @click="$emit('delete', course)">删除</t-button>
          </template>
          <t-button data-testid="toggle-dsl" size="small" variant="text" @click="dslOpen = !dslOpen">
            {{ dslOpen ? "收起 DSL" : "查看 DSL" }}
          </t-button>
        </div>

        <section v-if="dslOpen" class="card-section">
          <div class="dsl-flavors">
            <template v-if="hasIntensity">
              <span class="muted">写法</span>
              <div class="flavor-group" role="group" aria-label="DSL 写法">
                <button
                  v-for="option in FLAVORS"
                  :key="option.value"
                  type="button"
                  class="flavor-option"
                  :class="{ active: flavor === option.value }"
                  :aria-pressed="flavor === option.value"
                  :data-testid="`dsl-flavor-${option.value}`"
                  @click="setFlavor(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
              <span class="muted flavor-hint">{{ flavorHint }}</span>
            </template>
            <span v-else class="muted flavor-hint" data-testid="dsl-single-flavor">{{ singleFlavorHint }}</span>
          </div>
          <div class="dsl-block">
            <pre data-testid="course-dsl">{{ dsl }}</pre>
            <t-button size="small" variant="outline" data-testid="copy-dsl" @click="copyDsl">复制 DSL</t-button>
          </div>
          <p v-if="copyHint" class="muted">{{ copyHint }}</p>
        </section>
      </template>
    </WorkoutDisplay>
  </article>
</template>

<script setup>
import { computed, ref } from "vue";
import {
  INTENSITY_COLORS,
  LIBRARY_CATEGORY_LABELS,
  createWorkoutPresentation,
  serializeWorkout,
  workoutZones,
} from "@core";
import WorkoutDisplay from "./WorkoutDisplay.vue";
import { usePaceDisplay } from "../composables/usePaceDisplay.js";

const props = defineProps({
  course: { type: Object, required: true },
});
defineEmits(["edit", "copy", "delete"]);

const dslOpen = ref(false);
const copyHint = ref("");

// 展示口径（强度 ↔ 配速）是全局偏好：卡片只读，不在这里放开关
const { mode, paces, hasPaces, presentationContext } = usePaceDisplay();

/** DSL 的两种写法：强度版（档位写法，规范口径）与配速版（按当前能力派生出的明确配速） */
const FLAVORS = [
  { value: "zone", label: "强度版" },
  { value: "pace", label: "配速版" },
];
// 默认跟随全局展示口径：看到什么口径，就复制什么写法
const flavor = ref(mode.value === "pace" ? "pace" : "zone");

/**
 * 只有含强度档位的课表才有两种写法：档位能换算成配速，反过来不行。
 * 一份只有明确配速（`@P4:45-5:00/km`）、心率或 RPE 的课表不会被反推成 E/M/T/I/R。
 */
const hasIntensity = computed(() => workoutZones(props.course.workout).length > 0);
const singleFlavorHint = "这份课表不含强度档位（E/M/T/I/R），只有一种写法：明确目标不会被换算成档位";

const presentation = computed(() => createWorkoutPresentation(props.course.workout, presentationContext.value));
const categoryLabel = computed(() =>
  props.course.category === "mixed" ? "混合" : LIBRARY_CATEGORY_LABELS[props.course.category] ?? props.course.category);
const categoryColor = computed(() => INTENSITY_COLORS[props.course.category] ?? "#5b6b7c");
/** 实际是否按配速写法导出：没有档位或没有能力时都退回档位写法 */
const paceFlavor = computed(() => hasIntensity.value && flavor.value === "pace" && hasPaces.value);
const dsl = computed(() => {
  try {
    return serializeWorkout(
      props.course.workout,
      paceFlavor.value ? { targetMode: "pace", paces: paces.value } : {},
    );
  } catch (error) {
    return `（无法导出 DSL：${error instanceof Error ? error.message : "内容不完整"}）`;
  }
});
const flavorHint = computed(() => {
  if (flavor.value === "zone") return "档位写法：与个人能力无关，长期交换用这份";
  return paceFlavor.value
    ? "按当前能力把档位换算成明确配速（E、M 为估算）；导入后是明确配速"
    : "尚未建立能力，暂按档位写法导出";
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
    copyHint.value = `${paceFlavor.value ? "配速版" : "强度版"} DSL 已复制`;
  } catch {
    copyHint.value = "复制失败，请手动选中上面的文本";
  }
}

function setFlavor(next) {
  flavor.value = next;
  copyHint.value = "";
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
.source-link { font-size: 12px; color: #357a52; text-decoration: none; }
.source-link:hover { text-decoration: underline; }
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
.dsl-block { display: grid; gap: 8px; }
.dsl-flavors { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.flavor-group {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 999px;
  background: #f2f4f2;
}
.flavor-option {
  padding: 2px 12px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #35424f;
  font-size: 12px;
  cursor: pointer;
}
.flavor-option.active {
  background: #fff;
  color: #357a52;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(24, 63, 43, 0.16);
}
.flavor-option:focus-visible { outline: 2px solid #357a52; outline-offset: 2px; }
.flavor-hint { font-size: 12px; }
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
