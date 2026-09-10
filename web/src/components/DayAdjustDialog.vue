<template>
  <t-card v-if="visible" :bordered="true" class="adjust-card" data-testid="day-adjust">
    <div class="adjust-head">
      <div>
        <span class="kicker">ADJUST</span>
        <h2>调整课表</h2>
      </div>
      <button class="close-adjust" aria-label="关闭调整课表" @click="$emit('close')">×</button>
    </div>

    <p class="muted">
      {{ day.date }} · {{ day.label }} · 第 {{ week.week }} 周
      <br />
      调整只改计划内容与当天的计划训练；已记录的训练不会被改写，遇到记录会拒绝调整。
    </p>

    <section class="adjust-section">
      <h3>备选训练</h3>
      <p v-if="alternatives.length === 0" class="muted" data-testid="no-alternatives">
        这一天没有声明备选方案。
      </p>
      <div v-else class="option-list">
        <button
          v-for="option in alternatives"
          :key="option.key"
          type="button"
          class="option"
          :disabled="busy"
          :data-testid="`apply-alternative-${option.index}`"
          @click="applyAlternative(option.index)"
        >
          <strong>{{ option.label }}</strong>
          <span class="muted">{{ option.detail }}</span>
        </button>
      </div>
    </section>

    <section class="adjust-section">
      <h3>与本周另一天互换</h3>
      <p class="muted">互换只搬动训练内容，日期与训练记录留在原处。</p>
      <div class="option-list">
        <button
          v-for="option in otherDays"
          :key="option.date"
          type="button"
          class="option"
          :disabled="busy"
          :data-testid="`swap-with-${option.date}`"
          @click="swap(option)"
        >
          <strong>{{ option.date }} · {{ option.label }}</strong>
          <span class="muted">{{ option.hint }}</span>
        </button>
      </div>
    </section>

    <p v-if="error" class="inline-error" role="alert" data-testid="adjust-error">{{ error }}</p>
  </t-card>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { TRAINING_TYPE_LABELS, applyDayAlternative, swapTrainingDays } from "@core";
import { service } from "../app-context.js";

const props = defineProps({
  plan: { type: Object, required: true },
  week: { type: Object, required: true },
  day: { type: Object, required: true },
  visible: { type: Boolean, default: false },
});
const emit = defineEmits(["close", "updated"]);

const busy = ref(false);
const error = ref("");

watch(
  () => props.visible,
  () => {
    error.value = "";
  },
);

const dayIndex = computed(() => props.week.days.findIndex((entry) => entry.id === props.day.id));

function describeTypes(items) {
  return (items ?? [])
    .map((item) => TRAINING_TYPE_LABELS[item.type] ?? item.type)
    .join(" + ");
}

const alternatives = computed(() =>
  (props.day.alternatives ?? []).map((items, index) => ({
    key: `alternative-${index}`,
    index,
    label: describeTypes(items) || `备选方案 ${index + 1}`,
    detail: "采用后按当前能力档位重建训练内容",
  })),
);

const otherDays = computed(() =>
  props.week.days
    .map((entry, index) => {
      if (index === dayIndex.value) return null;
      const isRest = !entry.workout && (entry.items ?? []).every((item) => item.type === "REST");
      return {
        index,
        date: entry.date,
        label: entry.label,
        hint: isRest ? "休息日 · 与今天换位置" : "训练日 · 与今天换内容",
      };
    })
    .filter(Boolean),
);

async function run(action) {
  busy.value = true;
  error.value = "";
  try {
    const updated = await action();
    emit("updated", updated);
    emit("close");
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "调整失败";
  } finally {
    busy.value = false;
  }
}

async function swap(option) {
  if (!window.confirm(`把 ${props.day.date} 的训练与 ${option.date} 互换？`)) return;
  await run(() => swapTrainingDays(service, props.plan, props.week.week, dayIndex.value, option.index));
}

async function applyAlternative(index) {
  await run(() => applyDayAlternative(service, props.plan, props.week.week, dayIndex.value, index));
}
</script>

<style scoped>
.adjust-card { margin-top: 16px; }
.adjust-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.kicker { font-size: 11px; letter-spacing: 0.16em; color: #8b968f; }
.adjust-head h2 { margin: 2px 0 0; font-size: 18px; }
.close-adjust { border: none; background: transparent; font-size: 22px; line-height: 1; cursor: pointer; color: #8b968f; }
.adjust-section { margin-top: 16px; }
.adjust-section h3 { margin: 0 0 6px; font-size: 14px; }
.option-list { display: grid; gap: 8px; margin-top: 8px; }
.option {
  display: flex;
  flex-direction: column;
  gap: 3px;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
}
.option:hover:not(:disabled) { border-color: var(--td-brand-color); }
.option:disabled { cursor: not-allowed; opacity: 0.6; }
.muted { color: #607066; font-size: 13px; }
.inline-error { color: #d54941; margin-top: 12px; }
</style>
