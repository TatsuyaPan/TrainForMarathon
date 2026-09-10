<template>
  <div class="fitness-page">
    <div class="page-hero">
      <t-typography-title level="h4">我的能力</t-typography-title>
      <p class="muted">能力是被课表直接引用的配速基准。可从自由配速计算器导入，也可在此调整。</p>
    </div>

  <t-card v-if="!fitness" :bordered="true">
    <t-typography-title level="h5">尚未建立能力</t-typography-title>
    <p class="muted">新建课表前需要先填写能力。去自由配速计算器推算并保存，或直接设置阈值配速。</p>
    <div class="btn-row">
      <t-button theme="primary" @click="$router.push('/paces')">去自由配速计算器</t-button>
      <t-button @click="promptSetSix">直接设置阈值配速</t-button>
    </div>
  </t-card>

  <template v-else>
    <t-card :bordered="true">
      <t-typography-title level="h5">当前能力</t-typography-title>
      <div class="kv">
        <span class="muted">基准模式</span>
        <span>{{ fitness.mode === "vdot" ? `VDOT ${fitness.vdot.toFixed(1)}${fitness.isBeginner ? "（新手表）" : ""}` : "6 秒规则（阈值配速）" }}</span>
      </div>
      <template v-if="fitness.mode === 'sixSecond'">
        <div class="kv"><span class="muted">阈值配速</span><span>{{ formatPace(fitness.thresholdPaceSecondsPerKm) }}</span></div>
      </template>
      <template v-else>
        <div class="kv">
          <span class="muted">成绩依据</span>
          <span>{{ fitness.raceResults.map((r) => `${labelFor(r.distanceM)} ${fmtHms(r.timeSeconds)}${r.label ? `（${r.label}）` : ""}${r.date ? ` · ${r.date}` : ""}`).join("；") }}</span>
        </div>
      </template>
      <div class="btn-row">
        <t-button theme="primary" @click="$router.push('/paces')">自由配速计算器（推算并导入）</t-button>
        <t-button v-if="fitness.mode === 'sixSecond'" @click="promptSetSix">调整阈值配速</t-button>
        <t-button theme="danger" variant="outline" @click="clearFitness">清除能力</t-button>
      </div>
    </t-card>

    <t-card :bordered="true" style="margin-top: 12px">
      <t-typography-title level="h5">当前各档配速</t-typography-title>
      <div v-for="row in paceRows" :key="row.key" class="pace-row">
        <span class="key" :style="{ background: colorOf(row.key) }">{{ row.key }}</span>
        <div>
          <div><strong>{{ row.name }}</strong> · {{ row.value }}</div>
          <div class="muted">{{ row.note }}</div>
        </div>
      </div>
    </t-card>
  </template>

  <p class="muted source-note">
    数据来源：6 秒规则（书 §1）与丹尼尔斯 VDOT 表（《丹尼尔斯经典跑步训练法》· Jack Daniels）；
    VDOT 实现参考开源 hoodarunner/running-coach-sft（Apache-2.0）。
  </p>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import {
  INTENSITY_COLORS,
  calculateSixSecondPaces,
  formatPace,
  pacesFromVdot,
} from "@core";
import {
  clearAthleteFitness,
  fitnessSavedHint,
  getAthlete,
  saveAthleteFitness,
} from "../app-context.js";

const athlete = ref(null);
const fitness = computed(() => {
  const a = athlete.value;
  if (!a) return null;
  if (a.vdot) return { mode: "vdot", vdot: a.vdot, raceResults: a.raceResults ?? [], isBeginner: a.isBeginner };
  if (a.thresholdPaceSecondsPerKm) return { mode: "sixSecond", thresholdPaceSecondsPerKm: a.thresholdPaceSecondsPerKm };
  return null;
});

const paceRows = computed(() => {
  const f = fitness.value;
  if (!f) return [];
  if (f.mode === "vdot") {
    const paces = pacesFromVdot(f.vdot);
    const range = (item) => `${formatPace(item.slow)} – ${formatPace(item.fast)}`;
    return [
      { key: "E", name: "轻松跑", value: range(paces.E), note: "VDOT 62-72%" },
      { key: "M", name: "马拉松配速", value: range(paces.M), note: "马拉松均配反推" },
      { key: "T", name: "阈值跑", value: range(paces.T), note: "VDOT 88.4%" },
      { key: "I", name: "最大摄氧量跑", value: range(paces.I), note: "VDOT 97.7%" },
      { key: "R", name: "重复跑", value: range(paces.R), note: "VDOT 105.8%" },
    ];
  }
  const paces = calculateSixSecondPaces(f.thresholdPaceSecondsPerKm);
  const range = (item) => (item ? `${formatPace(item.slow)} – ${formatPace(item.fast)}` : "—");
  return [
    { key: "E", name: "轻松跑", value: "按心率（≈阈值-40s）", note: "心率 65-78% 或 MAF180" },
    { key: "M", name: "马拉松配速", value: `≈ ${formatPace(f.thresholdPaceSecondsPerKm - 15)}（估算）`, note: "低于阈值约 15 秒" },
    { key: "T", name: "阈值跑", value: range(paces.T), note: "基准 = 阈值配速" },
    { key: "I", name: "最大摄氧量跑", value: range(paces.I), note: "6 秒规则" },
    { key: "R", name: "重复跑", value: range(paces.R), note: "6 秒规则" },
  ];
});

function colorOf(zone) {
  return INTENSITY_COLORS[zone] ?? "#9aa2ab";
}

function labelFor(meters) {
  const found = [1500, 3000, 5000, 8000, 10000, 21097.5, 42195].find((d) => Math.abs(d - meters) < 1);
  const labels = { 1500: "1500m", 3000: "3000m", 5000: "5k", 8000: "8k", 10000: "10k", 21097.5: "半马", 42195: "全马" };
  return labels[found] ?? `${meters}m`;
}

function fmtHms(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}` : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function promptSetSix() {
  const current = fitness.value?.mode === "sixSecond" ? fitness.value.thresholdPaceSecondsPerKm : 240;
  const input = window.prompt("阈值配速（秒/公里，如 240 = 4:00/km）：", String(current));
  if (input === null) return;
  const value = Number(input);
  if (!Number.isFinite(value) || value <= 0) { window.alert("请输入有效秒数"); return; }
  saveAthleteFitness({ mode: "sixSecond", thresholdPaceSecondsPerKm: Math.round(value) })
    .then(() => reload())
    .then(fitnessSavedHint)
    .then((hint) => { if (hint) window.alert(hint.replace(/^；/, "")); });
}

async function clearFitness() {
  if (!window.confirm("清除能力后将无法直接生成课表（需重新填写）。确定清除？")) return;
  await clearAthleteFitness();
  await reload();
}

async function reload() {
  athlete.value = await getAthlete();
}

onMounted(reload);
</script>

<style scoped>
.kv { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
.kv span:last-child { font-weight: 600; text-align: right; }
.pace-row { margin-top: 10px; display: flex; align-items: center; gap: 12px; }
.key {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: 10px; color: #fff;
  font-weight: 700; flex-shrink: 0;
}
.source-note { margin-top: 16px; }
</style>
