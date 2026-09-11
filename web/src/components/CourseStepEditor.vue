<template>
  <div class="step-editor" data-testid="step-editor">
    <header class="step-editor-head">
      <strong>{{ heading }}</strong>
      <button type="button" class="close" aria-label="关闭步骤编辑" @click="$emit('close')">✕</button>
    </header>

    <template v-if="segment.kind === 'repeat'">
      <label class="field">
        <span>重复次数</span>
        <input data-testid="repeat-count" type="number" min="1" step="1" :value="segment.repetitions" @change="setRepetitions" />
      </label>
      <label class="field">
        <span>循环备注</span>
        <input data-testid="note" type="text" :value="segment.note ?? ''" placeholder="可选" @input="setNote" />
      </label>
      <p class="muted">循环内的步骤在上方结构树中编辑；支持继续嵌套循环。</p>
    </template>

    <template v-else>
      <template v-if="segment.kind !== 'rest'">
        <label class="field">
          <span>持续方式</span>
          <select data-testid="load-type" :value="segment.load.type" @change="setLoadType">
            <option value="time">时间</option>
            <option value="distance">距离</option>
          </select>
        </label>
      </template>

      <div class="field-row">
        <label class="field">
          <span>{{ segment.kind === "rest" ? "休息时长" : "数值" }}</span>
          <input data-testid="load-amount" type="number" min="0" step="0.5" :value="amount" @change="setAmount" />
        </label>
        <label class="field">
          <span>单位</span>
          <select v-if="segment.kind !== 'rest'" data-testid="load-unit" :value="unit" @change="setUnit">
            <option v-for="option in unitOptions" :key="option" :value="option">{{ UNIT_LABELS[option] }}</option>
          </select>
          <span v-else class="unit-readonly">{{ UNIT_LABELS[unit] }}</span>
        </label>
      </div>

      <template v-if="segment.kind === 'run'">
        <label class="field">
          <span>主目标</span>
          <select data-testid="target-type" :value="segment.target.type" @change="setTargetType">
            <option value="daniels">Daniels 强度档</option>
            <option value="pace-range">自定义配速范围</option>
            <option value="heart-rate">心率百分比</option>
            <option value="heart-rate-absolute">绝对心率</option>
            <option value="rpe">RPE 主目标</option>
          </select>
        </label>

        <label v-if="segment.target.type === 'daniels'" class="field">
          <span>强度档</span>
          <select data-testid="target-zone" :value="segment.target.zone" @change="setZone">
            <option v-for="zone in DANIELS_ZONES" :key="zone" :value="zone">{{ zone }}</option>
          </select>
        </label>

        <div v-else-if="segment.target.type === 'pace-range'" class="field-row">
          <label class="field">
            <span>快端（秒/公里）</span>
            <input data-testid="pace-fast" type="number" min="90" max="900" :value="segment.target.fastSecondsPerKm" @change="setPaceRange('fast', $event)" />
          </label>
          <label class="field">
            <span>慢端（秒/公里）</span>
            <input data-testid="pace-slow" type="number" min="90" max="900" :value="segment.target.slowSecondsPerKm" @change="setPaceRange('slow', $event)" />
          </label>
        </div>

        <template v-else-if="segment.target.type === 'heart-rate'">
          <div class="field-row">
            <label class="field">
              <span>下限 %</span>
              <input data-testid="hr-min" type="number" min="40" max="100" :value="segment.target.minPercent" @change="setHeartRate('min', $event)" />
            </label>
            <label class="field">
              <span>上限 %</span>
              <input data-testid="hr-max" type="number" min="40" max="100" :value="segment.target.maxPercent" @change="setHeartRate('max', $event)" />
            </label>
          </div>
          <label class="field">
            <span>基准</span>
            <select data-testid="hr-basis" :value="segment.target.basis" @change="setHeartRateBasis">
              <option value="max">最大心率 %</option>
              <option value="reserve">储备心率 %</option>
            </select>
          </label>
        </template>

        <div v-else-if="segment.target.type === 'heart-rate-absolute'" class="field-row">
          <label class="field">
            <span>下限 bpm</span>
            <input data-testid="bpm-min" type="number" min="40" max="230" :value="segment.target.minBpm" @change="setBpm('min', $event)" />
          </label>
          <label class="field">
            <span>上限 bpm</span>
            <input data-testid="bpm-max" type="number" min="40" max="230" :value="segment.target.maxBpm" @change="setBpm('max', $event)" />
          </label>
        </div>

        <label v-else class="field">
          <span>RPE 目标</span>
          <input data-testid="target-rpe" type="number" min="1" max="10" :value="segment.target.value" @change="setTargetRpe" />
        </label>

        <div class="field-row">
          <label class="field">
            <span>辅助 RPE</span>
            <input data-testid="rpe" type="number" min="1" max="10" :value="segment.rpe ?? ''" placeholder="可选" @change="setRpe" />
          </label>
          <label class="field">
            <span>坡度 %</span>
            <input data-testid="incline" type="number" min="0" max="20" :value="segment.inclinePercent ?? ''" placeholder="可选" @change="setIncline" />
          </label>
        </div>
      </template>

      <label class="field">
        <span>备注</span>
        <input data-testid="note" type="text" :value="segment.note ?? ''" placeholder="可选" @input="setNote" />
      </label>

      <p v-if="segment.kind === 'recovery'" class="hint">
        保持缓慢跑动，用于组间主动恢复；不等同于严格 E 配速训练。
      </p>
      <p v-if="segment.kind === 'rest'" class="hint">
        停止跑步或低活动等待；计入训练总耗时，不产生距离。
      </p>
    </template>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <div class="step-editor-actions">
      <button type="button" class="danger" data-testid="remove-step" @click="$emit('remove')">删除步骤</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { DANIELS_ZONES, RUN_ROLE_LABELS, formatDurationLabel } from "@core";

const props = defineProps({
  segment: { type: Object, required: true },
  role: { type: String, default: "main" },
});
const emit = defineEmits(["update:segment", "remove", "close"]);

const UNIT_LABELS = { min: "分钟", s: "秒", km: "公里", m: "米" };
const error = ref("");

const heading = computed(() => {
  if (props.segment.kind === "repeat") return "循环设置";
  if (props.segment.kind === "recovery") return "主动恢复";
  if (props.segment.kind === "rest") return "被动休息";
  return RUN_ROLE_LABELS[props.role] ?? "跑步步骤";
});

const unitOptions = computed(() => {
  if (props.segment.kind === "rest") return ["min", "s"];
  return props.segment.load.type === "time" ? ["min", "s"] : ["km", "m"];
});

const currentLoad = computed(() => {
  if (props.segment.kind === "rest") {
    const seconds = props.segment.durationSeconds;
    return seconds % 60 === 0 ? { amount: seconds / 60, unit: "min" } : { amount: seconds, unit: "s" };
  }
  const load = props.segment.load;
  if (load.type === "time") {
    return load.seconds % 60 === 0 ? { amount: load.seconds / 60, unit: "min" } : { amount: load.seconds, unit: "s" };
  }
  return load.meters >= 1000 && load.meters % 100 === 0
    ? { amount: load.meters / 1000, unit: "km" }
    : { amount: load.meters, unit: "m" };
});

const amount = computed(() => currentLoad.value.amount);
const unit = computed(() => currentLoad.value.unit);

function update(patch) {
  emit("update:segment", { ...props.segment, ...patch });
}

function toSeconds(value, unitValue) {
  return unitValue === "min" ? value * 60 : value;
}

function toMeters(value, unitValue) {
  return unitValue === "km" ? value * 1000 : value;
}

function applyLoad(value, unitValue) {
  error.value = "";
  if (!Number.isFinite(value) || value <= 0) {
    error.value = "负荷必须大于 0";
    return;
  }
  if (unitValue === "min" || unitValue === "s") {
    const seconds = toSeconds(value, unitValue);
    if (!Number.isInteger(seconds)) {
      error.value = "时间需要能无损转换为整数秒";
      return;
    }
    update({ load: { type: "time", seconds } });
    return;
  }
  const meters = toMeters(value, unitValue);
  if (!Number.isInteger(meters)) {
    error.value = "距离需要能无损转换为整数米";
    return;
  }
  update({ load: { type: "distance", meters } });
}

function setAmount(event) {
  const value = Number(event.target.value);
  if (props.segment.kind === "rest") {
    error.value = "";
    if (unit.value === "min" && !Number.isInteger(value * 60)) {
      error.value = "休息时间需要能无损转换为整数秒";
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      error.value = "休息时间必须大于 0";
      return;
    }
    update({ durationSeconds: unit.value === "min" ? value * 60 : value });
    return;
  }
  applyLoad(value, unit.value);
}

function setUnit(event) {
  const nextUnit = event.target.value;
  const load = props.segment.load;
  const sameFamilyTime = ["min", "s"].includes(nextUnit) && load.type === "time";
  const sameFamilyDistance = ["km", "m"].includes(nextUnit) && load.type === "distance";
  if (sameFamilyTime) {
    const converted = nextUnit === "min" ? load.seconds / 60 : load.seconds;
    applyLoad(converted, nextUnit);
    return;
  }
  if (sameFamilyDistance) {
    const converted = nextUnit === "km" ? load.meters / 1000 : load.meters;
    applyLoad(converted, nextUnit);
    return;
  }
  applyLoad(currentLoad.value.amount, nextUnit);
}

function setLoadType(event) {
  error.value = "";
  const type = event.target.value;
  if (type === "time") {
    update({ load: { type: "time", seconds: 300 } });
    return;
  }
  update({ load: { type: "distance", meters: 800 } });
}

function setTargetType(event) {
  const type = event.target.value;
  const defaults = {
    daniels: { type: "daniels", zone: "E" },
    "pace-range": { type: "pace-range", fastSecondsPerKm: 285, slowSecondsPerKm: 300 },
    "heart-rate": { type: "heart-rate", basis: "max", minPercent: 65, maxPercent: 78 },
    "heart-rate-absolute": { type: "heart-rate-absolute", minBpm: 145, maxBpm: 160 },
    rpe: { type: "rpe", value: 6 },
  };
  update({ target: defaults[type] });
}

function setZone(event) {
  update({ target: { type: "daniels", zone: event.target.value } });
}

function setPaceRange(bound, event) {
  const value = Number(event.target.value);
  error.value = "";
  if (!Number.isInteger(value) || value < 90 || value > 900) {
    error.value = "配速范围应为 90-900 秒/公里";
    return;
  }
  const next = { ...props.segment.target, [bound === "fast" ? "fastSecondsPerKm" : "slowSecondsPerKm"]: value };
  if (next.fastSecondsPerKm >= next.slowSecondsPerKm) {
    error.value = "快端必须小于慢端";
    return;
  }
  update({ target: next });
}

function setHeartRate(bound, event) {
  const value = Number(event.target.value);
  error.value = "";
  if (!Number.isInteger(value) || value < 40 || value > 100) {
    error.value = "心率百分比范围应为 40-100%";
    return;
  }
  const next = { ...props.segment.target, [bound === "min" ? "minPercent" : "maxPercent"]: value };
  if (next.minPercent >= next.maxPercent) {
    error.value = "下限必须小于上限";
    return;
  }
  update({ target: next });
}

function setHeartRateBasis(event) {
  update({ target: { ...props.segment.target, basis: event.target.value } });
}

function setBpm(bound, event) {
  const value = Number(event.target.value);
  error.value = "";
  if (!Number.isInteger(value) || value < 40 || value > 230) {
    error.value = "绝对心率范围应为 40-230 bpm";
    return;
  }
  const next = { ...props.segment.target, [bound === "min" ? "minBpm" : "maxBpm"]: value };
  if (next.minBpm >= next.maxBpm) {
    error.value = "下限必须小于上限";
    return;
  }
  update({ target: next });
}

function setTargetRpe(event) {
  const value = Number(event.target.value);
  error.value = "";
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    error.value = "RPE 目标范围应为 1-10";
    return;
  }
  update({ target: { type: "rpe", value } });
}

function setRpe(event) {
  const raw = event.target.value;
  error.value = "";
  if (raw === "") {
    update({ rpe: undefined });
    return;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 10) {
    error.value = "辅助 RPE 范围应为 1-10";
    return;
  }
  update({ rpe: value });
}

function setIncline(event) {
  const raw = event.target.value;
  error.value = "";
  if (raw === "") {
    update({ inclinePercent: undefined });
    return;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 20) {
    error.value = "坡度范围应为 0-20%";
    return;
  }
  update({ inclinePercent: value });
}

function setRepetitions(event) {
  const value = Number(event.target.value);
  error.value = "";
  if (!Number.isInteger(value) || value <= 0) {
    error.value = "循环次数必须为正整数";
    return;
  }
  update({ repetitions: value });
}

function setNote(event) {
  const value = event.target.value;
  update({ note: value === "" ? undefined : value });
}

</script>

<style scoped>
.step-editor { display: grid; gap: 10px; }
.step-editor-head { display: flex; align-items: center; justify-content: space-between; }
.step-editor-head .close {
  border: 1px solid var(--td-component-stroke);
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
  width: 26px;
  height: 26px;
}
.field, .field-row { display: grid; gap: 4px; }
.field-row { grid-template-columns: 1fr 1fr; gap: 8px; display: grid; }
.field span { font-size: 12px; color: #607066; }
.field input, .field select {
  padding: 5px 8px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  font-size: 13px;
  background: #fff;
}
.unit-readonly { font-size: 13px; color: #17211b; padding: 5px 2px; }
.hint, .muted { margin: 0; color: #607066; font-size: 12px; }
.error { margin: 0; color: #d54941; font-size: 13px; }
.step-editor-actions { display: flex; gap: 8px; }
.step-editor-actions button {
  font-size: 13px;
  padding: 5px 12px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.step-editor-actions button.danger { color: #d54941; border-color: #f3c9c6; }
</style>
