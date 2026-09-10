<template>
  <div class="page-hero">
    <t-typography-title level="h4">自由配速计算器</t-typography-title>
    <p class="muted">手动推算成绩，完全自由，只为一个结果。两套体系：6 秒规则（单成绩快速）与 VDOT（多成绩推算）。</p>
  </div>

  <t-tabs v-model="mode">
    <t-tab-panel value="six" label="6 秒规则（10k PB）">
      <t-card :bordered="true">
        <t-form label-align="left">
          <t-form-item label="10k PB 配速">
            <t-input-number v-model="sixMin" :min="2" :max="8" style="width: 90px" />
            <span style="margin: 0 6px">:</span>
            <t-input-number v-model="sixSec" :min="0" :max="59" style="width: 90px" />
            <span style="margin-left: 6px" class="muted">/km</span>
          </t-form-item>
        </t-form>
        <t-button theme="primary" @click="calcSix">计算配速</t-button>
      </t-card>
      <div v-if="sixResult" class="result-block">
        <t-card v-for="row in sixResult" :key="row.zone" :bordered="true" class="pace-row">
          <span class="key" :style="{ background: colorOf(row.zone) }">{{ row.zone }}</span>
          <div>
            <div><strong>{{ row.name }}</strong> · {{ row.value }}</div>
            <div class="muted">{{ row.note }}</div>
          </div>
        </t-card>
        <t-button theme="primary" @click="saveSix">保存为我的能力</t-button>
      </div>
    </t-tab-panel>

    <t-tab-panel value="vdot" label="VDOT（多成绩推算）">
      <t-card :bordered="true">
        <div class="section-title"><strong>近期最佳成绩（请填写全力 all-out 成绩，至少 1 个，可多条）</strong></div>
        <div v-for="(result, index) in results" :key="index" class="race-row">
          <t-select v-model="result.distanceKey" style="width: 110px" @change="onDistanceChange(result)">
            <t-option v-for="d in COMMON_RACE_DISTANCES" :key="d.key" :value="d.key" :label="d.label" />
          </t-select>
          <t-input v-model="result.timeText" placeholder="45:00 或 1:24:30" style="width: 130px" />
          <t-date-picker v-model="result.date" placeholder="取得日期" style="width: 150px" />
          <t-input v-model="result.note" placeholder="备注（可选）" style="width: 140px" />
          <t-button size="small" theme="danger" variant="text" @click="results.splice(index, 1)">删除</t-button>
        </div>
        <div class="btn-row">
          <t-button @click="addResult">+ 添加成绩</t-button>
          <t-button theme="primary" @click="calcVdot">推算 VDOT 与训练配速</t-button>
        </div>
        <p class="muted">成绩带取得日期：超过 180 天自动忽略；60 天内 10k-16km 成绩优先级最高；30 天内视为同时段；同档按 15/16km &gt; 10km &gt; 半马排序。</p>
      </t-card>

      <div v-if="vdotResult" class="result-block">
        <t-card :bordered="true" class="stats-card">
          <div class="stats-row">
            <div>
              <div class="stats-number">{{ vdotResult.vdot.toFixed(1) }}</div>
              <div class="muted">VDOT · 最高能力基准</div>
            </div>
            <div class="muted">
              依据成绩：{{ selectedLabel }}{{ vdotResult.ignoredCount > 0 ? `（忽略 ${vdotResult.ignoredCount} 条超期）` : "" }}
            </div>
          </div>
        </t-card>

        <t-card v-if="beginnerRow" :bordered="true" class="beginner-card">
          <t-typography-title level="h5">新手 / 低 VDOT 配速表（原书表 5-3）</t-typography-title>
          <div class="split-grid">
            <div v-for="cell in beginnerCells" :key="cell.label" class="split-cell">
              <span class="muted">{{ cell.label }}</span>
              <strong>{{ cell.value }}</strong>
            </div>
          </div>
          <p class="muted">M 马拉松预估总时间：{{ formatRaceTime(beginnerRow.marathonTotalSeconds) }}</p>
        </t-card>

        <t-card v-for="row in vdotRows" :key="row.zone" :bordered="true" class="pace-row">
          <span class="key" :style="{ background: colorOf(row.zone) }">{{ row.zone }}</span>
          <div>
            <div><strong>{{ row.name }}</strong> · {{ row.value }}</div>
            <div class="muted">{{ row.note }}</div>
          </div>
        </t-card>

        <t-button theme="primary" @click="saveVdot">保存为我的能力</t-button>
      </div>
    </t-tab-panel>
  </t-tabs>

  <p class="muted source-note">
    数据来源：6 秒规则（书 §1）与丹尼尔斯 VDOT 表（《丹尼尔斯经典跑步训练法》· Jack Daniels）；
    VDOT 计算实现参考开源 hoodarunner/running-coach-sft（HuggingFace，Apache-2.0 许可）。
  </p>
</template>

<script setup>
import { ref } from "vue";
import {
  COMMON_RACE_DISTANCES,
  INTENSITY_COLORS,
  assessFromResults,
  formatRaceTime,
  lookupBeginnerRow,
  parseRaceTime,
  sixSecondPaceRows,
  vdotFromRace,
  vdotPaceRows,
} from "@core";
import { fitnessSavedHint, saveAthleteFitness } from "../app-context.js";
import { notifyError, notifySuccess } from "../ui-feedback.js";

const mode = ref("vdot");
const today = new Date().toISOString().slice(0, 10);
const sixMin = ref(4);
const sixSec = ref(0);
const sixResult = ref(null);
const vdotResult = ref(null);
const beginnerRow = ref(null);
const vdotRows = ref([]);
const selectedLabel = ref("");
const beginnerCells = ref([]);

const results = ref([
  { distanceKey: "10k", distanceM: 10000, timeText: "45:00", date: today, note: "" },
]);

function colorOf(zone) {
  return INTENSITY_COLORS[zone] ?? "#9aa2ab";
}

function onDistanceChange(result) {
  const d = COMMON_RACE_DISTANCES.find((item) => item.key === result.distanceKey);
  if (d) result.distanceM = d.meters;
}

function addResult() {
  results.value.push({ distanceKey: "10k", distanceM: 10000, timeText: "", date: today, note: "" });
}

function calcSix() {
  const threshold = sixMin.value * 60 + sixSec.value;
  if (!(threshold > 0)) { notifyError("请输入有效配速"); return; }
  try {
    sixResult.value = sixSecondPaceRows(threshold);
  } catch (error) {
    notifyError(error instanceof Error ? error.message : "配速无效");
  }
}

async function saveSix() {
  const threshold = sixMin.value * 60 + sixSec.value;
  try {
    await saveAthleteFitness({ mode: "sixSecond", thresholdPaceSecondsPerKm: threshold });
    notifySuccess(`已保存为我的能力（6 秒规则）${await fitnessSavedHint()}`);
  } catch (e) {
    notifyError(e.message);
  }
}

function calcVdot() {
  const parsed = [];
  for (const result of results.value) {
    const timeSeconds = parseRaceTime(result.timeText);
    if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
      notifyError("请填写有效的成绩时间（如 45:00 或 1:24:30）");
      return;
    }
    parsed.push({ distanceM: result.distanceM, timeSeconds, label: result.note || undefined, date: result.date });
  }
  try {
    const assessment = assessFromResults(parsed);
    vdotResult.value = assessment;
    const contributing = parsed.find(
      (r) => Math.abs(vdotFromRace(r.distanceM, r.timeSeconds) - assessment.vdot) < 0.01,
    );
    const distance = COMMON_RACE_DISTANCES.find((d) => Math.abs(d.meters - (contributing?.distanceM ?? 0)) < 1);
    selectedLabel.value = `${distance?.label ?? "成绩"}${contributing?.label ? `（${contributing.label}）` : ""} · ${contributing?.date ?? ""}`;
    beginnerRow.value = assessment.vdot <= 30 ? lookupBeginnerRow(assessment.vdot) : null;
    if (beginnerRow.value) {
      const row = beginnerRow.value;
      beginnerCells.value = [
        { label: "R 200m", value: formatRaceTime(row.r200Seconds) },
        ...(row.r300Seconds ? [{ label: "R 300m", value: formatRaceTime(row.r300Seconds) }] : []),
        { label: "I 200m", value: formatRaceTime(row.i200Seconds) },
        { label: "I 400m", value: formatRaceTime(row.i400Seconds) },
        { label: "T 400m", value: formatRaceTime(row.t400Seconds) },
        { label: "T 1km", value: formatRaceTime(row.t1000Seconds) },
        { label: "T 1.6km", value: formatRaceTime(row.t1600Seconds) },
        { label: "M 配速", value: `${formatRaceTime(row.mPacePerKmSeconds)}/km` },
      ];
    }
    vdotRows.value = vdotPaceRows(assessment.vdot);
  } catch (e) {
    notifyError(e.message);
  }
}

async function saveVdot() {
  const parsed = [];
  for (const result of results.value) {
    const timeSeconds = parseRaceTime(result.timeText);
    if (Number.isFinite(timeSeconds) && timeSeconds > 0) {
      parsed.push({ distanceM: result.distanceM, timeSeconds, label: result.note || undefined, date: result.date });
    }
  }
  try {
    await saveAthleteFitness({
      mode: "vdot",
      raceResults: parsed,
      isBeginner: vdotResult.value?.vdot <= 30,
    });
    notifySuccess(
      `已保存为我的能力（VDOT ${vdotResult.value.vdot.toFixed(1)}${vdotResult.value.vdot <= 30 ? "，新手表" : ""}）${await fitnessSavedHint()}`,
    );
  } catch (e) {
    notifyError(e.message);
  }
}
</script>

<style scoped>
.section-title { margin-bottom: 12px; }
.race-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
.result-block { margin-top: 14px; }
.pace-row { margin-bottom: 10px; display: flex; align-items: center; gap: 12px; }
.key {
  display: inline-flex; align-items: center; justify-content: center;
  width: 38px; height: 38px; border-radius: 10px; color: #fff;
  font-weight: 700; flex-shrink: 0;
}
.stats-card { margin-bottom: 10px; }
.stats-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.stats-number { font-size: 30px; font-weight: 700; }
.beginner-card { margin-bottom: 10px; border: 2px solid var(--td-brand-color); }
.split-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px; margin: 12px 0;
}
.split-cell {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 10px; border: 1px solid var(--td-component-stroke); border-radius: 8px;
}
.source-note { margin-top: 16px; }
</style>
