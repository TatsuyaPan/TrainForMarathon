<template>
  <div class="workout-editor-panel">
    <t-card :bordered="true" class="editor-toolbar">
      <t-form label-align="top">
        <t-form-item label="训练目的">
          <t-input v-model="modelValue.goal" placeholder="例：有氧耐力 · 轻松恢复" :maxlength="30" />
        </t-form-item>
      </t-form>
      <div class="btn-row">
        <t-button data-testid="add-workout-step" theme="primary" @click="addStep([])">+ 添加步骤</t-button>
        <t-button data-testid="add-workout-set" @click="addSet([])">+ 添加组</t-button>
      </div>
    </t-card>

    <t-card :bordered="true" class="editor-canvas">
      <SegmentEditor
        v-for="(segment, index) in modelValue.segments"
        :key="`root.${index}`"
        :segment="segment"
        :path="[index]"
        @move="moveSegment"
        @copy="copySegment"
        @remove="removeSegment"
        @add-step="addStep"
        @add-set="addSet"
      />
      <div v-if="modelValue.segments.length === 0" class="muted empty">
        暂无结构化内容。可以添加步骤或训练组。
      </div>
    </t-card>
  </div>
</template>

<script setup>
import SegmentEditor from "./SegmentEditor.vue";

const props = defineProps({
  modelValue: { type: Object, required: true },
});
const emit = defineEmits(["update:modelValue"]);

function addStep(setPath) {
  const segments = setPath.length === 0 ? props.modelValue.segments : getSetSegments(setPath);
  segments.push({ kind: "step", intensity: { type: "pace", zone: "T" }, load: { type: "time", minutes: 5 } });
  publish();
}

function addSet(setPath) {
  const segments = setPath.length === 0 ? props.modelValue.segments : getSetSegments(setPath);
  segments.push({
    kind: "set",
    repeats: 3,
    segments: [{ kind: "step", intensity: { type: "pace", zone: "I" }, load: { type: "distance", meters: 800 } }],
  });
  publish();
}

function removeSegment(path) {
  getParentSegments(path).splice(path.at(-1), 1);
  publish();
}

function copySegment(path) {
  const segments = getParentSegments(path);
  const index = path.at(-1);
  segments.splice(index + 1, 0, cloneWorkoutValue(segments[index]));
  publish();
}

function moveSegment(path, direction) {
  const segments = getParentSegments(path);
  const index = path.at(-1);
  const target = index + direction;
  if (target < 0 || target >= segments.length) return;
  [segments[index], segments[target]] = [segments[target], segments[index]];
  publish();
}

function getParentSegments(path) {
  let segments = props.modelValue.segments;
  for (const index of path.slice(0, -1)) segments = segments[index].segments;
  return segments;
}

function getSetSegments(path) {
  let segments = props.modelValue.segments;
  let set;
  for (const index of path) {
    set = segments[index];
    segments = set.segments;
  }
  return segments;
}

function publish() {
  emit("update:modelValue", props.modelValue);
}

function cloneWorkoutValue(value) {
  return JSON.parse(JSON.stringify(value));
}
</script>

<style scoped>
.workout-editor-panel { display: grid; gap: 12px; }
.editor-toolbar,
.editor-canvas { overflow: visible; }
.empty {
  padding: 24px 12px;
  text-align: center;
  border: 1px dashed var(--td-component-stroke);
  border-radius: 10px;
  background: #fafbf9;
}
</style>
