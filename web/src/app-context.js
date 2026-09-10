/**
 * 应用上下文：全局 service 与运动员会话（平台无关核心调用）。
 * Vue 组件与 store 均从这里获取。
 */
import {
  DefaultTrainingDataService,
  ensureAthlete,
} from "@core";
import { LocalStorageDataStore } from "./stores/local-storage-store.js";

export const service = new DefaultTrainingDataService(new LocalStorageDataStore());

let cachedAthlete = null;

/** 获取当前运动员（虚拟用户）：web 无需登录，首次进入自动建立 */
export async function getAthlete() {
  if (!cachedAthlete) cachedAthlete = await ensureAthlete(service);
  return cachedAthlete;
}

/** 清空运动员缓存（能力/配置修改后刷新） */
export function invalidateAthlete() {
  cachedAthlete = null;
}
