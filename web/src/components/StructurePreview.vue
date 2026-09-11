<template>
  <div class="structure-preview-wrap" data-testid="structure-preview" @mouseleave="hideTooltip" @click="clearPin">
    <div
      v-for="row in rows"
      :key="row.role"
      class="preview-row"
      :class="`preview-row-${row.role}`"
    >
      <span class="row-label" :style="labelStyle(row.role)">{{ row.tag }} {{ row.label }}</span>
      <div class="structure-preview" role="img" :aria-label="rowAria(row)">
        <span
          v-for="(block, index) in row.blocks"
          :key="index"
          class="preview-block"
          :class="`preview-${block.kind}`"
          :style="{ background: block.color, flexGrow: block.weight || 1 }"
          @mouseenter="showTooltip(block, $event)"
          @click.stop="toggleTooltip(block, $event)"
        />
      </div>
    </div>
    <p v-if="mixedUnits" class="preview-note muted">混合单位，完整耗时需结合个人配速估算。</p>
    <div
      v-if="tooltip"
      class="preview-tooltip"
      role="tooltip"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >{{ tooltip.label }}</div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { PHASE_COLORS, PHASE_LABELS, PHASE_TAGS } from "@core";

const props = defineProps({
  blocks: { type: Array, default: () => [] },
  mixedUnits: { type: Boolean, default: false },
  compressed: { type: Boolean, default: false },
});

/**
 * 预览按阶段拆行：热身/主训练/冷身各自独立成行，
 * 每行内色块相对权重不变（flexGrow 只取决于行内比例）。
 */
const PHASE_ORDER = ["warmup", "main", "cooldown"];

const rows = computed(() =>
  PHASE_ORDER.map((role) => ({
    role,
    tag: PHASE_TAGS[role],
    label: PHASE_LABELS[role],
    blocks: props.blocks.filter((block) => block.role === role),
  })).filter((row) => row.blocks.length > 0),
);

/** 单块悬浮提示：hover 显示、移开隐藏；触屏用点击切换（再点一次收起） */
const tooltip = ref(null);
/** 点击后固定住提示（不再随移开隐藏），再点同一块或点空白处收起 */
let pinned = false;

function showTooltip(block, event) {
  tooltip.value = { label: block.label, x: event.clientX, y: event.clientY };
}

function hideTooltip() {
  if (pinned) return;
  tooltip.value = null;
}

function toggleTooltip(block, event) {
  if (pinned && tooltip.value?.label === block.label) {
    pinned = false;
    tooltip.value = null;
  } else {
    pinned = true;
    showTooltip(block, event);
  }
}

function clearPin() {
  pinned = false;
  tooltip.value = null;
}

function labelStyle(role) {
  const colors = PHASE_COLORS[role];
  return { color: colors.text, background: colors.chip };
}

function rowAria(row) {
  const parts = row.blocks.map((block) => block.label).filter((label) => label && label !== "…");
  const suffix = props.compressed ? "，课程较长，预览已压缩" : "";
  return parts.length > 0
    ? `训练结构预览 · ${row.tag} ${row.label}：${parts.join("、")}${suffix}`
    : `训练结构预览 · ${row.tag} ${row.label}`;
}
</script>

<style scoped>
.structure-preview-wrap { width: 100%; display: grid; gap: 6px; position: relative; }
.preview-row {
  display: grid;
  grid-template-columns: 72px 1fr;
  align-items: center;
  gap: 8px;
}
.row-label {
  width: 100%;
  font-size: 11px;
  font-weight: 700;
  border-radius: 6px;
  padding: 2px 0;
  text-align: center;
  white-space: nowrap;
}
.structure-preview {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  width: 100%;
  min-height: 18px;
  padding: 3px;
  border-radius: 8px;
  background: #f2f4f2;
  overflow: hidden;
}
.preview-block {
  flex: 1 1 0;
  min-width: 3px;
  border-radius: 3px;
  display: block;
}
.preview-run { height: 14px; }
.preview-recovery { height: 9px; }
.preview-rest { height: 5px; }
.preview-compressed { height: 14px; opacity: 0.55; }
.preview-note { margin: 6px 0 0; }
.preview-tooltip {
  position: fixed;
  z-index: 50;
  transform: translate(-50%, calc(-100% - 8px));
  max-width: 260px;
  padding: 4px 10px;
  border-radius: 6px;
  background: rgba(29, 48, 36, 0.94);
  color: #fff;
  font-size: 12px;
  line-height: 1.5;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
}
</style>
