/**
 * 训练数据 composable：加载计划/进度/训练会话，供日历三层共享。
 */
import { ref } from "vue";
import { ensureDaySessions, getSetupState, sessionsToProgress, todayIso } from "@core";
import { getAthlete, service } from "../app-context.js";

export function useTrainingData() {
  const loading = ref(true);
  const needsSetup = ref(false);
  const athlete = ref(null);
  const plan = ref(null);
  /** dayId -> ProgressRecord（统计/日历层，session 优先合并旧记录） */
  const recordsByDay = ref(new Map());
  /** dayId -> TrainingSession[]（训练日视图） */
  const sessionsByDay = ref(new Map());

  async function load() {
    loading.value = true;
    athlete.value = await getAthlete();
    const state = await getSetupState(service);
    needsSetup.value = state.needsSetup;
    plan.value = state.plan;
    await reloadRecordsAndSessions();
    loading.value = false;
  }

  /** 重建记录映射（sessions 优先 + 旧 progress 兜底）与全部会话 */
  async function reloadRecordsAndSessions() {
    if (!plan.value) {
      recordsByDay.value = new Map();
      sessionsByDay.value = new Map();
      return;
    }
    const sessions = (await service.listSessions(plan.value.id)).sort((a, b) => a.seq - b.seq);
    const byDaySessions = new Map();
    for (const session of sessions) {
      const list = byDaySessions.get(session.dayId) ?? [];
      list.push(session);
      byDaySessions.set(session.dayId, list);
    }
    sessionsByDay.value = byDaySessions;

    const merged = new Map();
    const legacy = await service.listProgress(plan.value.id);
    for (const entry of legacy) merged.set(entry.record.dayId, entry.record);
    for (const record of sessionsToProgress(sessions)) merged.set(record.dayId, record);
    recordsByDay.value = merged;
  }

  /** 打卡后刷新单日状态（旧 progress 兼容路径） */
  async function reloadProgress() {
    if (!plan.value) return;
    await reloadRecordsAndSessions();
  }

  /** 惰性生成并读取某训练日的会话列表 */
  async function loadDaySessions(dayId) {
    if (!plan.value) return [];
    const day = findPlanDay(plan.value, dayId);
    if (!day) return [];
    const sessions = await ensureDaySessions(service, plan.value, day);
    const sorted = [...sessions].sort((a, b) => a.seq - b.seq);
    sessionsByDay.value = new Map(sessionsByDay.value).set(dayId, sorted);
    return sorted;
  }

  /** 完成/跳过/追加后：重读该日会话并同步记录映射 */
  async function refreshDaySessions(dayId) {
    if (!plan.value) return [];
    const sessions = (await service.listSessions(plan.value.id, dayId)).sort((a, b) => a.seq - b.seq);
    sessionsByDay.value = new Map(sessionsByDay.value).set(dayId, sessions);
    await reloadRecordsAndSessions();
    return sessions;
  }

  return {
    loading,
    needsSetup,
    athlete,
    plan,
    recordsByDay,
    sessionsByDay,
    load,
    reloadProgress,
    loadDaySessions,
    refreshDaySessions,
  };
}

/** 按 id 找计划日 */
export function findPlanDay(plan, dayId) {
  for (const week of plan.weeks) {
    const day = week.days.find((d) => d.id === dayId);
    if (day) return day;
  }
  return null;
}

export { todayIso };
