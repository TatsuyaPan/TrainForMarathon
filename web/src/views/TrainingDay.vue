<template>
  <div v-if="loading" class="day-loading muted">正在整理当天训练…</div>
  <template v-else-if="day">
    <header class="day-hero">
      <div>
        <div class="day-kicker">{{ date }} · WEEK {{ week?.week }}</div>
        <h1>{{ day.label }}</h1>
        <p>当天共有 {{ sessions.length }} 次训练</p>
      </div>
      <div class="hero-actions">
        <t-button size="small" variant="outline" @click="$router.push('/training')">训练周期</t-button>
        <t-button v-if="week" size="small" variant="outline" @click="$router.push({ path: '/training/week', query: { date } })">本周</t-button>
        <t-button data-testid="edit-day-workout" size="small" variant="outline" @click="editDayWorkout">编辑课表</t-button>
        <t-button data-testid="show-add-session" size="small" theme="primary" @click="addVisible = true">+ 添加训练</t-button>
      </div>
    </header>

    <div v-if="sessions.length === 0" class="empty-day">
      <span class="empty-orbit">0</span>
      <div>
        <strong>休息日 / 无训练安排</strong>
        <p>今天可以完整休息，也可以添加一次临时训练。</p>
      </div>
    </div>

    <div v-else class="session-list">
      <t-card
        v-for="session in sessions"
        :key="session.id"
        :data-session-id="session.id"
        :bordered="true"
        class="session-card"
        :class="session.status"
      >
        <div class="session-seq">{{ String(session.seq + 1).padStart(2, "0") }}</div>
        <div class="session-content">
          <div class="session-head">
            <div>
              <div class="session-meta">{{ session.seq === 0 ? "计划训练" : "追加训练" }}</div>
              <h2>{{ session.label }}</h2>
            </div>
            <t-tag :theme="statusTheme(session.status)" variant="light">{{ statusText(session.status) }}</t-tag>
          </div>

          <span v-if="session.plannedWorkout" class="intensity-bar" :style="intensityBarStyle(session.plannedWorkout)"></span>
          <div v-if="session.plannedWorkout" class="plan-block">
            <strong>{{ session.plannedWorkout.goal || "训练计划" }}</strong>
            <p>{{ describeWorkoutLines(session.plannedWorkout) }}</p>
          </div>
          <div v-else class="plan-block unstructured">
            <strong>临时训练</strong>
            <p>尚未设置结构化计划，可在完成时记录实际内容。</p>
          </div>

          <div v-if="session.status === 'done'" class="record-strip">
            <span class="record-label">实际记录</span>
            <span v-if="session.actualDistanceKm != null"><b>{{ session.actualDistanceKm }}</b> km</span>
            <span v-if="session.actualDurationMinutes != null"><b>{{ session.actualDurationMinutes }}</b> min</span>
            <span v-if="session.actualRpe != null"><b>RPE {{ session.actualRpe }}</b></span>
            <span v-if="session.actualWorkout?.goal">{{ session.actualWorkout.goal }}</span>
            <p v-if="session.log">{{ session.log }}</p>
          </div>
          <div v-else-if="session.status === 'skipped'" class="record-strip skipped-note">
            这次训练未进行，没有训练记录。
          </div>

          <div class="session-actions">
            <template v-if="session.status === 'planned'">
              <t-button
                v-if="session.seq > 0"
                :data-plan-session="session.id"
                size="small"
                variant="outline"
                @click="editSessionWorkout(session)"
              >设置计划内容</t-button>
              <t-button
                :data-record-session="session.id"
                size="small"
                theme="primary"
                @click="$router.push(recordRoute(session))"
              >记录并完成</t-button>
              <t-button
                :data-skip-session="session.id"
                size="small"
                variant="outline"
                @click="skip(session)"
              >未进行</t-button>
            </template>
            <t-button
              v-else
              :data-record-session="session.id"
              size="small"
              :theme="session.status === 'skipped' ? 'primary' : 'default'"
              @click="$router.push(recordRoute(session))"
            >{{ session.status === "done" ? "查看或编辑记录" : "改为已完成" }}</t-button>
            <t-button
              v-if="session.seq > 0"
              :data-remove-session="session.id"
              size="small"
              theme="danger"
              variant="text"
              @click="remove(session)"
            >移除</t-button>
          </div>
        </div>
      </t-card>
    </div>

    <p v-if="actionError" class="inline-error" role="alert">{{ actionError }}</p>

    <t-card v-if="addVisible" :bordered="true" class="add-session-card">
      <div class="add-heading">
        <div>
          <span>NEW SESSION</span>
          <h2>添加当天训练</h2>
        </div>
        <button class="close-add" aria-label="关闭" @click="closeAdd">×</button>
      </div>
      <t-form label-align="top">
        <t-form-item label="训练名称">
          <t-input
            data-testid="extra-session-label"
            v-model="addForm.label"
            placeholder="例：晚间恢复跑"
            :maxlength="30"
          />
        </t-form-item>
      </t-form>
      <div v-if="addError" class="inline-error" role="alert">{{ addError }}</div>
      <div class="session-actions">
        <t-button data-testid="add-session" theme="primary" :loading="adding" @click="addSession">创建训练</t-button>
        <t-button variant="outline" @click="closeAdd">取消</t-button>
      </div>
    </t-card>
  </template>
  <div v-else class="empty-day">
    <div>
      <strong>没有找到 {{ date }} 的训练日</strong>
      <p>请从训练周期中重新选择日期。</p>
      <t-button variant="outline" @click="$router.push('/training')">返回训练周期</t-button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { addExtraSession, describeWorkout, intensityBarStyle, removeSession, skipSession } from "@core";
import { service } from "../app-context.js";
import { useTrainingData } from "../composables/useTrainingData.js";

const props = defineProps({ date: { type: String, required: true } });
const router = useRouter();
const { loading, plan, load, loadDaySessions, refreshDaySessions } = useTrainingData();

const day = ref(null);
const week = ref(null);
const sessions = ref([]);
const addVisible = ref(false);
const adding = ref(false);
const addError = ref("");
const actionError = ref("");
const addForm = reactive({ label: "" });

async function resolveDay() {
  day.value = null;
  week.value = null;
  sessions.value = [];
  if (!plan.value) return;
  for (const candidateWeek of plan.value.weeks) {
    const candidateDay = candidateWeek.days.find((entry) => entry.date === props.date);
    if (candidateDay) {
      day.value = candidateDay;
      week.value = candidateWeek;
      break;
    }
  }
  if (day.value) sessions.value = sortSessions(await loadDaySessions(day.value.id));
}

function sortSessions(entries) {
  return [...entries].sort((left, right) => left.seq - right.seq);
}

function recordRoute(session) {
  return {
    path: "/training/session",
    query: { plan: plan.value.id, session: session.id, date: props.date },
  };
}

/** 编辑当天课表（写入计划本身；未结束的计划训练会跟随更新） */
function editDayWorkout() {
  router.push({ path: "/edit", query: { plan: plan.value.id, day: day.value.id } });
}

/** 为追加训练补充结构化计划内容（只写这一次训练） */
function editSessionWorkout(session) {
  router.push({
    path: "/edit",
    query: { plan: plan.value.id, day: day.value.id, session: session.id },
  });
}

function describeWorkoutLines(workout) {
  try {
    return describeWorkout(workout, plan.value.paces, { includeGoal: false }).join("；");
  } catch {
    return "结构化训练内容";
  }
}

function statusTheme(status) {
  return status === "done" ? "success" : status === "skipped" ? "default" : "primary";
}

function statusText(status) {
  return status === "done" ? "已完成" : status === "skipped" ? "未进行" : "待完成";
}

async function skip(session) {
  await skipSession(service, session);
  sessions.value = sortSessions(await refreshDaySessions(day.value.id));
}

/** 撤销追加训练（计划位由课表管理，核心会拒绝移除） */
async function remove(session) {
  const withRecord = session.status === "done" ? "，已记录的实际内容与日志会一并删除" : "";
  if (!window.confirm(`移除「${session.label}」${withRecord}？此操作不可撤销。`)) return;
  actionError.value = "";
  try {
    await removeSession(service, session);
    sessions.value = sortSessions(await refreshDaySessions(day.value.id));
  } catch (caught) {
    actionError.value = caught instanceof Error ? caught.message : "移除失败";
  }
}

function closeAdd() {
  addVisible.value = false;
  addError.value = "";
  addForm.label = "";
}

async function addSession() {
  const label = addForm.label.trim();
  if (!label) {
    addError.value = "请填写训练名称。";
    return;
  }
  adding.value = true;
  addError.value = "";
  try {
    await addExtraSession(service, plan.value.id, day.value.id, { label });
    sessions.value = sortSessions(await refreshDaySessions(day.value.id));
    closeAdd();
  } catch (caught) {
    addError.value = caught instanceof Error ? caught.message : "训练创建失败";
  } finally {
    adding.value = false;
  }
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
.day-loading { padding: 48px 0; text-align: center; }
.day-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 20px; padding: 24px 26px; border: 1px solid #d9e0da; border-radius: 18px; background: linear-gradient(120deg, #ffffff 60%, #edf4ee); }
.day-kicker,
.session-meta,
.add-heading span { color: #8b6a1f; font-size: 11px; font-weight: 800; letter-spacing: 0.14em; }
.day-hero h1 { margin: 6px 0 2px; font-size: clamp(28px, 4vw, 40px); color: #183f2b; }
.day-hero p { margin: 0; color: #607066; }
.hero-actions,
.session-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.session-list { position: relative; display: grid; gap: 12px; }
.session-list::before { content: ""; position: absolute; top: 18px; bottom: 18px; left: 31px; width: 1px; background: #cfd8d1; }
.session-card { position: relative; overflow: visible; margin: 0; border-radius: 16px; }
.session-card :deep(.t-card__body) { display: grid; grid-template-columns: 44px 1fr; gap: 16px; padding: 20px; }
.session-seq { position: relative; z-index: 1; display: grid; place-items: center; align-self: start; width: 36px; height: 36px; border-radius: 50%; color: white; background: #357a52; box-shadow: 0 0 0 6px #fff; font: 800 12px/1 ui-monospace, monospace; }
.session-card.done .session-seq { background: #24714a; }
.session-card.skipped .session-seq { color: #58635c; background: #dce2dd; }
.session-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.session-head h2 { margin: 3px 0 8px; font-size: 20px; color: #1d3024; }
.plan-block { padding: 12px 0 2px; }
.plan-block p { margin: 5px 0; color: #607066; font-size: 13px; line-height: 1.7; }
.plan-block.unstructured { color: #526058; }
.record-strip { display: flex; flex-wrap: wrap; gap: 8px 16px; margin: 12px 0; padding: 11px 13px; border-radius: 10px; background: #edf5ef; color: #315540; font-size: 13px; }
.record-strip p { flex-basis: 100%; margin: 2px 0 0; padding-top: 8px; border-top: 1px solid #d3e4d7; white-space: pre-wrap; }
.record-label { font-weight: 800; color: #24714a; }
.skipped-note { background: #f1f2ef; color: #657069; }
.empty-day { display: flex; align-items: center; gap: 18px; margin: 24px 0; padding: 28px; border: 1px dashed #bdc9c0; border-radius: 16px; background: #fbfcfa; }
.empty-day p { margin: 5px 0 0; color: #607066; }
.empty-orbit { display: grid; place-items: center; flex: 0 0 48px; height: 48px; border: 1px solid #9db0a2; border-radius: 50%; color: #607066; font: 700 14px/1 ui-monospace, monospace; }
.add-session-card { margin-top: 14px; border-radius: 16px; }
.add-heading { display: flex; align-items: flex-start; justify-content: space-between; }
.add-heading h2 { margin: 4px 0 12px; }
.close-add { border: 0; color: #607066; background: transparent; font-size: 26px; cursor: pointer; }
.inline-error { margin: 8px 0 12px; color: #9a342d; }
@media (max-width: 640px) {
  .day-hero { align-items: flex-start; flex-direction: column; padding: 20px 18px; }
  .session-list::before { display: none; }
  .session-card :deep(.t-card__body) { grid-template-columns: 1fr; }
  .session-seq { display: none; }
  .session-actions > * { flex: 1; }
}
</style>
