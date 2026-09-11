<template>
  <div class="workout-editor" data-testid="workout-editor">
    <CourseStructureEditor
      :workout="workout"
      @update:workout="publish"
      @error="$emit('error', $event)"
    />
  </div>
</template>

<script setup>
import CourseStructureEditor from "./CourseStructureEditor.vue";

const props = defineProps({
  workout: { type: Object, required: true },
});
const emit = defineEmits(["update:workout", "error"]);

// core 的结构编辑函数是纯函数，入口处自行深拷贝（src/clone.ts），
// 因此可以直接把响应式 workout 传进去，不需要在界面层再转普通对象。
function publish(workout) {
  emit("update:workout", workout);
}
</script>

<style scoped>
.workout-editor { width: 100%; }
</style>
