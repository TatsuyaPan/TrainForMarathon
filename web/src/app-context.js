/**
 * 应用上下文：全局 service 与运动员会话（平台无关核心调用）。
 * Vue 组件与 store 均从这里获取。
 */
import {
  DefaultTrainingDataService,
  ensureAthlete,
  getSetupState,
  updateAthleteFitness,
} from "@core";
import { LocalStorageDataStore } from "./stores/local-storage-store.js";

export const service = new DefaultTrainingDataService(new LocalStorageDataStore());

let cachedAthlete = null;

/** 运动员档案（能力、课表基准）变化的订阅者 */
const athleteListeners = new Set();

/** 获取当前运动员（虚拟用户）：web 无需登录，首次进入自动建立 */
export async function getAthlete() {
  if (!cachedAthlete) cachedAthlete = await ensureAthlete(service);
  return cachedAthlete;
}

/**
 * 订阅运动员档案变化；返回取消订阅函数。
 *
 * 能力是课表配速基准：保存/清空能力后，展示层（如课表的「强度 ↔ 配速」口径）
 * 需要立即跟着刷新，而不是等页面重载。不订阅也不影响核心逻辑。
 */
export function onAthleteChange(listener) {
  athleteListeners.add(listener);
  return () => athleteListeners.delete(listener);
}

function publishAthlete(athlete) {
  for (const listener of athleteListeners) {
    try {
      listener(athlete);
    } catch (error) {
      // 订阅者自身出错不应该影响能力保存的结果
      console.error("[athlete listener]", error);
    }
  }
}

/** 清空运动员缓存（能力/配置修改后刷新） */
export function invalidateAthlete() {
  cachedAthlete = null;
}

/**
 * 保存能力（配速计算器 / 我的能力共用）。
 * 必须同步缓存：能力是课表的配速基准，若缓存过期，其他页面（生成课表、训练日）
 * 会继续用旧能力，跨页面看到不一致的结果。
 */
export async function saveAthleteFitness(input) {
  // 首次进入（还没建配置）也要能直接保存能力：先确保档案存在
  await getAthlete();
  cachedAthlete = await updateAthleteFitness(service, input);
  publishAthlete(cachedAthlete);
  return cachedAthlete;
}

/** 清除能力（同步缓存，语义等同「尚未建立能力」） */
export async function clearAthleteFitness() {
  const current = await getAthlete();
  cachedAthlete = {
    ...current,
    thresholdPaceSecondsPerKm: undefined,
    vdot: undefined,
    raceResults: undefined,
    isBeginner: undefined,
    updatedAt: new Date().toISOString(),
  };
  await service.saveAthleteProfile(cachedAthlete);
  publishAthlete(cachedAthlete);
  return cachedAthlete;
}

/**
 * 能力保存后的补充提示：已生成课表时，课表里的配速仍是旧基准，
 * 需要重建才会应用新能力（避免用户以为保存后课表自动变了）。
 */
export async function fitnessSavedHint() {
  const state = await getSetupState(service);
  return state.needsSetup ? "" : "；当前课表仍按旧配速，请到「我的」保存并重建课表以应用";
}
