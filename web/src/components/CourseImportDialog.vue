<template>
  <div v-if="visible" class="import-overlay" data-testid="import-dialog" @click.self="close">
    <div class="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <header class="import-head">
        <h3 id="import-title">导入单条课程</h3>
        <button type="button" class="close" aria-label="关闭导入" @click="close">✕</button>
      </header>

      <p class="muted">粘贴完整 Workout DSL。一次只接受一份课程；缺少版本声明时使用当前最新版解析器。</p>
      <p class="muted">
        档位写法与配速写法都接受：<code>MS:6x(8min@T+90s@jog)</code> 与
        <code>MS:6x(8min@P3:45-4:00/km+90s@jog)</code>。
        明确配速原样导入，不会被换算成 E/M/T/I/R 档位。
      </p>

      <textarea
        ref="inputRef"
        v-model="text"
        data-testid="import-textarea"
        class="import-textarea"
        rows="8"
        spellcheck="false"
        placeholder="GOAL:乳酸阈能力&#10;WU:15min@E&#10;MS:6x(8min@T+90s@jog)&#10;CD:10min@E"
        @input="onInput"
      />

      <p v-if="error" class="import-error" data-testid="import-error" role="alert">{{ error }}</p>

      <div v-if="parsed && !error" class="import-summary" data-testid="import-summary">
        <strong>{{ summaryTitle }}</strong>
        <span class="muted">{{ summaryLine }}</span>
        <p v-if="parsed.note" class="muted">备注：{{ parsed.note }}</p>
        <p v-if="paceNote" class="muted" data-testid="import-pace-note">{{ paceNote }}</p>
      </div>

      <footer class="import-actions">
        <t-button variant="outline" @click="close">取消</t-button>
        <t-button
          data-testid="import-confirm"
          theme="primary"
          :disabled="text.trim() === ''"
          @click="confirm"
        >
          解析并编辑
        </t-button>
      </footer>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import {
  createWorkoutPresentation,
  parseWorkoutDsl,
  workoutHasExplicitPace,
  workoutHasIntensity,
} from "@core";

const props = defineProps({
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "submit"]);

const text = ref("");
const error = ref("");
const parsed = ref(null);
const inputRef = ref(null);

const presentation = computed(() => (parsed.value ? createWorkoutPresentation(parsed.value) : null));
const summaryTitle = computed(() => presentation.value?.title ?? "");
const summaryLine = computed(() => {
  const view = presentation.value;
  if (!view) return "";
  const parts = [`${view.phases.length} 个阶段`, `${view.headline.stepCount} 个步骤`];
  if (view.headline.repeatCount > 0) parts.push(`${view.headline.repeatCount} 个循环`);
  if (view.headline.durationLabel) parts.push(`已知时间 ${view.headline.durationLabel}`);
  if (view.headline.distanceLabel) parts.push(`已知距离 ${view.headline.distanceLabel}`);
  return parts.join(" · ");
});

/**
 * 写法说明：明确配速原样导入，不会被反推成档位。
 * 含档位的课表可以另外导出配速写法（见课程卡片的写法开关）。
 */
const paceNote = computed(() => {
  const workout = parsed.value;
  if (!workout) return "";
  const hasPace = workoutHasExplicitPace(workout);
  const hasZone = workoutHasIntensity(workout);
  if (hasPace && hasZone) return "同时含档位与明确配速：档位可以导出成配速写法，明确配速始终保持原样。";
  if (hasPace) return "配速写法：明确配速原样导入，不会被换算成档位。";
  return "";
});

watch(
  () => props.visible,
  (open) => {
    if (!open) return;
    text.value = "";
    error.value = "";
    parsed.value = null;
    requestAnimationFrame?.(() => inputRef.value?.focus?.());
  },
);

function onInput() {
  error.value = "";
  parsed.value = tryParse();
}

function close() {
  emit("close");
}

function tryParse() {
  const source = text.value.trim();
  if (source === "") return null;
  try {
    return parseWorkoutDsl(source);
  } catch {
    return null;
  }
}

function confirm() {
  error.value = "";
  const source = text.value.trim();
  if (source === "") {
    error.value = "请先粘贴课程 DSL";
    return;
  }
  try {
    parsed.value = parseWorkoutDsl(source);
  } catch (caught) {
    parsed.value = null;
    error.value = caught instanceof Error ? caught.message : "解析失败";
    return;
  }
  emit("submit", parsed.value);
}
</script>

<style scoped>
.import-overlay {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(23, 33, 27, 0.42);
}
.import-dialog {
  width: min(640px, 100%);
  max-height: 88vh;
  overflow: auto;
  display: grid;
  gap: 10px;
  padding: 18px;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 24px 60px rgba(24, 63, 43, 0.28);
}
.import-head { display: flex; align-items: center; justify-content: space-between; }
.import-head h3 { margin: 0; font-size: 17px; }
.import-dialog code {
  padding: 1px 5px;
  border-radius: 5px;
  background: #f2f4f2;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
.import-head .close {
  width: 28px;
  height: 28px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.import-textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 1.5;
  resize: vertical;
}
.import-error { margin: 0; padding: 10px 12px; color: #8e2d26; background: #fff1ef; border: 1px solid #efc3be; border-radius: 10px; font-size: 13px; }
.import-summary { display: grid; gap: 2px; padding: 10px 12px; background: #f2f7f3; border: 1px solid #d8e5db; border-radius: 10px; }
.import-summary p { margin: 0; }
.import-actions { display: flex; justify-content: flex-end; gap: 10px; }
.muted { color: #607066; font-size: 13px; margin: 0; }
</style>
