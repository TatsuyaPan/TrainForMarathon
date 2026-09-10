/**
 * 课表展示口径（强度 ↔ 配速）与当前能力配速。
 *
 * 全局单例：课程库、训练日、训练周共用同一个开关，切换后所有展示一起变。
 * 配速来自「我的」里保存的能力（阈值配速或 VDOT 比赛成绩），换算规则由 core 提供；
 * 尚未建立能力时 paces 为 null，core 展示函数自动回退到强度标签。
 */
import { computed, ref } from "vue";
import { athleteFitness, trainingPacesFromFitness } from "@core";
import { getAthlete, onAthleteChange } from "../app-context.js";
import {
  DEFAULT_TARGET_DISPLAY_MODE,
  readTargetDisplayMode,
  writeTargetDisplayMode,
} from "../stores/display-prefs.js";

const mode = ref(readTargetDisplayMode());
const paces = ref(null);
const ready = ref(false);
let loading = null;

function applyAthlete(athlete) {
  paces.value = trainingPacesFromFitness(athleteFitness(athlete));
  ready.value = true;
}

/** 读取当前能力 → 配速档位；重复调用共用同一个请求 */
function ensurePaces() {
  if (loading) return loading;
  loading = (async () => {
    try {
      applyAthlete(await getAthlete());
    } catch (error) {
      console.error("[pace display]", error);
      paces.value = null;
      ready.value = true;
    }
  })();
  return loading;
}

// 能力变化（保存/清空）时同步刷新，避免课表继续按旧能力换算配速
onAthleteChange(applyAthlete);

export function usePaceDisplay() {
  ensurePaces();

  function setMode(next) {
    mode.value = writeTargetDisplayMode(next);
  }

  function toggle() {
    setMode(mode.value === "pace" ? "zone" : "pace");
  }

  return {
    /** 当前口径：`zone` 强度 / `pace` 配速 */
    mode,
    /** 当前能力的 E/M/T/I/R 配速档位；未建立能力为 null */
    paces,
    /** 能力是否已读取完成（未完成时不展示「无能力」提示，避免闪现误导） */
    ready,
    hasPaces: computed(() => Boolean(paces.value)),
    /** 直接传给 core 展示函数的上下文 */
    presentationContext: computed(() => ({ targetMode: mode.value, paces: paces.value })),
    setMode,
    toggle,
  };
}

/** 供「我的」等页面在保存能力后立刻重算（能力订阅之外的兜底入口） */
export function refreshPaceDisplay() {
  loading = null;
  return ensurePaces();
}

export { DEFAULT_TARGET_DISPLAY_MODE };
