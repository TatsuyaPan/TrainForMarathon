<template>
  <ul class="structure-tree" :class="`depth-${Math.min(depth, 2)}`" :data-testid="depth === 0 ? 'structure-tree' : undefined">
    <li v-for="node in nodes" :key="node.id" class="structure-node" :class="`node-${node.kind}`">
      <template v-if="node.kind === 'repeat'">
        <div class="repeat-block">
          <div class="repeat-head">
            <button
              type="button"
              class="collapse-toggle"
              :aria-expanded="!isCollapsed(node)"
              :aria-label="`${isCollapsed(node) ? '展开' : '收起'}循环：重复 ${node.repetitions} 次`"
              :data-testid="`toggle-repeat-${node.id}`"
              @click="toggle(node)"
            >
              {{ isCollapsed(node) ? "▸" : "▾" }}
            </button>
            <span class="repeat-badge">重复 {{ node.repetitions }} 次</span>
            <span v-if="depth >= 2" class="depth-badge">层级 {{ depth + 1 }}</span>
            <span v-if="node.note" class="muted">· {{ node.note }}</span>
          </div>
          <WorkoutStructure v-if="!isCollapsed(node)" :nodes="node.children" :depth="depth + 1" />
          <p v-else class="muted collapsed-hint">已收起 {{ node.children.length }} 个步骤</p>
        </div>
      </template>
      <template v-else>
        <div class="step-row" :data-testid="`structure-step-${node.id}`">
          <span class="step-dot" :style="{ background: node.color }" aria-hidden="true" />
          <span class="step-type">{{ node.stepTypeLabel }}</span>
          <span class="step-load">{{ node.loadLabel }}</span>
          <span v-if="node.targetLabel" class="step-target">{{ node.targetLabel }}</span>
          <span v-if="node.rpeLabel" class="muted">{{ node.rpeLabel }}</span>
          <span v-if="node.inclineLabel" class="muted">{{ node.inclineLabel }}</span>
          <span v-if="node.note" class="muted">· {{ node.note }}</span>
        </div>
      </template>
    </li>
  </ul>
</template>

<script setup>
import { ref } from "vue";

defineProps({
  nodes: { type: Array, default: () => [] },
  depth: { type: Number, default: 0 },
});

/**
 * 折叠状态只属于界面：按路径记录，不写进 Workout 也不进 DSL。
 * 每一层循环各自独立折叠，父层收起时子层随之下线（折叠状态因此自然重置）。
 */
const collapsed = ref(new Set());

function isCollapsed(node) {
  return collapsed.value.has(node.path.join("."));
}

function toggle(node) {
  const key = node.path.join(".");
  const next = new Set(collapsed.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  collapsed.value = next;
}
</script>

<style scoped>
.structure-tree { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.structure-node { margin: 0; }
.step-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 7px 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  background: #fff;
}
.step-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.step-type { font-weight: 600; }
.step-load { font-variant-numeric: tabular-nums; }
.repeat-block {
  border: 1px solid var(--td-component-stroke);
  border-left: 3px solid #8b93a1;
  border-radius: 10px;
  padding: 8px 10px;
  background: #fbfcfb;
}
.repeat-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.collapse-toggle {
  width: 22px;
  height: 22px;
  padding: 0;
  line-height: 1;
  font-size: 12px;
  color: #35424f;
  background: #fff;
  border: 1px solid var(--td-component-stroke);
  border-radius: 6px;
  cursor: pointer;
}
.collapse-toggle:focus-visible { outline: 2px solid #357a52; outline-offset: 2px; }
.collapsed-hint { margin: 0; font-size: 12px; }
.repeat-badge {
  font-size: 12px;
  font-weight: 600;
  color: #35424f;
  background: #e8edf2;
  border-radius: 999px;
  padding: 2px 10px;
}
.depth-badge { font-size: 12px; color: #607066; }
.depth-1 { margin-left: 10px; }
.depth-2 { margin-left: 10px; }
</style>
