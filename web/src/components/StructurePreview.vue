<template>
  <div class="structure-preview-wrap">
    <div class="structure-preview" data-testid="structure-preview" role="img" :aria-label="ariaLabel">
      <span
        v-for="(block, index) in blocks"
        :key="index"
        class="preview-block"
        :class="`preview-${block.kind}`"
        :style="{ background: block.color, flexGrow: block.weight || 1 }"
        :title="block.label"
      />
    </div>
    <p v-if="mixedUnits" class="preview-note muted">混合单位，完整耗时需结合个人配速估算。</p>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps({
  blocks: { type: Array, default: () => [] },
  mixedUnits: { type: Boolean, default: false },
  compressed: { type: Boolean, default: false },
});

const ariaLabel = computed(() => {
  const parts = props.blocks.map((block) => block.label).filter((label) => label && label !== "…");
  const suffix = props.compressed ? "，课程较长，预览已压缩" : "";
  return parts.length > 0 ? `训练结构预览：${parts.join("、")}${suffix}` : "训练结构预览";
});
</script>

<style scoped>
.structure-preview-wrap { width: 100%; }
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
</style>
