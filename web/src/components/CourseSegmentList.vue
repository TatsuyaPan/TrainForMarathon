<template>
  <ul ref="root" class="segment-list" :class="`depth-${Math.min(depth, 2)}`">
    <li v-for="(segment, index) in segments" :key="`${parentPath.join('-')}-${index}`" class="segment-item">
      <template v-if="segment.kind === 'repeat'">
        <div class="repeat-box" data-testid="editor-repeat">
          <div class="repeat-head">
            <span class="repeat-badge">循环</span>
            <input
              class="repeat-input"
              type="number"
              min="1"
              step="1"
              :value="segment.repetitions"
              :aria-label="`循环次数（第 ${index + 1} 个循环）`"
              @change="changeRepetitions(index, $event)"
            />
            <span class="muted">次</span>
            <span v-if="segment.note" class="muted">· {{ segment.note }}</span>
            <span class="spacer" />
            <button
              type="button"
              class="row-open"
              :data-segment-path="pathKey(index)"
              :aria-label="`循环设置：${segment.repetitions} 次`"
              :aria-expanded="isSelected(index)"
              @click="emitSelect(index)"
              @keydown.enter.prevent="emitSelect(index)"
              @keydown.space.prevent="emitSelect(index)"
            >
              循环设置
              <span class="chevron" aria-hidden="true">{{ isSelected(index) ? "▾" : "▸" }}</span>
            </button>
            <span class="row-actions">
              <button type="button" title="上移" @click="emitCommand('up', index)">↑</button>
              <button type="button" title="下移" @click="emitCommand('down', index)">↓</button>
              <button type="button" @click="emitCommand('duplicate', index)">复制</button>
              <button type="button" class="danger" @click="emitCommand('remove', index)">删除</button>
            </span>
          </div>
          <CourseSegmentList
            :segments="segment.segments"
            :parent-path="[...parentPath, index]"
            :selected-path="selectedPath"
            :depth="depth + 1"
            :phase-role="phaseRole"
            @select="$emit('select', $event)"
            @command="$emit('command', $event)"
          />
          <div class="repeat-add">
            <button type="button" @click="emitAdd(index, 'run')">+ 跑步</button>
            <button type="button" @click="emitAdd(index, 'recovery')">+ 主动恢复</button>
            <button type="button" @click="emitAdd(index, 'rest')">+ 被动休息</button>
            <button
              type="button"
              :disabled="!canNestLoop"
              :title="canNestLoop ? '' : `最多嵌套 ${MAX_REPEAT_DEPTH} 层循环`"
              @click="emitAdd(index, 'repeat')"
            >
              + 嵌套循环
            </button>
          </div>
        </div>
        <div
          v-if="isSelected(index)"
          class="segment-detail"
          data-testid="inline-step-editor"
          data-segment-detail
          role="region"
          tabindex="-1"
          :aria-label="`步骤编辑：循环`"
          @keydown.esc.stop.prevent="closeDetail(index)"
        >
          <CourseStepEditor
            :segment="segment"
            :role="phaseRole"
            @update:segment="emitUpdate(index, $event)"
            @remove="emitCommand('remove', index)"
            @close="closeDetail(index)"
          />
        </div>
      </template>

      <template v-else>
        <div class="segment-row" :class="{ active: isSelected(index) }">
          <button
            type="button"
            class="row-main"
            :data-testid="`segment-row-${index}`"
            :data-segment-path="pathKey(index)"
            :aria-label="`${typeLabel(segment)} ${loadText(segment)}：打开步骤编辑`"
            :aria-expanded="isSelected(index)"
            @click="emitSelect(index)"
            @keydown.enter.prevent="emitSelect(index)"
            @keydown.space.prevent="emitSelect(index)"
          >
            <span class="dot" :style="{ background: segmentColor(segment) }" aria-hidden="true" />
            <span class="type">{{ typeLabel(segment) }}</span>
            <span class="load">{{ loadText(segment) }}</span>
            <span v-if="segment.kind === 'run'" class="target">{{ formatTargetShortLabel(segment.target) }}</span>
            <span class="chevron" aria-hidden="true">{{ isSelected(index) ? "▾" : "▸" }}</span>
          </button>
          <span class="spacer" />
          <span class="row-actions">
            <button type="button" title="上移" @click="emitCommand('up', index)">↑</button>
            <button type="button" title="下移" @click="emitCommand('down', index)">↓</button>
            <button type="button" @click="emitCommand('duplicate', index)">复制</button>
            <button type="button" class="danger" @click="emitCommand('remove', index)">删除</button>
            <select
              v-if="depth === 0"
              class="move-select"
              aria-label="移动到阶段"
              :value="''"
              @change="emitMoveToPhase(index, $event)"
            >
              <option value="">移动到…</option>
              <option v-for="role in otherRoles" :key="role" :value="role">{{ PHASE_LABELS[role] }}</option>
            </select>
          </span>
        </div>
        <div
          v-if="isSelected(index)"
          class="segment-detail"
          data-testid="inline-step-editor"
          data-segment-detail
          role="region"
          tabindex="-1"
          :aria-label="`步骤编辑：${typeLabel(segment)}`"
          @keydown.esc.stop.prevent="closeDetail(index)"
        >
          <CourseStepEditor
            :segment="segment"
            :role="phaseRole"
            @update:segment="emitUpdate(index, $event)"
            @remove="emitCommand('remove', index)"
            @close="closeDetail(index)"
          />
        </div>
      </template>
    </li>
  </ul>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import {
  MAX_REPEAT_DEPTH,
  formatDurationLabel,
  PHASE_LABELS,
  RUN_ROLE_LABELS,
  formatLoadLabel,
  formatTargetShortLabel,
  segmentColor,
} from "@core";
import CourseStepEditor from "./CourseStepEditor.vue";

const props = defineProps({
  segments: { type: Array, default: () => [] },
  parentPath: { type: Array, required: true },
  selectedPath: { type: Array, default: null },
  depth: { type: Number, default: 0 },
  /** 所在阶段的角色（warmup / main / cooldown），决定跑步步骤的显示名称 */
  phaseRole: { type: String, default: "main" },
});
const emit = defineEmits(["select", "command"]);

const root = ref(null);

/** 行内展开后把焦点移进编辑卡片；只有渲染了该卡片的列表实例能找到它 */
watch(
  () => props.selectedPath,
  () => nextTick(() => root.value?.querySelector("[data-segment-detail]")?.focus()),
);

const otherRoles = computed(() => ["warmup", "main", "cooldown"]);
/**
 * 本列表里的循环自身处在第 depth+1 层，再嵌一层就是第 depth+2 层：
 * 超上限时禁用按钮，让用户在点击前就知道结果，而不是保存时才报错。
 */
const canNestLoop = computed(() => props.depth + 2 <= MAX_REPEAT_DEPTH);

function isSelected(index) {
  const path = [...props.parentPath, index];
  return Array.isArray(props.selectedPath) && props.selectedPath.join(".") === path.join(".");
}

/** 步骤在课表里的稳定路径标识，用于选中后把焦点还回原步骤 */
function pathKey(index) {
  return [...props.parentPath, index].join("-");
}

/** 已展开的行再点一次就收起（toggle），与 ▾/✕/Esc 三种收起方式并存 */
function emitSelect(index) {
  const path = [...props.parentPath, index];
  emit("select", isSelected(index) ? null : path);
}

function emitUpdate(index, segment) {
  emit("command", { type: "update", path: [...props.parentPath, index], segment });
}

/** 收起行内编辑并把焦点还给该步骤行，键盘与读屏用户不会丢失位置 */
function closeDetail(index) {
  emit("select", null);
  nextTick(() => {
    root.value?.querySelector(`[data-segment-path="${pathKey(index)}"]`)?.focus?.();
  });
}

function typeLabel(segment) {
  if (segment.kind === "recovery") return "恢复";
  if (segment.kind === "rest") return "休息";
  return RUN_ROLE_LABELS[props.phaseRole] ?? "跑步";
}

function loadText(segment) {
  return segment.kind === "rest"
    ? formatDurationLabel(segment.durationSeconds)
    : formatLoadLabel(segment.load);
}

function emitCommand(type, index) {
  emit("command", { type, path: [...props.parentPath, index] });
}

function emitAdd(index, kind) {
  emit("command", { type: "add", parentPath: [...props.parentPath, index], kind });
}

function emitMoveToPhase(index, event) {
  const target = event.target.value;
  event.target.value = "";
  if (!target) return;
  emit("command", { type: "move-to-role", path: [...props.parentPath, index], role: target });
}

function changeRepetitions(index, event) {
  const value = Number(event.target.value);
  if (!Number.isInteger(value) || value <= 0) {
    event.target.value = props.segments[index].repetitions;
    return;
  }
  emit("command", { type: "repeat-count", path: [...props.parentPath, index], repetitions: value });
}
</script>

<style scoped>
.segment-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.segment-item { margin: 0; }
.segment-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 4px 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  background: #fff;
}
.segment-row.active { border-color: #357a52; box-shadow: 0 0 0 2px #e8f1ea; }
/* 可选中的主体是原生按钮：键盘 Tab/Enter/Space 天然可用，操作按钮不再被包进按钮里 */
.row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
  padding: 3px 0;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.row-main:focus-visible,
.row-open:focus-visible { outline: 2px solid #357a52; outline-offset: 2px; border-radius: 6px; }
.dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.type { font-weight: 600; }
.load, .target { font-variant-numeric: tabular-nums; }
.chevron { color: #8b93a1; font-size: 12px; margin-left: 2px; }
.segment-detail {
  margin-top: 6px;
  border: 1px solid #b7cbbf;
  border-radius: 10px;
  background: #fbfdfb;
  padding: 10px 12px;
}
.segment-detail:focus { outline: 2px solid #357a52; outline-offset: 2px; }
.spacer { flex: 1; }
.row-actions { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; }
.row-actions button,
.row-open,
.repeat-add button {
  font-size: 12px;
  padding: 2px 8px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.row-actions button.danger { color: #d54941; border-color: #f3c9c6; }
.repeat-add button:disabled { color: #9aa2ab; background: #f5f6f5; cursor: not-allowed; }
.move-select { font-size: 12px; border: 1px solid var(--td-component-stroke); border-radius: 6px; padding: 2px; }
.repeat-box {
  border: 1px solid var(--td-component-stroke);
  border-left: 3px solid #8b93a1;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fbfcfb;
  display: grid;
  gap: 6px;
}
.repeat-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.repeat-badge {
  font-size: 12px;
  font-weight: 600;
  color: #35424f;
  background: #e8edf2;
  border-radius: 999px;
  padding: 2px 10px;
}
.repeat-input { width: 56px; padding: 2px 4px; border: 1px solid var(--td-component-stroke); border-radius: 6px; }
.repeat-add { display: flex; gap: 6px; flex-wrap: wrap; }
.depth-1 { margin-left: 10px; }
.depth-2 { margin-left: 10px; }
</style>
