<template>
  <div v-if="loading" class="record-loading muted">正在打开训练记录…</div>
  <div v-else-if="error && !session" class="record-error">
    <t-card :bordered="true">
      <div class="error-kicker">无法打开记录</div>
      <p>{{ error }}</p>
      <t-button variant="outline" @click="backToDay">返回训练日</t-button>
    </t-card>
  </div>
  <template v-else-if="session">
    <header class="record-hero">
      <div>
        <div class="record-kicker">{{ date }} · 第 {{ session.seq + 1 }} 练</div>
        <h1>{{ session.status === "done" ? "编辑训练记录" : "完成这次训练" }}</h1>
        <p>{{ session.label }}</p>
      </div>
      <div class="record-stamp" :class="session.status">{{ statusText }}</div>
    </header>

    <section v-if="session.plannedWorkout" class="planned-sheet">
      <div class="sheet-label">原计划</div>
      <strong>{{ session.plannedWorkout.goal || session.label }}</strong>
      <span v-if="plannedTotals.durationLabel || plannedTotals.distanceLabel" class="muted">
        {{ plannedTotals.durationLabel ?? "" }}
        {{ plannedTotals.durationLabel && plannedTotals.distanceLabel ? " · " : "" }}
        {{ plannedTotals.distanceLabel ?? "" }}
      </span>
    </section>

    <section class="record-section">
      <div class="section-heading">
        <div>
          <span class="section-index">01</span>
          <h2>实际训练内容</h2>
        </div>
        <span class="muted">一份训练对应一份记录</span>
      </div>

      <div v-if="session.plannedWorkout" class="mode-grid">
        <button class="mode-card" :class="{ active: !form.adjustActualWorkout }" @click="usePlannedWorkout">
          <span class="mode-mark">✓</span>
          <strong>按计划完成</strong>
          <small>保留原计划作为实际训练内容</small>
        </button>
        <button data-testid="adjust-workout" class="mode-card" :class="{ active: form.adjustActualWorkout }" @click="adjustWorkout">
          <span class="mode-mark">↗</span>
          <strong>调整实际内容</strong>
          <small>记录临时增减或强度变化</small>
        </button>
      </div>
      <div v-else class="mode-grid single">
        <button data-testid="adjust-workout" class="mode-card" :class="{ active: form.adjustActualWorkout }" @click="adjustWorkout">
          <span class="mode-mark">＋</span>
          <strong>添加实际训练步骤</strong>
          <small>临时训练也可以只填写数据和日志</small>
        </button>
      </div>

      <WorkoutEditor
        v-if="form.adjustActualWorkout && form.actualWorkout"
        :workout="form.actualWorkout"
        class="actual-editor"
        @update:workout="form.actualWorkout = $event"
      />
    </section>

    <section class="record-section">
      <div class="section-heading">
        <div>
          <span class="section-index">02</span>
          <h2>完成数据</h2>
        </div>
        <span class="muted">可选，但越完整越有价值</span>
      </div>
      <t-form label-align="top">
        <div class="metrics-grid">
          <t-form-item label="实际距离">
            <t-input-number v-model="form.distanceKm" :min="0.1" :step="0.1" suffix="km" placeholder="0.0" />
          </t-form-item>
          <t-form-item label="实际时长">
            <t-input-number v-model="form.durationMinutes" :min="1" :step="1" suffix="min" placeholder="0" />
          </t-form-item>
          <t-form-item label="自感用力度">
            <t-input-number data-testid="rpe-input" v-model="form.rpe" :min="1" :max="10" :step="1" suffix="RPE" placeholder="1–10" />
          </t-form-item>
        </div>
        <t-form-item label="训练日志">
          <t-textarea
            v-model="form.log"
            :autosize="{ minRows: 4, maxRows: 8 }"
            :maxlength="1000"
            placeholder="身体感受、天气、补给、疼痛或值得记住的瞬间…"
          />
        </t-form-item>
      </t-form>
    </section>

    <div v-if="error" class="inline-error" role="alert">{{ error }}</div>

    <footer class="record-actions">
      <t-button variant="outline" size="large" @click="backToDay">取消</t-button>
      <t-button data-testid="save-record" theme="primary" size="large" :loading="saving" @click="saveRecord">
        保存并结束训练
      </t-button>
    </footer>
  </template>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { completeSession, createDefaultWorkout, createWorkoutPresentation } from "@core";
import { service } from "../app-context.js";
import { createSessionRecordForm, resetActualWorkoutToPlan, toCompleteSessionInput } from "../session-record-form.js";
import WorkoutEditor from "../components/WorkoutEditor.vue";

const props = defineProps({
  planId: { type: String, required: true },
  sessionId: { type: String, required: true },
  date: { type: String, required: true },
});

const router = useRouter();
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const session = ref(null);
const form = reactive({
  plannedWorkout: undefined,
  actualWorkout: undefined,
  adjustActualWorkout: false,
  distanceKm: null,
  durationMinutes: null,
  rpe: null,
  log: "",
});

const statusText = computed(() => session.value?.status === "done" ? "已记录" : session.value?.status === "skipped" ? "未进行" : "待完成");
const plannedTotals = computed(() =>
  session.value?.plannedWorkout
    ? createWorkoutPresentation(session.value.plannedWorkout).headline
    : { distanceLabel: undefined, durationLabel: undefined },
);

function usePlannedWorkout() {
  resetActualWorkoutToPlan(form);
}

function adjustWorkout() {
  if (!form.actualWorkout) {
    form.actualWorkout = { ...createDefaultWorkout(), goal: session.value?.label || "临时训练" };
  }
  form.adjustActualWorkout = true;
}

function backToDay() {
  router.push({ path: "/training/day", query: { date: props.date } });
}

async function saveRecord() {
  error.value = "";
  saving.value = true;
  try {
    const input = toCompleteSessionInput(form);
    session.value = await completeSession(service, session.value, input);
    backToDay();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "训练记录保存失败";
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  try {
    const sessions = await service.listSessions(props.planId);
    session.value = sessions.find((entry) => entry.id === props.sessionId) ?? null;
    if (!session.value) {
      error.value = "训练不存在或已被删除。";
      return;
    }
    Object.assign(form, createSessionRecordForm(session.value));
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : "训练记录加载失败";
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.record-loading { padding: 48px 0; text-align: center; }
.record-hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: flex-start;
  padding: 28px;
  border-radius: 20px;
  color: #f6f1e5;
  background:
    radial-gradient(circle at 85% 15%, rgba(232, 185, 73, 0.25), transparent 28%),
    linear-gradient(135deg, #183f2b, #245b3e);
  box-shadow: 0 18px 46px rgba(24, 63, 43, 0.18);
}
.record-kicker,
.sheet-label,
.section-index,
.error-kicker { font-size: 12px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
.record-hero h1 { margin: 8px 0 4px; font-size: clamp(28px, 5vw, 44px); line-height: 1; }
.record-hero p { margin: 0; color: rgba(246, 241, 229, 0.72); }
.record-stamp { padding: 9px 13px; border: 1px solid rgba(255, 255, 255, 0.35); border-radius: 999px; white-space: nowrap; font-size: 13px; }
.record-stamp.done { background: #e8b949; color: #173322; border-color: #e8b949; }
.planned-sheet { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px 16px; margin: 14px 0; padding: 14px 18px; border-left: 4px solid #e8b949; background: #fffaf0; }
.sheet-label { width: 100%; color: #8b6a1f; }
.record-section { margin-top: 16px; padding: 22px; border: 1px solid #dbe2dc; border-radius: 16px; background: rgba(255, 255, 255, 0.92); }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.section-heading > div { display: flex; gap: 10px; align-items: baseline; }
.section-heading h2 { margin: 0; font-size: 20px; }
.section-index { color: #a67b1f; }
.mode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.mode-grid.single { grid-template-columns: minmax(0, 1fr); }
.mode-card { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; align-items: center; padding: 14px; text-align: left; color: #26352c; border: 1px solid #d6ddd7; border-radius: 12px; background: #fafbf9; cursor: pointer; }
.mode-card:hover { border-color: #7aa187; transform: translateY(-1px); }
.mode-card.active { border-color: #357a52; background: #edf5ef; box-shadow: inset 0 0 0 1px #357a52; }
.mode-card small { grid-column: 2; color: #607066; }
.mode-mark { grid-row: 1 / 3; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: #e6ece7; }
.mode-card.active .mode-mark { color: white; background: #357a52; }
.actual-editor { margin-top: 16px; }
.metrics-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.inline-error { margin-top: 12px; padding: 12px 14px; color: #8e2d26; border: 1px solid #efc3be; border-radius: 10px; background: #fff1ef; }
.record-actions { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; padding: 14px 0; background: linear-gradient(transparent, #f7f7f5 24%); }
.record-error { max-width: 560px; margin: 48px auto; }
.error-kicker { color: #a23b32; }
@media (max-width: 640px) {
  .record-hero { padding: 22px 18px; border-radius: 14px; }
  .record-stamp { display: none; }
  .record-section { padding: 16px; }
  .section-heading { align-items: flex-start; flex-direction: column; gap: 4px; }
  .mode-grid,
  .metrics-grid { grid-template-columns: 1fr; }
  .record-actions > * { flex: 1; }
}
</style>
