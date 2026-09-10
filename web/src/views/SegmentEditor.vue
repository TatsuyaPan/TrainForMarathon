<template>
  <div v-if="segment.kind === 'set'" class="set-block">
    <div class="set-head">
      <t-tag variant="light">组</t-tag>
      <t-input-number v-model="segment.repeats" :min="1" size="small" theme="normal" style="width: 90px" />
      <span class="muted">×</span>
      <t-space>
        <t-button size="small" variant="outline" @click="emit('move', path, -1)">↑</t-button>
        <t-button size="small" variant="outline" @click="emit('move', path, 1)">↓</t-button>
        <t-button size="small" variant="outline" @click="emit('copy', path)">复制</t-button>
        <t-button size="small" theme="danger" variant="outline" @click="emit('remove', path)">删除</t-button>
      </t-space>
    </div>
    <div class="set-body">
      <SegmentEditor
        v-for="(child, index) in segment.segments"
        :key="`${path.join('.')}.${index}`"
        :segment="child"
        :path="[...path, index]"
        @move="emit('move', $event, 1)"
        @copy="emit('copy', $event)"
        @remove="emit('remove', $event)"
      />
      <div v-if="segment.segments.length === 0" class="muted">（组内为空）</div>
    </div>
    <div class="set-add">
      <t-button size="small" @click="emit('add-step', path)">+ 组内步骤</t-button>
      <t-button size="small" @click="emit('add-set', path)">+ 组内组</t-button>
    </div>
  </div>

  <div v-else class="step-row">
    <span class="intensity-dot" :style="{ background: dotColor }"></span>
    <t-select v-model="segment.intensity.type" size="small" style="width: 120px" @change="onIntensityTypeChange">
      <t-option v-for="zone in ZONES" :key="zone" :value="'pace'" :label="`@${zone} 档`" v-show="false" />
      <t-option value="pace" label="配速档" />
      <t-option value="paceRange" label="自定义配速 P" />
      <t-option value="heartRate" label="心率 %" />
      <t-option value="custom" label="自定义描述" />
    </t-select>
    <template v-if="segment.intensity.type === 'pace'">
      <t-select v-model="segment.intensity.zone" size="small" style="width: 90px">
        <t-option v-for="zone in ZONES" :key="zone" :value="zone" :label="zone" />
      </t-select>
    </template>
    <template v-else-if="segment.intensity.type === 'paceRange'">
      <t-input-number v-model="segment.intensity.fastSecondsPerKm" :min="90" :max="900" size="small" style="width: 90px" />
      <span class="muted">-</span>
      <t-input-number v-model="segment.intensity.slowSecondsPerKm" :min="90" :max="900" size="small" style="width: 90px" />
      <span class="muted">s/km</span>
    </template>
    <template v-else-if="segment.intensity.type === 'heartRate'">
      <t-input-number v-model="segment.intensity.minPercent" :min="40" :max="100" size="small" style="width: 80px" />
      <span class="muted">-</span>
      <t-input-number v-model="segment.intensity.maxPercent" :min="40" :max="100" size="small" style="width: 80px" />
      <span class="muted">%</span>
    </template>
    <template v-else>
      <t-input v-model="segment.intensity.label" placeholder="强度描述" size="small" style="width: 120px" />
    </template>

    <t-select v-model="segment.load.type" size="small" style="width: 80px" @change="onLoadTypeChange">
      <t-option value="time" label="时间" />
      <t-option value="distance" label="距离" />
    </t-select>
    <t-input-number
      v-if="segment.load.type === 'time'"
      v-model="segment.load.minutes" :min="0.1" :step="0.5" size="small" style="width: 90px"
    />
    <t-input-number
      v-else
      v-model="segment.load.meters" :min="50" :step="50" size="small" style="width: 100px"
    />
    <span class="muted">{{ segment.load.type === 'time' ? 'min' : 'm' }}</span>

    <span class="muted">休息</span>
    <t-select v-model="restType" size="small" style="width: 70px">
      <t-option value="" label="无" />
      <t-option value="time" label="时间" />
      <t-option value="distance" label="距离" />
    </t-select>
    <template v-if="segment.rest && segment.rest.type === 'time'">
      <t-input-number v-model="segment.rest.minutes" :min="0.1" :step="0.5" size="small" style="width: 90px" />
      <span class="muted">min</span>
    </template>
    <template v-else-if="segment.rest && segment.rest.type === 'distance'">
      <t-input-number v-model="segment.rest.meters" :min="50" :step="50" size="small" style="width: 90px" />
      <span class="muted">m</span>
    </template>
    <t-select v-if="segment.rest" v-model="segment.rest.mode" size="small" style="width: 80px">
      <t-option value="jog" label="慢跑" />
      <t-option value="rest" label="停休" />
    </t-select>

    <t-input-number v-model="rpeModel" :min="1" :max="10" size="small" placeholder="RPE" style="width: 70px" />
    <t-input-number v-model="inclineModel" :min="0" :max="20" size="small" placeholder="坡度%" style="width: 80px" />
    <t-select v-model="phaseModel" size="small" style="width: 80px">
      <t-option value="" label="主课" />
      <t-option value="warmup" label="热身" />
      <t-option value="cooldown" label="冷身" />
    </t-select>

    <t-space>
      <t-button size="small" variant="outline" @click="emit('move', path, -1)">↑</t-button>
      <t-button size="small" variant="outline" @click="emit('move', path, 1)">↓</t-button>
      <t-button size="small" variant="outline" @click="emit('copy', path)">复制</t-button>
      <t-button size="small" theme="danger" variant="outline" @click="emit('remove', path)">删除</t-button>
    </t-space>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { INTENSITY_COLORS } from "@core";

const props = defineProps({
  segment: { type: Object, required: true },
  path: { type: Array, required: true },
});
const emit = defineEmits(["move", "copy", "remove", "add-step", "add-set"]);

const ZONES = ["E", "M", "T", "I", "R", "ST"];
const dotColor = computed(() => {
  const zone = props.segment.intensity?.zone;
  return INTENSITY_COLORS[zone] ?? "#9aa2ab";
});

const restType = computed({
  get: () => props.segment.rest?.type ?? "",
  set: (value) => {
    if (!value) props.segment.rest = undefined;
    else if (value === "time") props.segment.rest = { type: "time", minutes: 1, mode: "jog" };
    else props.segment.rest = { type: "distance", meters: 400, mode: "jog" };
  },
});

const rpeModel = computed({
  get: () => props.segment.rpe ?? null,
  set: (value) => { props.segment.rpe = value === null || value === undefined ? undefined : Number(value); },
});

const inclineModel = computed({
  get: () => props.segment.inclinePercent ?? null,
  set: (value) => { props.segment.inclinePercent = value === null || value === undefined ? undefined : Number(value); },
});

const phaseModel = computed({
  get: () => props.segment.phase ?? "",
  set: (value) => { props.segment.phase = value || undefined; },
});

function onIntensityTypeChange(value) {
  const seg = props.segment;
  if (value === "paceRange") seg.intensity = { type: "paceRange", fastSecondsPerKm: 285, slowSecondsPerKm: 300 };
  else if (value === "heartRate") seg.intensity = { type: "heartRate", minPercent: 65, maxPercent: 78 };
  else if (value === "custom") seg.intensity = { type: "custom", label: "" };
  else seg.intensity = { type: "pace", zone: "T" };
}

function onLoadTypeChange(value) {
  props.segment.load = value === "time" ? { type: "time", minutes: 5 } : { type: "distance", meters: 800 };
}
</script>

<style scoped>
.set-block {
  margin: 8px 0 8px 8px;
  padding: 10px;
  border: 1px dashed var(--td-component-stroke);
  border-radius: 10px;
}
.set-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.set-body { margin-top: 8px; }
.set-add { margin-top: 8px; }
.step-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 6px 0;
  padding: 8px 10px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 10px;
  background: #fff;
}
.intensity-dot { display: inline-block; width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
</style>
