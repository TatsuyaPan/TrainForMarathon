<template>
  <div class="settings-page">
    <div class="page-hero">
      <t-typography-title level="h4">我的</t-typography-title>
    </div>

  <t-card :bordered="true">
    <t-typography-title level="h5">工具</t-typography-title>
    <div class="btn-row">
      <t-button @click="$router.push('/fitness')">我的能力管理</t-button>
      <t-button @click="$router.push('/paces')">自由配速计算器</t-button>
    </div>
  </t-card>

  <t-card v-if="athlete && hasPlan" :bordered="true" style="margin-top: 12px">
    <t-typography-title level="h5">当前配置</t-typography-title>
    <div class="kv"><span class="muted">昵称</span><span>{{ athlete.name || "未设置" }}</span></div>
    <div class="kv"><span class="muted">计划</span><span>{{ templateLabel }} · 比赛日 {{ athlete.raceDate }}</span></div>
    <div class="kv">
      <span class="muted">配速基准</span>
      <span>{{ athlete.vdot ? `VDOT ${athlete.vdot.toFixed(1)}${athlete.isBeginner ? "（新手表）" : ""}` : formatPace(athlete.thresholdPaceSecondsPerKm) }}</span>
    </div>
    <div class="kv"><span class="muted">最大周跑量</span><span>{{ athlete.maxWeeklyKm }} km</span></div>
  </t-card>

  <t-card :bordered="true" style="margin-top: 12px">
    <t-form label-align="top">
      <t-form-item label="昵称（自由设置，可留空）">
        <t-input v-model="form.name" placeholder="例：阿跑" :maxlength="20" />
      </t-form-item>

      <t-form-item v-if="hasFitness" label="能力">
        <t-checkbox v-model="skipFitness" label="使用已保存能力，跳过填写" />
        <t-button size="small" variant="text" @click="$router.push('/fitness')">我的能力管理</t-button>
      </t-form-item>

      <template v-if="!skipFitness">
        <t-form-item label="配速基准">
          <t-select v-model="paceMode" style="width: 260px">
            <t-option value="vdot" label="VDOT（多成绩推算，推荐）" />
            <t-option value="six" label="6 秒规则（直接输入阈值配速）" />
          </t-select>
        </t-form-item>
        <t-form-item label="新手 / 初跑者（VDOT ≤ 30，使用原书表 5-3 新手配速表）">
          <t-checkbox v-model="form.isBeginner" />
        </t-form-item>

        <template v-if="paceMode === 'six'">
          <t-form-item label="乳酸阈配速（T 档）">
            <t-input-number v-model="form.minutes" :min="1" :max="9" style="width: 90px" />
            <span style="margin: 0 6px">:</span>
            <t-input-number v-model="form.seconds" :min="0" :max="59" style="width: 90px" />
            <span style="margin-left: 6px" class="muted">/km</span>
          </t-form-item>
        </template>

        <template v-else>
          <t-form-item label="近期最佳成绩（请填写全力 all-out 成绩，可多条，按时效/类型优先级取基准）">
            <div style="width: 100%">
              <div v-for="(result, index) in results" :key="index" class="race-row">
                <t-select v-model="result.distanceKey" style="width: 110px" @change="onDistanceChange(result)">
                  <t-option v-for="d in COMMON_RACE_DISTANCES" :key="d.key" :value="d.key" :label="d.label" />
                </t-select>
                <t-input v-model="result.timeText" placeholder="45:00 或 1:24:30" style="width: 130px" />
                <t-date-picker v-model="result.date" placeholder="取得日期" style="width: 150px" />
                <t-input v-model="result.note" placeholder="备注（可选）" style="width: 140px" />
                <t-button size="small" theme="danger" variant="text" @click="results.splice(index, 1)">删除</t-button>
              </div>
              <t-button size="small" @click="addResult">+ 添加成绩</t-button>
            </div>
          </t-form-item>
        </template>
      </template>

      <t-form-item label="计划模板">
        <t-select v-model="form.templateId" style="width: 300px">
          <t-option v-for="template in templates" :key="template.id" :value="template.id" :label="`${template.name}（${template.weekCount} 周）`" />
        </t-select>
      </t-form-item>

      <t-form-item label="比赛日期（必填，须为周日；非周日自动校正）">
        <t-date-picker v-model="form.raceDate" placeholder="选择比赛日" style="width: 200px" />
      </t-form-item>

      <t-form-item label="最大周跑量（km）">
        <t-input-number v-model="form.maxWeeklyKm" :min="1" :max="300" style="width: 140px" />
      </t-form-item>
    </t-form>

    <p class="muted">
      数据来源：6 秒规则（书 §1）与丹尼尔斯 VDOT 表（《丹尼尔斯经典跑步训练法》· Jack Daniels）；
      VDOT 实现参考开源 hoodarunner/running-coach-sft（Apache-2.0）。
    </p>

    <div class="btn-row">
      <t-button theme="primary" size="large" :loading="saving" @click="save">{{ hasPlan ? "保存并重建课表" : "生成课表" }}</t-button>
    </div>
  </t-card>

  <t-card v-if="hasPlan" :bordered="true" style="margin-top: 12px">
    <p class="muted">删除配置、课表、会话与打卡记录，回到未配置状态；自定义课程库会保留。</p>
    <t-button theme="danger" variant="outline" @click="resetAll">删除课表并清空训练数据</t-button>
  </t-card>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import {
  COMMON_RACE_DISTANCES,
  createSetup,
  formatPace,
  formatRaceTime,
  getSetupState,
  listSetupTemplates,
  nextSundayIso,
  parseRaceTime,
  resetSetup,
  todayIso,
} from "@core";
import { getAthlete, invalidateAthlete, service } from "../app-context.js";
import { notifyError, notifySuccess } from "../ui-feedback.js";

const athlete = ref(null);
const hasPlan = ref(false);
const templates = ref([]);
const saving = ref(false);
const paceMode = ref("vdot");
const skipFitness = ref(false);
const today = todayIso();

const form = reactive({
  name: "",
  isBeginner: false,
  minutes: 4,
  seconds: 0,
  templateId: "20-week",
  raceDate: "",
  maxWeeklyKm: 60,
});

const results = ref([{ distanceKey: "10k", distanceM: 10000, timeText: "45:00", date: today, note: "" }]);

const hasFitness = computed(() => Boolean(athlete.value?.vdot || athlete.value?.thresholdPaceSecondsPerKm));
const templateLabel = computed(() => {
  const t = templates.value.find((item) => item.id === athlete.value?.templateId);
  return t?.name ?? athlete.value?.templateId ?? "";
});

function onDistanceChange(result) {
  const d = COMMON_RACE_DISTANCES.find((item) => item.key === result.distanceKey);
  if (d) result.distanceM = d.meters;
}

function addResult() {
  results.value.push({ distanceKey: "10k", distanceM: 10000, timeText: "", date: today, note: "" });
}

async function save() {
  saving.value = true;
  try {
    const a = await getAthlete();
    const config = {
      templateId: form.templateId,
      raceDate: nextSundayIso(form.raceDate),
      maxWeeklyKm: form.maxWeeklyKm,
    };
    if (!skipFitness.value) {
      if (paceMode.value === "vdot") {
        const parsed = [];
        for (const result of results.value) {
          const timeSeconds = parseRaceTime(result.timeText);
          if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) {
            notifyError("请填写有效的成绩时间（如 45:00 或 1:24:30）");
            return;
          }
          parsed.push({ distanceM: result.distanceM, timeSeconds, label: result.note || undefined, date: result.date });
        }
        config.paceMode = "vdot";
        config.raceResults = parsed;
        config.isBeginner = form.isBeginner;
      } else {
        config.paceMode = "sixSecond";
        config.thresholdPaceSecondsPerKm = form.minutes * 60 + form.seconds;
      }
    }
    const plan = await createSetup(service, a, config);
    invalidateAthlete();
    notifySuccess(`课表已保存（共 ${plan.weeks.length} 周${skipFitness.value ? "，使用已保存能力" : ""}）。`);
    window.location.hash = "#/training";
  } catch (e) {
    notifyError(e.message);
  } finally {
    saving.value = false;
  }
}

async function resetAll() {
  if (!window.confirm("将删除配置、课表、会话和全部打卡记录，且不可恢复；自定义课程库会保留。确定继续？")) return;
  await resetSetup(service);
  invalidateAthlete();
  window.location.reload();
}

onMounted(async () => {
  athlete.value = await getAthlete();
  templates.value = listSetupTemplates();
  const state = await getSetupState(service);
  hasPlan.value = !state.needsSetup;
  const a = athlete.value;
  form.name = a.name ?? "";
  form.isBeginner = a.isBeginner ?? false;
  form.templateId = a.templateId ?? templates.value[0]?.id ?? "20-week";
  form.raceDate = a.raceDate ?? "";
  form.maxWeeklyKm = a.maxWeeklyKm ?? 60;
  paceMode.value = a.vdot ? "vdot" : "six";
  skipFitness.value = Boolean(a.vdot || a.thresholdPaceSecondsPerKm);
  if (a.thresholdPaceSecondsPerKm) {
    form.minutes = Math.floor(a.thresholdPaceSecondsPerKm / 60);
    form.seconds = a.thresholdPaceSecondsPerKm % 60;
  }
  if (a.raceResults?.length) {
    results.value = a.raceResults.map((r) => ({
      distanceKey: COMMON_RACE_DISTANCES.find((d) => Math.abs(d.meters - r.distanceM) < 1)?.key ?? "10k",
      distanceM: r.distanceM,
      timeText: formatRaceTime(r.timeSeconds),
      date: r.date ?? today,
      note: r.label ?? "",
    }));
  }
});

</script>

<style scoped>
.kv { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
.kv span:last-child { font-weight: 600; text-align: right; }
.race-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
</style>
