<template>
  <div v-if="loading" class="muted">加载中…</div>
  <template v-else>
    <div class="page-hero">
      <t-typography-title level="h4">
        {{ date }}<span v-if="day" class="muted"> · {{ day.label }}</span>
      </t-typography-title>
      <div class="btn-row">
        <t-button size="small" variant="outline" @click="$router.push('/training')">周期</t-button>
        <t-button v-if="week" size="small" variant="outline" @click="$router.push({ path: '/training/week', query: { date } })">本周</t-button>
        <t-button size="small" theme="primary" @click="addVisible = true">+ 添加训练</t-button>
      </div>
    </div>

    <div v-if="sessions.length === 0 && !addVisible" class="rest-card">
      <t-card :bordered="true">
        <t-tag theme="default" variant="light">休息日 / 无训练安排</t-tag>
        <p class="muted">可以添加一次临时训练（如跑休日的轻松跑）。</p>
      </t-card>
    </div>

    <t-card
      v-for="session in sessions"
      :key="session.id"
      :bordered="true"
      class="session-card"
      :class="session.status"
    >
      <div class="session-head">
        <t-tag :theme="statusTheme(session.status)" variant="light">
          {{ session.seq === 0 ? session.label : `${session.label}（第 ${session.seq + 1} 练）` }}
        </t-tag>
        <span v-if="session.status !== 'planned'" class="muted">
          {{ statusText(session.status) }}{{ session.finishedAt ? ` · ${session.finishedAt.slice(0, 10)}` : "" }}
        </span>
      </div>

      <span v-if="session.plannedWorkout" class="intensity-bar" :style="intensityBarStyle(session.plannedWorkout)"></span>

      <div v-if="session.plannedWorkout" class="plan-block">
        <div v-if="session.plannedWorkout.goal" class="goal-text">{{ session.plannedWorkout.goal }}</div>
        <div class="plan-items muted">{{ describeWorkoutLines(session.plannedWorkout) }}</div>
      </div>

      <div v-if="session.status === 'done'" class="actual-block">
        <div class="actual-title">实际记录</div>
        <div class="actual-grid">
          <span v-if="session.actualDistanceKm">距离 <strong>{{ session.actualDistanceKm }} km</strong></span>
          <span v-if="session.actualDurationMinutes">时长 <strong>{{ session.actualDurationMinutes }} min</strong></span>
          <span v-if="session.actualRpe">RPE <strong>{{ session.actualRpe }}</strong></span>
          <span v-if="session.actualWorkout?.goal">内容 <strong>{{ session.actualWorkout.goal }}</strong></span>
        </div>
        <div v-if="session.log" class="log-text">{{ session.log }}</div>
      </div>

      <div class="btn-row session-ops">
        <template v-if="session.status === 'planned'">
          <t-button size="small" theme="primary" @click="openComplete(session)">完成并记录</t-button>
          <t-button size="small" @click="doSkip(session)">未进行</t-button>
        </template>
        <template v-else-if="session.status === 'done'">
          <t-button size="small" @click="openComplete(session)">编辑记录</t-button>
          <t-button size="small" variant="outline" @click="doUndo(session)">撤销</t-button>
        </template>
        <template v-else>
          <t-button size="small" @click="openComplete(session)">重新记录</t-button>
        </template>
        <t-button v-if="session.seq > 0" size="small" theme="danger" variant="text" @click="doDelete(session)">删除</t-button>
      </div>
    </t-card>

    <t-card v-if="addVisible" :bordered="true" class="session-card">
      <t-form label-align="top">
        <t-form-item label="训练名称/说明">
          <t-input v-model="addForm.label" placeholder="例：补充轻松跑" :maxlength="30" />
        </t-form-item>
        <t-form-item label="计划内容 DSL（可选，留空则仅记录）">
          <t-textarea v-model="addForm.dsl" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="例：(6min@T@rpe8+1min@jg)*8" />
        </t-form-item>
      </t-form>
      <div class="btn-row">
        <t-button theme="primary" @click="doAdd">添加</t-button>
        <t-button variant="outline" @click="addVisible = false">取消</t-button>
      </div>
    </t-card>

    <!-- 完成记录对话框 -->
    <t-dialog
      v-model:visible="completeVisible"
      :header="completeSession ? `记录：${completeSession.label}` : '记录训练'"
      :confirm-btn="{ content: '保存记录', theme: 'primary' }"
      :cancel-btn="{}"
      @confirm="doComplete"
    >
      <t-form label-align="top" v-if="completeSession">
        <t-form-item label="实际内容 DSL（可选，偏离计划时填写）">
          <t-textarea v-model="completeForm.dsl" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="留空表示按计划完成" />
        </t-form-item>
        <t-form-item label="实际距离（km，可选）">
          <t-input-number v-model="completeForm.distanceKm" :min="0" :step="0.1" placeholder="可选" style="width: 140px" />
        </t-form-item>
        <t-form-item label="实际时长（min，可选）">
          <t-input-number v-model="completeForm.durationMinutes" :min="0" :step="5" placeholder="可选" style="width: 140px" />
        </t-form-item>
        <t-form-item label="自感用力度 RPE（1-10，可选）">
          <t-input-number v-model="completeForm.rpe" :min="1" :max="10" placeholder="可选" style="width: 140px" />
        </t-form-item>
        <t-form-item label="训练日志（感受/天气/状态等）">
          <t-textarea v-model="completeForm.log" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="记录今天的训练感受…" />
        </t-form-item>
      </t-form>
    </t-dialog>
  </template>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from "vue";
import {
  PROGRESS_STATUS_LABELS,
  addExtraSession,
  completeSession,
  describeWorkout,
  formatPace,
  intensityBarStyle,
  parseWorkoutDsl,
  skipSession,
} from "@core";
import { service } from "../app-context.js";
import { useTrainingData } from "../composables/useTrainingData.js";

const props = defineProps({ date: { type: String, required: true } });
const { loading, needsSetup, plan, load, loadDaySessions, refreshDaySessions } = useTrainingData();

const day = ref(null);
const week = ref(null);
const sessions = ref([]);
const addVisible = ref(false);
const addForm = reactive({ label: "", dsl: "" });
const completeVisible = ref(false);
const completeSession = ref(null);
const completeForm = reactive({ dsl: "", distanceKm: null, durationMinutes: null, rpe: null, log: "" });

async function resolveDay() {
  if (!plan.value) return;
  for (const w of plan.value.weeks) {
    const found = w.days.find((d) => d.date === props.date);
    if (found) { day.value = found; week.value = w; break; }
  }
  if (day.value) {
    sessions.value = await loadDaySessions(day.value.id);
  } else {
    sessions.value = [];
  }
}

function describeWorkoutLines(workout) {
  try {
    const lines = describeWorkout(workout, plan.value.paces, { includeGoal: false });
    return lines.join("；");
  } catch {
    return "（内容）";
  }
}

function statusTheme(status) {
  return status === "done" ? "success" : status === "skipped" ? "default" : "primary";
}

function statusText(status) {
  return status === "done" ? "已完成" : status === "skipped" ? "未进行" : "计划中";
}

function openComplete(session) {
  completeSession.value = session;
  completeForm.dsl = session.actualWorkout ? serializeSafe(session.actualWorkout) : "";
  completeForm.distanceKm = session.actualDistanceKm ?? null;
  completeForm.durationMinutes = session.actualDurationMinutes ?? null;
  completeForm.rpe = session.actualRpe ?? null;
  completeForm.log = session.log ?? "";
  completeVisible.value = true;
}

function serializeSafe(workout) {
  try {
    return JSON.stringify(workout);
  } catch {
    return "";
  }
}

async function doComplete() {
  if (!completeSession.value) return;
  const input = { log: completeForm.log?.trim() || undefined };
  if (completeForm.distanceKm != null && completeForm.distanceKm > 0) input.actualDistanceKm = Number(completeForm.distanceKm);
  if (completeForm.durationMinutes != null && completeForm.durationMinutes > 0) input.actualDurationMinutes = Number(completeForm.durationMinutes);
  if (completeForm.rpe != null) input.actualRpe = Number(completeForm.rpe);
  if (completeForm.dsl.trim()) {
    try {
      const workout = parseWorkoutDsl(completeForm.dsl.trim());
      input.actualWorkout = workout;
    } catch (e) {
      window.alert(`DSL 解析失败：${e.message}`);
      return;
    }
  }
  await completeSession(service, completeSession.value, input);
  completeVisible.value = false;
  sessions.value = await refreshDaySessions(day.value.id);
}

async function doSkip(session) {
  await skipSession(service, session);
  sessions.value = await refreshDaySessions(day.value.id);
}

async function doUndo(session) {
  // 撤销：回到计划中（清空实际记录）
  const timestamp = new Date().toISOString();
  await service.saveSession({
    ...session,
    status: "planned",
    actualWorkout: undefined,
    actualDistanceKm: undefined,
    actualDurationMinutes: undefined,
    actualRpe: undefined,
    log: undefined,
    finishedAt: undefined,
    updatedAt: timestamp,
  });
  sessions.value = await refreshDaySessions(day.value.id);
}

async function doDelete(session) {
  if (!window.confirm("删除该训练？")) return;
  await service.deleteSession(session.id);
  sessions.value = await refreshDaySessions(day.value.id);
}

async function doAdd() {
  const label = addForm.label.trim();
  if (!label) { window.alert("请填写训练名称"); return; }
  let plannedWorkout;
  if (addForm.dsl.trim()) {
    try {
      plannedWorkout = parseWorkoutDsl(addForm.dsl.trim());
    } catch (e) {
      window.alert(`DSL 解析失败：${e.message}`);
      return;
    }
  }
  await addExtraSession(service, plan.value.id, day.value.id, { label, plannedWorkout });
  addForm.label = "";
  addForm.dsl = "";
  addVisible.value = false;
  sessions.value = await refreshDaySessions(day.value.id);
}

onMounted(async () => {
  await load();
  await resolveDay();
});

watch(() => props.date, async () => {
  if (!plan.value) await load();
  await resolveDay();
});
</script>

<style scoped>
.session-card { margin-bottom: 12px; }
.session-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.goal-text { font-size: 16px; font-weight: 700; color: var(--td-brand-color); margin: 6px 0 2px; }
.plan-items { font-size: 13px; line-height: 1.7; }
.actual-block { margin-top: 10px; padding: 10px 12px; background: var(--td-brand-color-light); border-radius: 8px; }
.actual-title { font-size: 12px; font-weight: 700; color: var(--td-brand-color); }
.actual-grid { display: flex; flex-wrap: wrap; gap: 12px; font-size: 13px; margin-top: 4px; }
.log-text { margin-top: 6px; font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
.session-ops { margin-top: 10px; }
.rest-card { margin-bottom: 12px; }
</style>
