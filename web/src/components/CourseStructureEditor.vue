<template>
  <div class="structure-editor" data-testid="structure-editor">
    <section
      v-for="(phase, phaseIndex) in workout.phases"
      :key="phase.role"
      class="phase-editor"
      :class="`phase-editor-${phase.role}`"
      :style="phaseStyle(phase.role)"
      :data-testid="`phase-editor-${PHASE_TAGS[phase.role]}`"
    >
      <header class="phase-editor-head">
        <span class="phase-tag" :style="tagStyle(phase.role)">{{ PHASE_TAGS[phase.role] }} {{ PHASE_LABELS[phase.role] }}</span>
        <span class="muted">{{ phaseSummary(phase.role) }}</span>
        <span class="spacer" />
        <button
          v-if="phase.role !== 'main'"
          type="button"
          class="danger"
          :data-testid="`remove-phase-${PHASE_TAGS[phase.role]}`"
          @click="deletePhase(phase.role)"
        >
          删除阶段
        </button>
      </header>

      <CourseSegmentList
        :segments="phase.segments"
        :parent-path="[phaseIndex]"
        :selected-path="selectedPath"
        :phase-role="phase.role"
        @select="selectedPath = $event"
        @command="onCommand"
      />

      <p v-if="phase.segments.length === 0" class="phase-empty muted">阶段为空：保存前需要至少一个步骤。</p>

      <div class="phase-add">
        <button type="button" :data-testid="`add-run-${PHASE_TAGS[phase.role]}`" @click="addSegment(phaseIndex, 'run')">
          + 跑步
        </button>
        <button type="button" data-testid="add-recovery" @click="addSegment(phaseIndex, 'recovery')">+ 主动恢复</button>
        <button type="button" data-testid="add-rest" @click="addSegment(phaseIndex, 'rest')">+ 被动休息</button>
        <button type="button" data-testid="add-repeat" @click="addSegment(phaseIndex, 'repeat')">+ 循环</button>
      </div>
    </section>

    <div class="phase-actions">
      <button v-if="!hasPhase('warmup')" type="button" data-testid="add-warmup-phase" @click="createPhase('warmup')">
        + 添加热身阶段（WU）
      </button>
      <button v-if="!hasPhase('cooldown')" type="button" data-testid="add-cooldown-phase" @click="createPhase('cooldown')">
        + 添加冷身阶段（CD）
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import {
  PHASE_COLORS,
  PHASE_LABELS,
  PHASE_TAGS,
  addPhase,
  createDefaultSegment,
  createWorkoutPresentation,
  duplicateSegment,
  insertSegment,
  moveSegment,
  moveSegmentTo,
  phaseIndex,
  removePhase,
  removeSegment,
  replaceSegment,
  segmentAt,
  stripUndefinedFields,
} from "@core";
import CourseSegmentList from "./CourseSegmentList.vue";

const props = defineProps({
  workout: { type: Object, required: true },
});
const emit = defineEmits(["update:workout", "error"]);

/** 当前行内展开编辑的步骤路径；null 表示全部收起 */
const selectedPath = ref(null);

const presentation = computed(() => createWorkoutPresentation(props.workout));

/** 阶段分区配色：热身绿 / 主训练琥珀金 / 冷身蓝，与课程展示组件同一套 PHASE_COLORS */
function phaseStyle(role) {
  const colors = PHASE_COLORS[role];
  return { borderColor: colors.border, background: colors.background };
}

function tagStyle(role) {
  const colors = PHASE_COLORS[role];
  return { color: colors.text, background: colors.chip };
}

function phaseSummary(role) {
  return presentation.value.phases.find((phase) => phase.role === role)?.summary ?? "";
}

function hasPhase(role) {
  return props.workout.phases.some((phase) => phase.role === role);
}

function publish(workout) {
  emit("update:workout", workout);
}

function addSegment(phaseIndexValue, kind, index) {
  const phase = props.workout.phases[phaseIndexValue];
  if (!phase) return;
  const at = index ?? phase.segments.length;
  publish(insertSegment(props.workout, [phaseIndexValue], at, createDefaultSegment(kind, phase.role)));
}

/** 路径所属阶段的角色（用于决定“跑步”步骤的默认值与显示名称） */
function roleForPath(path) {
  return props.workout.phases[path[0]]?.role ?? "main";
}

/** 路径指向的容器（阶段或循环）内的分部数量，用于把新分部追加到容器末尾 */
function containerLength(path) {
  let segments = props.workout.phases[path[0]]?.segments ?? [];
  for (let index = 1; index < path.length; index += 1) {
    const node = segments[path[index]];
    if (!node || node.kind !== "repeat") return 0;
    segments = node.segments;
  }
  return segments.length;
}

function createPhase(role) {
  publish(addPhase(props.workout, role));
}

function deletePhase(role) {
  publish(removePhase(props.workout, role));
  selectedPath.value = null;
}

function onCommand(command) {
  try {
    switch (command.type) {
      case "add": {
        const parentPath = command.parentPath;
        publish(
          insertSegment(
            props.workout,
            parentPath,
            containerLength(parentPath),
            createDefaultSegment(command.kind, roleForPath(parentPath)),
          ),
        );
        break;
      }
      case "update":
        // 行内编辑卡片的字段变化：清理切换类型后留下的 undefined 键再写回
        publish(replaceSegment(props.workout, command.path, stripUndefinedFields(command.segment)));
        break;
      case "remove":
        publish(removeSegment(props.workout, command.path));
        selectedPath.value = null;
        break;
      case "duplicate":
        publish(duplicateSegment(props.workout, command.path));
        break;
      case "up":
      case "down":
        publish(moveSegment(props.workout, command.path, command.type === "up" ? -1 : 1));
        // 移动后原路径指向别的步骤，行内编辑收起避免编辑错对象
        selectedPath.value = null;
        break;
      case "repeat-count":
        publish(replaceSegment(props.workout, command.path, { ...segmentAt(props.workout, command.path), repetitions: command.repetitions }));
        break;
      case "move-to-role":
        moveToRole(command.path, command.role);
        break;
      default:
        break;
    }
  } catch (error) {
    emit("error", error instanceof Error ? error.message : "结构操作失败");
  }
}

function moveToRole(path, role) {
  const targetIndex = phaseIndex(props.workout, role);
  if (targetIndex < 0) return;
  const target = props.workout.phases[targetIndex];
  publish(moveSegmentTo(props.workout, path, [targetIndex], target.segments.length));
  selectedPath.value = null;
}
</script>

<style scoped>
.structure-editor { display: grid; gap: 14px; }
.phase-editor {
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  padding: 10px 12px;
  background: #fdfdfc;
  display: grid;
  gap: 8px;
}
.phase-editor-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.phase-tag {
  font-size: 12px;
  font-weight: 700;
  color: #357a52;
  background: #e8f1ea;
  border-radius: 6px;
  padding: 1px 7px;
}
.spacer { flex: 1; }
.phase-empty { margin: 0; }
.phase-add, .phase-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.phase-add button, .phase-actions button, .phase-editor-head button {
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.phase-editor-head button.danger { color: #d54941; border-color: #f3c9c6; }
</style>
