<template>
  <div class="display-switch" data-testid="display-mode-switch">
    <span class="switch-title">课表展示</span>
    <div class="switch-group" role="group" aria-label="课表展示口径">
      <button
        v-for="option in OPTIONS"
        :key="option.value"
        type="button"
        class="switch-option"
        :class="{ active: mode === option.value }"
        :aria-pressed="mode === option.value"
        :data-testid="`display-mode-${option.value}`"
        @click="setMode(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
    <span class="switch-hint muted" data-testid="display-mode-hint">{{ hint }}</span>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { usePaceDisplay } from "../composables/usePaceDisplay.js";
import { TARGET_DISPLAY_LABELS } from "../stores/display-prefs.js";

const { mode, ready, hasPaces, setMode } = usePaceDisplay();

const OPTIONS = [
  { value: "zone", label: TARGET_DISPLAY_LABELS.zone },
  { value: "pace", label: TARGET_DISPLAY_LABELS.pace },
];

/**
 * 提示文字只在能说明问题时出现：
 * 还没有能力 / 能力还没读出来时不解释「为什么没配速」，避免误导。
 */
const hint = computed(() => {
  if (!ready.value) return "";
  if (!hasPaces.value) return "尚未建立能力：先到「我的」填写阈值配速或比赛成绩，才能换算配速";
  if (mode.value === "pace") return "T、I 等档位已按当前能力换算配速；E、M 为估算值";
  return "只显示丹尼尔斯强度档位（E/M/T/I/R/ST）";
});
</script>

<style scoped>
.display-switch { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.switch-title { font-size: 13px; color: #35424f; }
.switch-group {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 999px;
  background: #f2f4f2;
}
.switch-option {
  padding: 3px 14px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #35424f;
  font-size: 13px;
  cursor: pointer;
}
.switch-option.active {
  background: #fff;
  color: #357a52;
  font-weight: 700;
  box-shadow: 0 1px 3px rgba(24, 63, 43, 0.16);
}
.switch-option:focus-visible { outline: 2px solid #357a52; outline-offset: 2px; }
.switch-hint { font-size: 12px; }
</style>
