/**
 * 课表展示偏好（localStorage）。
 *
 * 目前只有一项：课表按「强度」还是「配速」展示。
 * - 强度：丹尼尔斯档位（E/M/T/I/R/ST），DSL 的原始说法；
 * - 配速：当前能力的对应配速区间（E/M 标注估算）。
 *
 * 默认值为 `pace`：与既有课表文字一致（训练日文案本来就带配速），
 * 课程库则因此默认直接看到本人配速；想只看强度字母时切到 `zone` 即可。
 * 存储只发生在本模块，界面层不直接碰 localStorage（见 test/domain-boundary.test.js）。
 */

export const DISPLAY_PREFS_KEY = "tfm:display-prefs:v1";

/** 展示口径取值，顺序即界面顺序 */
export const TARGET_DISPLAY_MODES = ["zone", "pace"];

export const DEFAULT_TARGET_DISPLAY_MODE = "pace";

/** 口径文案：界面与提示共用，避免各处写法不一致 */
export const TARGET_DISPLAY_LABELS = {
  zone: "强度",
  pace: "配速",
};

function storage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isMode(value) {
  return TARGET_DISPLAY_MODES.includes(value);
}

/** 读取展示口径：本地存储不可用或数据损坏时回退默认口径 */
export function readTargetDisplayMode() {
  const store = storage();
  if (!store) return DEFAULT_TARGET_DISPLAY_MODE;
  try {
    const raw = store.getItem(DISPLAY_PREFS_KEY);
    if (!raw) return DEFAULT_TARGET_DISPLAY_MODE;
    const parsed = JSON.parse(raw);
    const mode = parsed?.targetDisplayMode;
    return isMode(mode) ? mode : DEFAULT_TARGET_DISPLAY_MODE;
  } catch {
    return DEFAULT_TARGET_DISPLAY_MODE;
  }
}

/** 保存展示口径；非法取值与写入失败都不改变本次界面结果 */
export function writeTargetDisplayMode(mode) {
  if (!isMode(mode)) return DEFAULT_TARGET_DISPLAY_MODE;
  const store = storage();
  if (!store) return mode;
  try {
    store.setItem(DISPLAY_PREFS_KEY, JSON.stringify({ targetDisplayMode: mode }));
  } catch {
    /* 存不下（如隐私模式）不影响本次切换 */
  }
  return mode;
}
