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
      <t-button data-testid="open-six" @click="openSixDialog">直接设置阈值配速</t-button>
    </div>
  </t-card>

  <template v-else>
    <t-card :bordered="true">
      <t-typography-title level="h5">当前能力</t-typography-title>
      <div class="kv">
        <span class="muted">基准模式</span>
        <span data-testid="fitness-mode">{{ modeLabel }}</span>
      </div>
      <div v-if="fitness.mode === 'sixSecond'" class="kv">
        <span class="muted">阈值配速</span>
        <span>{{ formatPace(fitness.thresholdPaceSecondsPerKm) }}</span>
      </div>
      <div v-else class="kv">
        <span class="muted">成绩依据</span>
        <span>{{ raceSummary }}</span>
      </div>
      <div class="btn-row">
        <t-button theme="primary" @click="$router.push('/paces')">自由配速计算器（推算并导入）</t-button>
        <t-button v-if="fitness.mode === 'sixSecond'" data-testid="open-six" @click="openSixDialog">调整阈值配速</t-button>
        <t-button theme="danger" variant="outline" data-testid="clear-fitness" @click="clearFitness">清除能力</t-button>
      </div>
    </t-card>

    <t-card :bordered="true" style="margin-top: 12px">
      <t-typography-title level="h5">当前各档配速</t-typography-title>
      <div v-for="row in paceRows" :key="row.zone" class="pace-row" data-testid="pace-row">
        <span class="key" :style="{ background: colorOf(row.zone) }">{{ row.zone }}</span>
        <div>
          <div><strong>{{ row.name }}</strong> · {{ row.value }}</div>
          <div class="muted">{{ row.note }}</div>
        </div>
      </div>
    </t-card>
  </template>

  <t-dialog v-model:visible="sixVisible" header="设置阈值配速" :footer="false" width="420px">
    <div class="six-dialog" data-testid="six-dialog">
      <p class="muted">阈值配速 ≈ 全力跑约 1 小时的配速（≈ 10k PB / T 配速），是 6 秒规则的基准。</p>
      <div class="six-inputs">
        <t-input-number data-testid="six-min" v-model="sixMin" :min="2" :max="9" @change="updatePreview" />
        <span class="muted">分</span>
        <t-input-number data-testid="six-sec" v-model="sixSec" :min="0" :max="59" @change="updatePreview" />
        <span class="muted">秒 / 公里</span>
      </div>
      <p v-if="sixError" class="error" data-testid="six-error">{{ sixError }}</p>
      <div v-else class="six-preview">
        <div v-for="row in sixPreview" :key="row.zone" class="preview-row">
          <span class="key small" :style="{ background: colorOf(row.zone) }">{{ row.zone }}</span>
          <span><strong>{{ row.name }}</strong> · {{ row.value }}</span>
        </div>
      </div>
      <div class="dialog-actions">
        <t-button variant="outline" @click="sixVisible = false">取消</t-button>
        <t-button theme="primary" data-testid="six-save" @click="saveSix">保存为我的能力</t-button>
      </div>
    </div>
  </t-dialog>

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
  athleteFitness,
  fitnessModeLabel,
  fitnessPaceRows,
  formatPace,
  raceResultsSummary,
  sixSecondPaceRows,
} from "@core";
import {
  clearAthleteFitness,
  fitnessSavedHint,
  getAthlete,
  saveAthleteFitness,
} from "../app-context.js";

const athlete = ref(null);
// 能力摘要与档位文案全部来自 core：同一份能力在 web / 小程序里说法一致
const fitness = computed(() => athleteFitness(athlete.value));
const modeLabel = computed(() => fitnessModeLabel(fitness.value));
const raceSummary = computed(() => raceResultsSummary(fitness.value?.raceResults));
const paceRows = computed(() => fitnessPaceRows(fitness.value));

const sixVisible = ref(false);
const sixMin = ref(4);
const sixSec = ref(0);
const sixError = ref("");
const sixPreview = ref([]);

function colorOf(zone) {
  return INTENSITY_COLORS[zone] ?? "#9aa2ab";
}

function openSixDialog() {
  const current = fitness.value?.mode === "sixSecond" ? fitness.value.thresholdPaceSecondsPerKm : 240;
  sixMin.value = Math.floor(current / 60);
  sixSec.value = current % 60;
  updatePreview();
  sixVisible.value = true;
}

/** 对话框里边改边预览档位表：保存前就能看到会变成什么配速 */
function updatePreview() {
  const threshold = sixMin.value * 60 + sixSec.value;
  try {
    sixPreview.value = sixSecondPaceRows(threshold);
    sixError.value = "";
  } catch {
    sixPreview.value = [];
    sixError.value = `阈值配速需大于 45 秒/公里（当前 ${formatPace(threshold)}）`;
  }
}

async function saveSix() {
  updatePreview();
  if (sixError.value) return;
  try {
    await saveAthleteFitness({ mode: "sixSecond", thresholdPaceSecondsPerKm: sixMin.value * 60 + sixSec.value });
    sixVisible.value = false;
    await reload();
    const hint = await fitnessSavedHint();
    if (hint) window.alert(hint.replace(/^；/, ""));
  } catch (error) {
    sixError.value = error instanceof Error ? error.message : "保存失败";
  }
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
.key.small { width: 26px; height: 26px; border-radius: 7px; font-size: 12px; }
.six-dialog { display: grid; gap: 10px; }
.six-inputs { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.six-inputs :deep(.t-input-number) { width: 96px; }
.six-preview { display: grid; gap: 6px; }
.preview-row { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.error { color: #d54941; margin: 0; font-size: 13px; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px; }
.source-note { margin-top: 16px; }
</style>
