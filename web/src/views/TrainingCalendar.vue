<template>
  <div v-if="loading" class="muted">加载中…</div>
  <div v-else-if="needsSetup">
    <t-card title="开始训练" :bordered="false" style="background: transparent">
      <p class="muted">建立训练配置：选择计划、能力与比赛日期，生成课表后这里展示完整训练周期。</p>
      <t-button theme="primary" @click="$router.push('/settings')">建立配置</t-button>
    </t-card>
  </div>
  <template v-else>
    <div class="page-hero">
      <t-typography-title level="h4">
        训练周期
        <t-tag v-if="currentWeek" variant="light" style="margin-left: 8px">
          当前：第 {{ currentWeek.week.week }} 周 · {{ currentWeek.week.phase }}
        </t-tag>
      </t-typography-title>
      <p class="muted">
        {{ templateName }} · 共 {{ weekRows.length }} 周 · 比赛日 {{ plan.raceDate }}
        <t-button v-if="currentWeek" size="small" variant="text" @click="openWeek(currentWeek.week)">
          查看本周
        </t-button>
      </p>
    </div>

    <t-card v-if="weekStats" :bordered="false" class="stats-card">
      <div class="stats-row">
        <div>
          <div class="stats-number">{{ weekStats.completedSessions }}/{{ weekStats.plannedSessions }}</div>
          <div class="muted">本周完成</div>
        </div>
        <div class="muted">完成率 {{ Math.round(weekStats.completionRate * 100) }}%</div>
        <div class="muted">本周跑量 {{ weekStats.actualDistanceKm }} km</div>
        <div class="muted">连续完成 {{ weekStats.consecutiveCompletedWeeks }} 周</div>
        <div class="muted">累计打卡 {{ totalCheckins }} 次</div>
      </div>
    </t-card>

    <div class="period-grid">
      <div class="period-head">
        <div class="week-col-head">周次 / 阶段</div>
        <div v-for="label in WEEK_LABELS" :key="label" class="cal-head">{{ label }}</div>
      </div>

      <div
        v-for="row in weekRows"
        :key="row.week"
        class="period-row"
        :class="{ 'row-current': row.isCurrent }"
      >
        <div class="week-col" @click="openWeek(row)">
          <div class="week-no">第 {{ row.week }} 周</div>
          <div class="week-phase muted">{{ row.phase }}</div>
        </div>
        <router-link
          v-for="cell in row.cells"
          :key="cell.date"
          class="period-cell"
          :class="{ today: cell.isToday, [cell.status]: cell.status }"
          :to="{ path: '/training/day', query: { date: cell.date } }"
          @click.stop
        >
          <span class="cal-date">{{ cell.dayNumber }}</span>
          <span v-if="cell.mark" class="cal-mark">{{ cell.mark }}</span>
          <span class="intensity-bar" :style="cell.barStyle"></span>
          <span v-if="cell.status" class="cal-status">{{ cell.statusText }}</span>
        </router-link>
      </div>
    </div>
  </template>
</template>

<script setup>
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import {
  PROGRESS_STATUS_LABELS,
  getHomeSummary,
  intensityBarStyle,
  listSetupTemplates,
  todayIso,
} from "@core";
import { service } from "../app-context.js";
import { useTrainingData } from "../composables/useTrainingData.js";

const router = useRouter();

const WEEK_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const today = todayIso();
const { loading, needsSetup, plan, recordsByDay, load } = useTrainingData();

const weekStats = ref(null);
const currentWeek = ref(null);
const totalCheckins = ref(0);
const templateName = ref("");

function typeMark(day) {
  if (!day) return "";
  if (day.items.some((item) => item.type === "RACE")) return "赛";
  if (day.items.every((item) => item.type === "REST")) return "休";
  const marks = [...new Set(day.items.map((item) => item.type).filter((t) => t !== "REST" && t !== "E"))];
  return marks.length === 0 ? "E" : marks.join("+");
}

/** 周期内按周分行：每行 7 天，左侧周次/阶段 */
const weekRows = computed(() => {
  if (!plan.value) return [];
  return plan.value.weeks.map((week) => ({
    week: week.week,
    phase: week.phase,
    isCurrent: week.days.some((day) => day.date === today),
    cells: week.days.map((day) => {
      const status = recordsByDay.value.get(day.id)?.status ?? null;
      return {
        date: day.date,
        dayNumber: Number(day.date.slice(8, 10)),
        mark: typeMark(day),
        barStyle: intensityBarStyle(day.workout),
        status,
        statusText: status ? PROGRESS_STATUS_LABELS[status] : "",
        isToday: day.date === today,
      };
    }),
  }));
});

function openWeek(weekOrRow) {
  const row = weekOrRow.cells
    ? weekOrRow
    : weekRows.value.find((candidate) => candidate.week === weekOrRow.week);
  const date = row?.cells[0]?.date ?? plan.value.weeks[0].days[0].date;
  router.push({ path: "/training/week", query: { date } });
}

onMounted(async () => {
  await load();
  if (!plan.value) return;
  const templates = listSetupTemplates();
  templateName.value = templates.find((t) => t.id === plan.value.templateId)?.name ?? plan.value.templateId;
  const summary = await getHomeSummary(service, plan.value, today);
  currentWeek.value = summary.currentWeek;
  weekStats.value = summary.weekStats;
  totalCheckins.value = summary.progressCount;
});
</script>

<style scoped>
.stats-card { margin-bottom: 12px; }
.stats-row { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
.stats-number { font-size: 30px; font-weight: 700; }

.period-grid {
  display: grid;
  grid-template-columns: 110px repeat(7, 1fr);
  gap: 4px;
  background: #fff;
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  padding: 10px;
  overflow-x: auto;
}
.period-head { display: contents; }
.week-col-head { font-size: 12px; font-weight: 700; color: #8b968f; padding: 4px 0; }
.cal-head { text-align: center; font-size: 12px; font-weight: 700; color: #8b968f; padding: 4px 0; }

.period-row { display: contents; }
.week-col {
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
}
.week-col:hover { background: var(--td-brand-color-light); }
.week-no { font-size: 13px; font-weight: 700; }
.week-phase { font-size: 11px; }
.row-current .week-col { background: var(--td-brand-color-light); }
.row-current .week-no { color: var(--td-brand-color); }

.period-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 58px;
  padding: 5px 2px;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
  background: #fbfcfb;
  border: 1px solid var(--td-component-stroke);
}
.period-cell:hover { border-color: var(--td-brand-color); }
.period-cell.today { border: 2px solid var(--td-brand-color); }
.period-cell.completed { background: #eef7f1; }
.cal-date { font-size: 12px; font-weight: 600; }
.cal-mark { font-size: 11px; font-weight: 700; color: var(--td-brand-color); }
.cal-status { font-size: 10px; color: #8b968f; }
</style>
