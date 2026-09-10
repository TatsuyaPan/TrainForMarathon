<template>
  <div class="workout-editor" data-testid="workout-editor">
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
        <div class="aside-card" data-testid="focused-editor">
          <CourseStepEditor
            :segment="selectedSegment"
            :role="selectedRole"
            @update:segment="applySelected"
            @remove="removeSelected"
            @close="select(null)"
          />
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { removeSegment, replaceSegment, segmentAt } from "@core";
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

const selectedSegment = computed(() => {
  const path = currentPath.value;
  if (!Array.isArray(path) || path.length < 2) return null;
  return segmentAt(props.workout, path) ?? null;
});

const selectedRole = computed(() => props.workout.phases[currentPath.value?.[0]]?.role ?? "main");

/** core 结构编辑函数内部 structuredClone，Proxy 不能直接克隆，先转普通对象 */
function plainWorkout() {
  return JSON.parse(JSON.stringify(props.workout));
}

function publish(workout) {
  emit("update:workout", workout);
}

function select(path) {
  localPath.value = path;
  emit("update:selectedPath", path);
}

function applySelected(segment) {
  const path = currentPath.value;
  if (!Array.isArray(path) || path.length < 2) return;
  try {
    publish(replaceSegment(plainWorkout(), path, cleanSegment(segment)));
  } catch (error) {
    emit("error", error instanceof Error ? error.message : "步骤更新失败");
  }
}

function removeSelected() {
  const path = currentPath.value;
  if (!Array.isArray(path) || path.length < 2) return;
  try {
    publish(removeSegment(plainWorkout(), path));
    select(null);
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
