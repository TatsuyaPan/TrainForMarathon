<template>
  <div class="workout-display">
    <slot name="before" />

    <StructurePreview
      :blocks="presentation.preview.blocks"
      :mixed-units="presentation.preview.mixedUnits"
      :compressed="presentation.preview.compressed"
    />

    <div class="workout-toggle">
      <t-button size="small" variant="text" data-testid="toggle-structure" @click="structureOpen = !structureOpen">
        {{ structureOpen ? "收起步骤" : "展开步骤" }}
      </t-button>
    </div>

    <div v-if="structureOpen" class="workout-phases" data-testid="course-structure">
      <section
        v-for="phase in presentation.phases"
        :key="phase.role"
        class="phase-block"
        :class="`phase-block-${phase.role}`"
        :style="phaseStyle(phase.role)"
      >
        <div class="phase-head">
          <span class="phase-tag" :style="tagStyle(phase.role)">{{ phase.tag }} {{ phase.label }}</span>
          <span class="muted">{{ phase.summary }}</span>
        </div>
        <WorkoutStructure :nodes="phase.nodes" />
      </section>
    </div>

    <slot name="after" />
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { PHASE_COLORS, createWorkoutPresentation } from "@core";
import StructurePreview from "./StructurePreview.vue";
import WorkoutStructure from "./WorkoutStructure.vue";
import { usePaceDisplay } from "../composables/usePaceDisplay.js";

const props = defineProps({
  workout: { type: Object, required: true },
});

/**
 * 通用训练内容展示：结构预览（按阶段拆行）+ 展开/收起步骤 + 阶段配色步骤树。
 * 各界面自己的壳（课程元数据、动作按钮、DSL 区等）通过 before/after slot 附加。
 */
const structureOpen = ref(false);

// 展示口径（强度 ↔ 配速）是全局偏好：组件只读，不在这里放开关
const { presentationContext } = usePaceDisplay();

const presentation = computed(() => createWorkoutPresentation(props.workout, presentationContext.value));

function phaseStyle(role) {
  const colors = PHASE_COLORS[role];
  return { borderColor: colors.border, background: colors.background };
}

function tagStyle(role) {
  const colors = PHASE_COLORS[role];
  return { color: colors.text, background: colors.chip };
}
</script>

<style scoped>
.workout-display { display: grid; gap: 8px; }
.workout-toggle { display: flex; justify-content: flex-end; }
.workout-phases { display: grid; gap: 10px; }
.phase-block {
  border: 1px solid var(--td-component-stroke);
  border-left-width: 4px;
  border-radius: 10px;
  padding: 10px 12px;
  display: grid;
  gap: 6px;
}
.phase-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.phase-tag {
  font-size: 12px;
  font-weight: 700;
  border-radius: 6px;
  padding: 1px 7px;
}
</style>
