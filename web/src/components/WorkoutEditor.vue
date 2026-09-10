<template>
  <div ref="root" class="workout-editor" data-testid="workout-editor">
    <div class="editor-grid" :class="{ 'has-focus': Boolean(selectedSegment) }">
      <div class="editor-main">
        <CourseStructureEditor
          :workout="workout"
          :selected-path="currentPath"
          @update:workout="publish"
          @update:selected-path="select"
          @error="$emit('error', $event)"
        />
      </div>

      <aside v-if="selectedSegment" class="editor-aside">
        <div
          ref="focusedPanel"
          class="aside-card"
          data-testid="focused-editor"
          role="dialog"
          tabindex="-1"
          :aria-label="`步骤编辑：${focusedLabel}`"
          @keydown.esc.stop.prevent="closeFocused"
        >
          <CourseStepEditor
            :segment="selectedSegment"
            :role="selectedRole"
            @update:segment="applySelected"
            @remove="removeSelected"
            @close="closeFocused"
          />
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref } from "vue";
import { RUN_ROLE_LABELS, removeSegment, replaceSegment, segmentAt } from "@core";
import CourseStructureEditor from "./CourseStructureEditor.vue";
import CourseStepEditor from "./CourseStepEditor.vue";

const props = defineProps({
  workout: { type: Object, required: true },
  /** 受控选中路径；不传时组件内部自行维护 */
  selectedPath: { type: Array, default: undefined },
});
const emit = defineEmits(["update:workout", "update:selectedPath", "error"]);

const localPath = ref(null);
const currentPath = computed(() => (props.selectedPath === undefined ? localPath.value : props.selectedPath));
const root = ref(null);
const focusedPanel = ref(null);

const selectedSegment = computed(() => {
  const path = currentPath.value;
  if (!Array.isArray(path) || path.length < 2) return null;
  return segmentAt(props.workout, path) ?? null;
});

const selectedRole = computed(() => props.workout.phases[currentPath.value?.[0]]?.role ?? "main");

const focusedLabel = computed(() => {
  const segment = selectedSegment.value;
  if (!segment) return "";
  if (segment.kind === "repeat") return "循环";
  if (segment.kind === "recovery") return "主动恢复";
  if (segment.kind === "rest") return "被动休息";
  return RUN_ROLE_LABELS[selectedRole.value] ?? "跑步步骤";
});

// core 的结构编辑函数是纯函数，入口处自行深拷贝（src/clone.ts），
// 因此可以直接把响应式 workout 传进去，不需要在界面层再转普通对象。
function publish(workout) {
  emit("update:workout", workout);
}

function select(path) {
  setPath(path);
  if (path) focusPanel();
}

function setPath(path) {
  localPath.value = path;
  emit("update:selectedPath", path);
}

/**
 * 关闭聚焦编辑：焦点回到刚才那个步骤（键盘与读屏用户不会丢失位置）。
 */
function closeFocused() {
  const previous = currentPath.value;
  setPath(null);
  restoreRowFocus(previous);
}

/** 打开聚焦编辑：把焦点移进面板，键盘用户不必再 Tab 一大圈 */
function focusPanel() {
  nextTick(() => focusedPanel.value?.focus());
}

function restoreRowFocus(path) {
  if (!Array.isArray(path) || path.length < 2) return;
  const key = path.join("-");
  nextTick(() => {
    const row = root.value?.querySelector(`[data-segment-path="${key}"]`);
    row?.focus?.();
  });
}

function applySelected(segment) {
  const path = currentPath.value;
  if (!Array.isArray(path) || path.length < 2) return;
  try {
    publish(replaceSegment(props.workout, path, cleanSegment(segment)));
  } catch (error) {
    emit("error", error instanceof Error ? error.message : "步骤更新失败");
  }
}

function removeSelected() {
  const path = currentPath.value;
  if (!Array.isArray(path) || path.length < 2) return;
  try {
    publish(removeSegment(props.workout, path));
    // 删除后索引会前移，焦点不再回到原步骤
    setPath(null);
  } catch (error) {
    emit("error", error instanceof Error ? error.message : "步骤删除失败");
  }
}

/** 去掉值为 undefined 的字段，避免 JSON 往返后出现空键 */
function cleanSegment(segment) {
  return JSON.parse(JSON.stringify(segment));
}
</script>

<style scoped>
.workout-editor { width: 100%; }
.editor-grid { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr); }
.editor-grid.has-focus { grid-template-columns: minmax(0, 1fr) 300px; }
.editor-main { min-width: 0; }
.aside-card {
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  background: #fff;
  padding: 12px;
  position: sticky;
  top: 12px;
}
@media (max-width: 900px) {
  .editor-grid.has-focus { grid-template-columns: minmax(0, 1fr); }
  .editor-aside {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 20;
    padding: 12px 12px calc(12px + env(safe-area-inset-bottom, 0px));
    background: rgba(247, 247, 245, 0.96);
    border-top: 1px solid var(--td-component-stroke);
    max-height: 72vh;
    overflow: auto;
  }
  .aside-card { position: static; }
}
</style>
