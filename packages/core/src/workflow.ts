/**
 * 训练工作流（平台无关）：运动员配置 → 课表实例化 → 打卡 → 统计 → 重置。
 * 与 DataStore 实现解耦：微信（云数据库）/ web（localStorage）/ 测试（内存）共用同一套编排。
 */
import type { AthleteProfile } from "./athlete.js";
import { createAthlete } from "./athlete.js";
import type {
  Load,
  PlanDay,
  PlanInstance,
  PlanInstanceDay,
  ProgressRecord,
  ProgressStatus,
  TrainingSession,
  TrainingTarget,
  Workout,
  WorkoutPhaseRole,
  WorkoutSegment,
} from "./domain.js";
import {
  formatDistanceLabel,
  formatDurationLabel,
  formatLoadLabel,
  formatTargetShortLabel,
} from "./dsl/presentation.js";
import type { TrainingPaces } from "./pace.js";
import { formatPace } from "./pace.js";
import { assessFromResults } from "./vdot.js";
import type { RaceResult } from "./vdot.js";
import { calculateWeekStats } from "./stats.js";
import { instantiatePlan } from "./plans/instantiate.js";
import { listPlanTemplates } from "./plans/registry.js";

/** 平台存储接口：三个业务集合的增删查（键为逻辑 id） */
export interface DataStore {
  get(collection: string, id: string): Promise<unknown | null>;
  set(collection: string, id: string, value: unknown): Promise<void>;
  list(collection: string, filters?: Record<string, unknown>): Promise<unknown[]>;
  delete(collection: string, id: string): Promise<void>;
}

export interface TrainingDataService {
  store: DataStore;
  getAthleteProfile(): Promise<AthleteProfile | null>;
  saveAthleteProfile(profile: AthleteProfile): Promise<void>;
  getPlan(planId: string): Promise<(PlanInstance & { id: string }) | null>;
  savePlan(plan: PlanInstance & { id: string }): Promise<void>;
  listProgress(planId: string): Promise<Array<{ id: string; planId: string; record: ProgressRecord }>>;
  saveProgress(planId: string, record: ProgressRecord): Promise<void>;
  deleteAthleteProfile(): Promise<void>;
  deletePlan(planId: string): Promise<void>;
  deleteProgress(planId: string): Promise<void>;
  /** 训练会话（生命周期模型：计划 → 记录实际 → 结束；一天可多个） */
  listSessions(planId: string, dayId?: string): Promise<TrainingSession[]>;
  saveSession(session: TrainingSession): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
}

export class DefaultTrainingDataService implements TrainingDataService {
  constructor(public store: DataStore) {}

  getAthleteProfile(): Promise<AthleteProfile | null> {
    return this.store.get("athletes", "current") as Promise<AthleteProfile | null>;
  }

  saveAthleteProfile(profile: AthleteProfile): Promise<void> {
    return this.store.set("athletes", "current", profile);
  }

  getPlan(planId: string): Promise<(PlanInstance & { id: string }) | null> {
    return this.store.get("plans", planId) as Promise<(PlanInstance & { id: string }) | null>;
  }

  savePlan(plan: PlanInstance & { id: string }): Promise<void> {
    return this.store.set("plans", plan.id, plan);
  }

  listProgress(
    planId: string,
  ): Promise<Array<{ id: string; planId: string; record: ProgressRecord }>> {
    return this.store.list("progress", { planId }) as Promise<
      Array<{ id: string; planId: string; record: ProgressRecord }>
    >;
  }

  saveProgress(planId: string, record: ProgressRecord): Promise<void> {
    const value = {
      schemaVersion: 1,
      id: `${planId}:${record.dayId}`,
      planId,
      record,
    };
    return this.store.set("progress", value.id, value);
  }

  deleteAthleteProfile(): Promise<void> {
    return this.store.delete("athletes", "current");
  }

  deletePlan(planId: string): Promise<void> {
    return this.store.delete("plans", planId);
  }

  async deleteProgress(planId: string): Promise<void> {
    const entries = await this.listProgress(planId);
    await Promise.all(entries.map((entry) => this.store.delete("progress", entry.id)));
  }

  listSessions(planId: string, dayId?: string): Promise<TrainingSession[]> {
    return this.store.list("sessions", dayId ? { planId, dayId } : { planId }) as Promise<TrainingSession[]>;
  }

  saveSession(session: TrainingSession): Promise<void> {
    return this.store.set("sessions", session.id, session);
  }

  deleteSession(sessionId: string): Promise<void> {
    return this.store.delete("sessions", sessionId);
  }
}

export const TRAINING_TYPE_LABELS: Record<string, string> = {
  E: "轻松跑",
  M: "马拉松配速跑",
  T: "阈值跑",
  I: "间歇跑",
  R: "重复跑",
  L: "长距离",
  ST: "跨步跑",
  REST: "休息",
  RACE: "比赛",
  TEST: "测试",
};

export const PROGRESS_STATUS_LABELS: Record<ProgressStatus, string> = {
  completed: "完成",
  partial: "部分完成",
  skipped: "跳过",
};

export interface SetupTemplate {
  id: string;
  name: string;
  weekCount: number;
}

export function listSetupTemplates(): SetupTemplate[] {
  return listPlanTemplates().map((template) => ({
    id: template.id,
    name: template.name,
    weekCount: template.weekCount,
  }));
}

/** 今天（UTC 日历日，与核心库课表日期口径一致） */
export function todayIso(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export interface SetupState {
  needsSetup: boolean;
  athlete: AthleteProfile | null;
  plan: (PlanInstance & { id: string }) | null;
}

/** 读取当前运动员配置与课表 */
export async function getSetupState(service: TrainingDataService): Promise<SetupState> {
  const athlete = await service.getAthleteProfile();
  const plan = athlete?.planId ? await service.getPlan(athlete.planId) : null;
  return { needsSetup: !athlete || !plan, athlete, plan };
}

export interface SetupConfig {
  templateId: string;
  raceDate: string;
  maxWeeklyKm: number;
  /**
   * 配速基准模式：
   * - sixSecond（默认）：以乳酸阈配速为基准，按 6 秒规则推算 T/I/R（书 §1）
   * - vdot：以多个不同距离最佳成绩推算 VDOT，按丹尼尔斯 VDOT 表取各档配速
   * 不传时回退使用运动员已保存的能力（有则跳过填写）。
   */
  paceMode?: "sixSecond" | "vdot";
  /** 6 秒规则基准（秒/公里）；vdot 模式可省略；缺省用运动员已存能力 */
  thresholdPaceSecondsPerKm?: number;
  /** VDOT 模式的成绩输入（至少 1 个）；缺省用运动员已存成绩 */
  raceResults?: RaceResult[];
  /** 新手/初跑者（低 VDOT ≤30）：VDOT 档位查原书表 5-3 新手表 */
  isBeginner?: boolean;
}

/** 能力摘要：可被课表直接引用的配速基准 */
export interface AthleteFitness {
  mode: "sixSecond" | "vdot";
  thresholdPaceSecondsPerKm?: number;
  vdot?: number;
  raceResults?: RaceResult[];
  isBeginner?: boolean;
}

/** 从运动员档案提取能力摘要；无任何能力返回 null */
export function athleteFitness(athlete: AthleteProfile | null | undefined): AthleteFitness | null {
  if (!athlete) return null;
  if (athlete.vdot && athlete.raceResults?.length) {
    return {
      mode: "vdot",
      vdot: athlete.vdot,
      raceResults: athlete.raceResults,
      isBeginner: athlete.isBeginner,
    };
  }
  if (athlete.thresholdPaceSecondsPerKm) {
    return { mode: "sixSecond", thresholdPaceSecondsPerKm: athlete.thresholdPaceSecondsPerKm };
  }
  return null;
}

export interface FitnessInput {
  mode: "sixSecond" | "vdot";
  thresholdPaceSecondsPerKm?: number;
  raceResults?: RaceResult[];
  isBeginner?: boolean;
}

/** 保存/更新运动员能力（配速计算器结果导入入口） */
export async function updateAthleteFitness(
  service: TrainingDataService,
  input: FitnessInput,
): Promise<AthleteProfile> {
  const athlete = await service.getAthleteProfile();
  if (!athlete) throw new Error("运动员档案不存在");
  const updated: AthleteProfile = {
    ...athlete,
    thresholdPaceSecondsPerKm:
      input.mode === "sixSecond" ? input.thresholdPaceSecondsPerKm : undefined,
    vdot: undefined,
    raceResults: undefined,
    updatedAt: new Date().toISOString(),
  };
  if (input.mode === "vdot") {
    if (!input.raceResults?.length) throw new Error("VDOT 能力至少需要一个比赛成绩");
    const assessment = assessFromResults(input.raceResults);
    updated.vdot = assessment.vdot;
    updated.raceResults = input.raceResults;
    updated.isBeginner = input.isBeginner;
  }
  await service.saveAthleteProfile(updated);
  return updated;
}

/** 用运动员配置生成课表并保存；同模板同比赛日覆盖同一计划文档 */
export async function createSetup(
  service: TrainingDataService,
  athlete: AthleteProfile,
  config: SetupConfig,
): Promise<PlanInstance & { id: string }> {
  const explicitVdot =
    config.paceMode === "vdot" ||
    (config.raceResults !== undefined && config.thresholdPaceSecondsPerKm === undefined);
  const useVdot = explicitVdot || (!config.paceMode && Boolean(athlete.vdot));

  let paces: TrainingPaces | undefined;
  let vdot: number | undefined;
  let raceResults: RaceResult[] | undefined;
  let thresholdPaceSecondsPerKm: number | undefined;
  let isBeginner: boolean | undefined;
  if (useVdot) {
    const results = config.raceResults ?? athlete.raceResults;
    if (!results || results.length === 0) {
      throw new Error("VDOT 模式至少需要一个比赛成绩（或先保存能力）");
    }
    const assessment = assessFromResults(results);
    paces = assessment.paces;
    vdot = assessment.vdot;
    raceResults = results;
    isBeginner = config.isBeginner ?? athlete.isBeginner;
  } else {
    thresholdPaceSecondsPerKm = config.thresholdPaceSecondsPerKm ?? athlete.thresholdPaceSecondsPerKm;
    if (!thresholdPaceSecondsPerKm) {
      throw new Error("请先提供配速能力（阈值配速或比赛成绩），可跳过填写使用已保存能力");
    }
  }

  const instance = instantiatePlan(
    config.templateId,
    {
      raceDate: config.raceDate,
      thresholdPaceSecondsPerKm: useVdot ? undefined : thresholdPaceSecondsPerKm,
      maxWeeklyKm: config.maxWeeklyKm,
    },
    { paces },
  );
  const plan = { ...instance, id: `${config.templateId}:${config.raceDate}` };
  const timestamp = new Date().toISOString();
  const profile: AthleteProfile = {
    ...athlete,
    planId: plan.id,
    templateId: config.templateId,
    raceDate: config.raceDate,
    maxWeeklyKm: config.maxWeeklyKm,
    thresholdPaceSecondsPerKm,
    vdot,
    raceResults,
    isBeginner,
    updatedAt: timestamp,
  };
  await service.saveAthleteProfile(profile);
  await service.savePlan(plan);
  return plan;
}

/** 定位包含指定日期的周；比赛已结束或尚未开始返回 null */
export function findPlanWeek(plan: PlanInstance, dateIso: string): { index: number; week: PlanInstance["weeks"][number] } | null {
  const index = plan.weeks.findIndex((week) => week.days.some((day) => day.date === dateIso));
  if (index === -1) return null;
  return { index, week: plan.weeks[index] };
}

/** 返回指定日期的训练日；无计划日返回 null */
export function findTodayTraining(plan: PlanInstance, dateIso: string): PlanInstanceDay | null {
  for (const week of plan.weeks) {
    const day = week.days.find((candidate) => candidate.date === dateIso);
    if (day) return day;
  }
  return null;
}

/** 保存一次打卡记录；重复打卡同一训练日覆盖（以最近一次 updatedAt 为准） */
export async function checkIn(
  service: TrainingDataService,
  planId: string,
  record: ProgressRecord,
): Promise<void> {
  await service.saveProgress(planId, record);
}

export interface HomeSummary {
  todayTraining: PlanInstanceDay | null;
  currentWeek: { index: number; week: PlanInstance["weeks"][number] } | null;
  weekStats: ReturnType<typeof calculateWeekStats> | null;
  progressCount: number;
  progressRecords: ProgressRecord[];
}

/** 汇总首页数据：今日训练 + 当前周统计 + 打卡数（会话与旧记录合并，会话优先） */
export async function getHomeSummary(
  service: TrainingDataService,
  plan: PlanInstance & { id: string },
  dateIso: string,
): Promise<HomeSummary> {
  const sessions = await service.listSessions(plan.id);
  const sessionRecords = sessionsToProgress(sessions);
  const legacy = await service.listProgress(plan.id);
  const records = mergeRecords(
    legacy.map((entry) => entry.record),
    sessionRecords,
  );
  const located = findPlanWeek(plan, dateIso);
  let weekStats: ReturnType<typeof calculateWeekStats> | null = null;
  if (located) {
    weekStats = calculateWeekStats(plan, located.week.week, records);
  }
  return {
    todayTraining: findTodayTraining(plan, dateIso),
    currentWeek: located,
    weekStats,
    progressCount: records.length,
    progressRecords: records,
  };
}

function mergeRecords(legacy: readonly ProgressRecord[], sessions: readonly ProgressRecord[]): ProgressRecord[] {
  const byDay = new Map<string, ProgressRecord>();
  for (const record of legacy) byDay.set(record.dayId, record);
  for (const record of sessions) byDay.set(record.dayId, record); // 会话优先
  return [...byDay.values()];
}

// —— 训练会话（生命周期：计划 → 记录实际 → 结束；一天可多个） ——

export interface CompleteSessionInput {
  /** 实际完成内容（可偏离计划） */
  actualWorkout?: Workout;
  actualDistanceKm?: number;
  actualDurationMinutes?: number;
  actualRpe?: number;
  /** 训练日志（自由文本） */
  log?: string;
  finishedAt?: string;
}

function sessionId(planId: string, dayId: string, seq: number): string {
  return `${planId}:${dayId}:${seq}`;
}

/**
 * 惰性生成某训练日的会话：该日尚无会话时，从计划内容生成一个 planned 训练
 * （休息日不生成）；已有则按 seq 排序返回，并把「计划位」同步到当天最新课表。
 */
export async function ensureDaySessions(
  service: TrainingDataService,
  plan: PlanInstance & { id: string },
  day: PlanInstanceDay,
): Promise<TrainingSession[]> {
  const existing = await service.listSessions(plan.id, day.id);
  if (existing.length > 0) return syncDayPlannedWorkout(service, plan, day);
  // 休息日：没有结构化课表就不生成会话；课表被补上后（编辑器可为休息日加课）正常生成
  if (!day.workout && day.items.every((item) => item.type === "REST")) return [];
  const timestamp = new Date().toISOString();
  const session: TrainingSession = {
    id: sessionId(plan.id, day.id, 0),
    planId: plan.id,
    dayId: day.id,
    seq: 0,
    label: day.label,
    plannedWorkout: day.workout,
    status: "planned",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await service.saveSession(session);
  return [session];
}

/**
 * 课表变更同步：训练日课表被编辑（或重新生成）后，把该日的「计划位」（seq 0、仍是
 * planned 的会话）对齐到当天最新计划内容。
 *
 * 已结束的会话（done / skipped）保留当时快照——它们是既成事实的训练记录，
 * 不因事后改课表而改写；追加训练（seq > 0）同样不动。
 */
export async function syncDayPlannedWorkout(
  service: TrainingDataService,
  plan: PlanInstance & { id: string },
  day: PlanInstanceDay,
): Promise<TrainingSession[]> {
  const sessions = [...(await service.listSessions(plan.id, day.id))].sort((a, b) => a.seq - b.seq);
  if (sessions.length === 0 || !day.workout) return sessions;

  const synced: TrainingSession[] = [];
  for (const session of sessions) {
    const isPlanSlot = session.seq === 0 && session.status === "planned";
    if (!isPlanSlot || (session.label === day.label && workoutEquals(session.plannedWorkout, day.workout))) {
      synced.push(session);
      continue;
    }
    const updated: TrainingSession = {
      ...session,
      label: day.label,
      plannedWorkout: day.workout,
      updatedAt: new Date().toISOString(),
    };
    await service.saveSession(updated);
    synced.push(updated);
  }
  return synced;
}

/** 结构化课表等值比较（undefined 与缺省键等价；键序差异不敏感） */
function workoutEquals(left: Workout | undefined, right: Workout | undefined): boolean {
  return stableStringify(left) === stableStringify(right);
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(",")}}`;
}

/** 完成训练：记录实际内容与训练日志，生命周期 → done */
export async function completeSession(
  service: TrainingDataService,
  session: TrainingSession,
  input: CompleteSessionInput,
): Promise<TrainingSession> {
  const updated: TrainingSession = {
    ...session,
    status: "done",
    actualWorkout: input.actualWorkout,
    actualDistanceKm: input.actualDistanceKm,
    actualDurationMinutes: input.actualDurationMinutes,
    actualRpe: input.actualRpe,
    log: input.log,
    finishedAt: input.finishedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await service.saveSession(updated);
  return updated;
}

/** 标记训练未进行 → skipped */
export async function skipSession(
  service: TrainingDataService,
  session: TrainingSession,
): Promise<TrainingSession> {
  const timestamp = new Date().toISOString();
  const updated: TrainingSession = {
    ...session,
    status: "skipped",
    finishedAt: timestamp,
    updatedAt: timestamp,
  };
  await service.saveSession(updated);
  return updated;
}

/** 追加训练（一天多个；临时训练 plannedWorkout 可为空） */
export async function addExtraSession(
  service: TrainingDataService,
  planId: string,
  dayId: string,
  input: { label: string; plannedWorkout?: Workout },
): Promise<TrainingSession> {
  const existing = await service.listSessions(planId, dayId);
  const seq = existing.reduce((max, session) => Math.max(max, session.seq), -1) + 1;
  const timestamp = new Date().toISOString();
  const session: TrainingSession = {
    id: sessionId(planId, dayId, seq),
    planId,
    dayId,
    seq,
    label: input.label,
    plannedWorkout: input.plannedWorkout,
    status: "planned",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await service.saveSession(session);
  return session;
}

/** 会话 → 统计记录：done→completed，skipped→skipped；planned 不计入 */
export function sessionsToProgress(sessions: readonly TrainingSession[]): ProgressRecord[] {
  const byDay = new Map<string, TrainingSession[]>();
  for (const session of sessions) {
    const group = byDay.get(session.dayId) ?? [];
    group.push(session);
    byDay.set(session.dayId, group);
  }

  return [...byDay.entries()].flatMap(([dayId, group]) => {
    if (group.every((session) => session.status === "planned")) return [];
    const completed = group.filter((session) => session.status === "done");
    return [{
      dayId,
      status: aggregateSessionStatus(group),
      actualDistanceKm: sumOptional(completed.map((session) => session.actualDistanceKm)),
      actualDurationMinutes: sumOptional(completed.map((session) => session.actualDurationMinutes)),
      updatedAt: latestSessionTimestamp(group),
    }];
  });
}

function aggregateSessionStatus(sessions: readonly TrainingSession[]): ProgressStatus {
  if (sessions.every((session) => session.status === "done")) return "completed";
  if (sessions.every((session) => session.status === "skipped")) return "skipped";
  return "partial";
}

function sumOptional(values: readonly (number | undefined)[]): number | undefined {
  const present = values.filter((value): value is number => value !== undefined);
  return present.length > 0 ? present.reduce((sum, value) => sum + value, 0) : undefined;
}

function latestSessionTimestamp(sessions: readonly TrainingSession[]): string {
  return sessions.reduce((latest, session) => {
    const timestamp = session.finishedAt ?? session.updatedAt;
    return timestamp > latest ? timestamp : latest;
  }, "");
}

export interface FormattedTrainingDay {
  id: string;
  date: string;
  label: string;
  /** 训练目的（最高纲领，必填），独立字段用于显著展示 */
  goal?: string;
  items: Array<{ type: string; text: string }>;
  distanceKm: number | null;
  isRest: boolean;
}

/** 负荷文本：6.4km / 800m / 8min */
function loadText(load: Load): string {
  return load.type === "time" && load.seconds % 60 === 0
    ? `${load.seconds / 60}min`
    : load.type === "time"
      ? formatDurationLabel(load.seconds)
      : formatDistanceLabel(load.meters);
}

function targetText(target: TrainingTarget): string {
  if (target.type === "daniels") return target.zone;
  return formatTargetShortLabel(target);
}

/** 配速区间文本（如 4:05–4:20/km）；E/M 标注估算 */
function paceZoneText(zone: string, paces: TrainingPaces): string {
  const range = paces[zone as keyof TrainingPaces];
  if (!range || typeof range === "undefined") return "";
  if (range === null) return "";
  const label = `${formatPace(range.slow)}–${formatPace(range.fast)}/km`;
  return zone === "E" || zone === "M" ? `${label}（估算）` : label;
}

/**
 * 描述一个分部（循环展开为一行括号内序列）。
 * 恢复与休息是一等步骤，与跑步步骤同样逐条呈现。
 */
function describeSegment(
  segment: WorkoutSegment,
  paces: TrainingPaces,
  role: WorkoutPhaseRole,
  depth: number,
): string {
  if (segment.kind === "repeat") {
    const inner = segment.segments
      .map((child) => describeSegment(child, paces, role, depth + 1))
      .join(" + ");
    return `${segment.repetitions} × （${inner}）`;
  }
  if (segment.kind === "rest") {
    return `${formatDurationLabel(segment.durationSeconds)} 被动休息`;
  }
  if (segment.kind === "recovery") {
    return `${formatLoadLabel(segment.load)} 主动恢复（慢跑）`;
  }
  const parts: string[] = [];
  if (role === "warmup") parts.push("热身");
  if (role === "cooldown") parts.push("冷身");
  parts.push(`${loadText(segment.load)}@${targetText(segment.target)}`);
  if (segment.target.type === "daniels") {
    const paceText = paceZoneText(segment.target.zone, paces);
    if (paceText) parts.push(paceText);
  } else if (segment.target.type === "pace-range") {
    parts.push(
      `${formatPace(segment.target.fastSecondsPerKm)}–${formatPace(segment.target.slowSecondsPerKm)}（自定义配速）`,
    );
  } else if (segment.target.type === "heart-rate") {
    parts.push(
      segment.target.basis === "reserve"
        ? `储备心率 ${segment.target.minPercent}-${segment.target.maxPercent}%`
        : `最大心率 ${segment.target.minPercent}-${segment.target.maxPercent}%`,
    );
  } else if (segment.target.type === "heart-rate-absolute") {
    parts.push(`心率 ${segment.target.minBpm}-${segment.target.maxBpm}bpm`);
  }
  if (segment.rpe !== undefined) parts.push(`RPE${segment.rpe}`);
  if (segment.inclinePercent !== undefined) parts.push(`坡度${segment.inclinePercent}%`);
  return parts.join(" · ");
}

/** 将 Workout 描述为展示行（每分部一行）；goal 由调用方决定是否含入 */
export function describeWorkout(
  workout: Workout,
  paces: TrainingPaces,
  options: { includeGoal?: boolean } = {},
): string[] {
  const lines: string[] = [];
  if (workout.goal && options.includeGoal !== false) lines.push(`目标：${workout.goal}`);
  for (const phase of workout.phases) {
    lines.push(...phase.segments.map((segment) => describeSegment(segment, paces, phase.role, 0)));
  }
  return lines;
}

/** 将一天训练格式化为展示结构；paces 提供时输出 workout 的明确配速/距离/时间 */
export function formatTrainingDay(
  day: PlanInstanceDay,
  paces?: TrainingPaces,
): FormattedTrainingDay {
  if (day.workout && paces) {
    const textLines = describeWorkout(day.workout, paces, { includeGoal: false });
    return {
      id: day.id,
      date: day.date,
      label: day.label,
      goal: day.workout.goal,
      items: textLines.map((text) => ({ type: "workout", text })),
      distanceKm: day.plannedDistanceKm ?? null,
      isRest: day.items.every((item) => item.type === "REST"),
    };
  }
  const items = day.items.map((item) => {
    const label = TRAINING_TYPE_LABELS[item.type] ?? item.type;
    const parts = [label];
    if (item.repetitions !== undefined) parts.push(`${item.repetitions} 组`);
    if (item.repetitionRange) parts.push(`${item.repetitionRange.min}-${item.repetitionRange.max} 组`);
    if (item.note) parts.push(item.note);
    return { type: item.type, text: parts.join(" · ") };
  });
  return {
    id: day.id,
    date: day.date,
    label: day.label,
    items,
    distanceKm: day.plannedDistanceKm ?? null,
    isRest: day.items.every((item) => item.type === "REST"),
  };
}

/** 清空运动员训练数据（配置、课表、打卡与会话），回到未配置状态 */
export async function resetSetup(service: TrainingDataService): Promise<void> {
  const athlete = await service.getAthleteProfile();
  if (athlete?.planId) {
    const sessions = await service.listSessions(athlete.planId);
    await Promise.all(sessions.map((session) => service.deleteSession(session.id)));
    await service.deleteProgress(athlete.planId);
    await service.deletePlan(athlete.planId);
  }
  await service.deleteAthleteProfile();
}

/** 建立/获取当前运动员（虚拟用户）：web 首次进入时调用 */
export async function ensureAthlete(service: TrainingDataService): Promise<AthleteProfile> {
  const existing = await service.getAthleteProfile();
  if (existing) return existing;
  const athlete = createAthlete({ id: createLocalId(), provider: "local" });
  await service.saveAthleteProfile(athlete);
  return athlete;
}

function createLocalId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `athlete-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
