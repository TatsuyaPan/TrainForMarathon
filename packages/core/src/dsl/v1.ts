/**
 * Workout DSL v1：解析器与序列化器。
 *
 * 冻结规范：spec/dsl/v1/workout-dsl-v1.md（实现依据，不再修改）
 * 本文件是该版本的基础实现，其它平台可以直接复用 `parseWorkoutDslV1` /
 * `serializeWorkoutV1`，也可以按同一份规范自行实现。
 */
import type {
  DanielsZone,
  Load,
  RecoveryStep,
  RepeatBlock,
  RestStep,
  RunStep,
  TrainingTarget,
  Workout,
  WorkoutPhase,
  WorkoutPhaseRole,
  WorkoutSegment,
} from "../domain.js";
import { DANIELS_ZONES } from "../domain.js";
import { MAX_REPEAT_DEPTH, validateWorkout } from "./workout.js";
import { WorkoutDslError, type WorkoutDslErrorCode } from "./errors.js";

export const WORKOUT_DSL_V1_VERSION = 1;

export interface SerializeWorkoutOptions {
  /** 是否输出版本行，默认输出（标准导出）。`{ version: false }` 为紧凑导出。 */
  version?: boolean;
}

const PHASE_TAGS: Record<WorkoutPhaseRole, "WU" | "MS" | "CD"> = {
  warmup: "WU",
  main: "MS",
  cooldown: "CD",
};
const ORDERED_ROLES: readonly WorkoutPhaseRole[] = ["warmup", "main", "cooldown"];

// ---------------------------------------------------------------- 解析

interface ParserState {
  text: string;
  pos: number;
  /** 当前行的结束位置（不含换行符） */
  end: number;
}

interface SourceLine {
  /** 不含换行符的行内容 */
  content: string;
  /** 行首在全文中的偏移 */
  start: number;
}

function splitSourceLines(text: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    const char = text[index];
    if (index === text.length || char === "\n" || char === "\r") {
      lines.push({ content: text.slice(start, index), start });
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      start = index + 1;
    }
  }
  return lines;
}

function fail(
  text: string,
  code: WorkoutDslErrorCode,
  message: string,
  position: number,
  hint?: string,
): never {
  throw new WorkoutDslError(code, message, { text, position, hint });
}

function isHorizontalSpace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\u3000";
}

function skipSpaces(state: ParserState): void {
  while (state.pos < state.end && isHorizontalSpace(state.text[state.pos])) state.pos += 1;
}

function rest(state: ParserState): string {
  return state.text.slice(state.pos, state.end);
}

function expectChar(state: ParserState, char: string, code: WorkoutDslErrorCode, message: string, hint?: string): void {
  if (state.text[state.pos] !== char) fail(state.text, code, message, state.pos, hint);
  state.pos += 1;
}

function isWordBoundary(char: string | undefined): boolean {
  return char === undefined || !/[A-Za-z0-9]/u.test(char);
}

/** 解析 v1 DSL。文本不接受任何旧版语法。 */
export function parseWorkoutDslV1(rawText: string): Workout {
  const text = String(rawText ?? "");
  if (text.trim() === "") {
    fail(text, "empty-document", "课程为空：至少需要 GOAL 与 MS 两行", 0, "最小合法课程为 GOAL:有氧基础 / MS:40min@E");
  }

  const lines = splitSourceLines(text);
  const phases: WorkoutPhase[] = [];
  let dslVersion: number | undefined;
  let title: string | undefined;
  let goal: string | undefined;
  let note: string | undefined;
  let goalLinePosition = 0;
  let sawTitle = false;
  let sawGoal = false;
  let sawNote = false;
  let lastPhaseOrder = -1;

  for (const line of lines) {
    const trimmed = line.content.trim();
    if (trimmed === "") continue;
    const linePosition = line.start + (line.content.length - line.content.trimStart().length);

    if (/^WORKOUT\b/u.test(trimmed)) {
      const match = /^WORKOUT\s*\/\s*(\d+)$/u.exec(trimmed);
      if (!match) {
        fail(text, "invalid-version", `版本声明无效「${trimmed}」`, linePosition, "正确写法形如 WORKOUT/1");
      }
      const version = Number(match[1]);
      if (dslVersion !== undefined || sawTitle || sawGoal || sawNote || phases.length > 0) {
        fail(text, "metadata-order", "WORKOUT 版本行必须位于课程最前面", linePosition);
      }
      if (version !== WORKOUT_DSL_V1_VERSION) {
        fail(
          text,
          "unsupported-version",
          `v1 解析器不支持版本 ${version}`,
          linePosition,
          "请使用支持该版本的解析器，或移除版本行让平台使用当前最新版",
        );
      }
      dslVersion = version;
      continue;
    }

    const metadata = /^(TITLE|GOAL|NOTE)\s*:/u.exec(trimmed);
    if (metadata) {
      const field = metadata[1];
      if (phases.length > 0) {
        fail(text, "metadata-after-phase", `${field} 必须位于所有阶段之前`, linePosition);
      }
      const colonIndex = line.content.indexOf(":");
      const rawValue = line.content.slice(colonIndex + 1).trim();
      if (field === "TITLE") {
        if (sawTitle) fail(text, "metadata-duplicate", "TITLE 只能出现一次", linePosition);
        if (sawGoal || sawNote) fail(text, "metadata-order", "头部顺序必须为 WORKOUT/版本 → TITLE → GOAL → NOTE", linePosition);
        sawTitle = true;
        title = rawValue;
      } else if (field === "GOAL") {
        if (sawGoal) fail(text, "metadata-duplicate", "GOAL 只能出现一次", linePosition);
        if (sawNote) fail(text, "metadata-order", "头部顺序必须为 WORKOUT/版本 → TITLE → GOAL → NOTE", linePosition);
        if (rawValue === "") {
          fail(text, "empty-goal", "训练目的（GOAL）不能为空", linePosition, "每次训练都必须明确训练目的");
        }
        sawGoal = true;
        goal = rawValue;
        goalLinePosition = linePosition;
      } else {
        if (sawNote) fail(text, "metadata-duplicate", "NOTE 只能出现一次", linePosition);
        sawNote = true;
        note = rawValue;
      }
      continue;
    }

    const phaseMatch = /^(WU|MS|CD)\s*:/u.exec(trimmed);
    if (phaseMatch) {
      const role: WorkoutPhaseRole =
        phaseMatch[1] === "WU" ? "warmup" : phaseMatch[1] === "MS" ? "main" : "cooldown";
      if (phases.some((phase) => phase.role === role)) {
        fail(text, "duplicate-phase", `阶段「${phaseMatch[1]}」只能出现一次`, linePosition);
      }
      const order = ORDERED_ROLES.indexOf(role);
      if (order < lastPhaseOrder) {
        fail(text, "phase-order", "阶段顺序必须为 WU → MS → CD", linePosition);
      }
      lastPhaseOrder = Math.max(lastPhaseOrder, order);

      const colonIndex = line.content.indexOf(":");
      const bodyStart = line.start + colonIndex + 1;
      const state: ParserState = { text, pos: bodyStart, end: line.start + line.content.length };
      skipSpaces(state);
      if (state.pos >= state.end) {
        fail(text, "empty-phase", `阶段「${phaseMatch[1]}」内容不能为空`, state.pos, "阶段至少包含一个步骤或循环");
      }
      const segments = parseSequence(state, 1);
      skipSpaces(state);
      if (state.pos < state.end) {
        fail(text, "trailing-content", `无法解析的内容「${rest(state)}」`, state.pos);
      }
      phases.push({ role, segments });
      continue;
    }

    fail(
      text,
      "unknown-line",
      `无法识别的行「${trimmed}」`,
      linePosition,
      "支持 WORKOUT/版本、TITLE:、GOAL:、NOTE: 头部，以及 WU:/MS:/CD: 阶段",
    );
  }

  if (!sawGoal) {
    fail(text, "missing-goal", "课程缺少训练目的（GOAL）", 0, "每次训练都必须明确训练目的");
  }
  if (!phases.some((phase) => phase.role === "main")) {
    fail(text, "missing-main-phase", "课程缺少主训练阶段（MS）", goalLinePosition, "例如 MS:40min@E");
  }

  const workout: Workout = {
    dslVersion: dslVersion ?? WORKOUT_DSL_V1_VERSION,
    goal: goal ?? "",
    phases,
  };
  const cleanTitle = title ?? "";
  if (cleanTitle !== "") workout.title = cleanTitle;
  const cleanNote = note ?? "";
  if (cleanNote !== "") workout.note = cleanNote;
  return workout;
}

function parseSequence(state: ParserState, depth: number): WorkoutSegment[] {
  const segments: WorkoutSegment[] = [parseSegment(state, depth)];
  for (;;) {
    const save = state.pos;
    skipSpaces(state);
    if (state.text[state.pos] !== "+") {
      state.pos = save;
      break;
    }
    state.pos += 1;
    segments.push(parseSegment(state, depth));
  }
  return segments;
}

function parseSegment(state: ParserState, depth: number): WorkoutSegment {
  skipSpaces(state);
  if (/^\d+\s*x\s*\(/u.test(rest(state))) return parseRepeat(state, depth);
  return parseStep(state);
}

function parseRepeat(state: ParserState, depth: number): RepeatBlock {
  const start = state.pos;
  if (depth > MAX_REPEAT_DEPTH) {
    fail(state.text, "repeat-too-deep", `循环嵌套不能超过 ${MAX_REPEAT_DEPTH} 层`, start);
  }
  const match = /^(\d+)\s*x\s*\(/u.exec(rest(state))!;
  const repetitions = Number(match[1]);
  if (!Number.isInteger(repetitions) || repetitions <= 0) {
    fail(state.text, "invalid-value", "循环次数必须为正整数", start);
  }
  state.pos += match[0].length;
  const segments = parseSequence(state, depth + 1);
  skipSpaces(state);
  expectChar(state, ")", "unexpected-token", "循环缺少闭合括号 ')'", "形如 6x(8min@T+90s@jog)");
  const note = parseTrailingNote(state, "循环");
  if (segments.length === 0) {
    fail(state.text, "empty-repeat", "循环内至少包含一个分部", start);
  }
  const repeat: RepeatBlock = { kind: "repeat", repetitions, segments };
  if (note !== undefined) repeat.note = note;
  return repeat;
}

function parseStep(state: ParserState): WorkoutSegment {
  const start = state.pos;
  const load = parseLoad(state);
  skipSpaces(state);
  expectChar(state, "@", "unexpected-token", "负荷后缺少 '@'", "形如 8min@T 或 90s@jog");

  if (rest(state).startsWith("jog") && isWordBoundary(state.text[state.pos + 3])) {
    state.pos += 3;
    const recovery: RecoveryStep = { kind: "recovery", load };
    const note = parseTrailingNote(state, "恢复");
    if (note !== undefined) recovery.note = note;
    return recovery;
  }
  if (rest(state).startsWith("rest") && isWordBoundary(state.text[state.pos + 4])) {
    if (load.type !== "time") {
      fail(
        state.text,
        "rest-load-unit",
        "被动休息只接受时间负荷",
        start,
        "被动休息不产生距离，请写成 2min@rest 这类形式",
      );
    }
    state.pos += 4;
    const restStep: RestStep = { kind: "rest", durationSeconds: load.seconds };
    const note = parseTrailingNote(state, "休息");
    if (note !== undefined) restStep.note = note;
    return restStep;
  }

  const target = parseTarget(state);
  const step: RunStep = { kind: "run", load, target };
  parseRunAttributes(state, step);
  return step;
}

function parseLoad(state: ParserState): Load {
  const start = state.pos;
  const match = /^(\d+(?:\.\d+)?)(min|km|m|s)/u.exec(rest(state));
  if (!match) {
    fail(
      state.text,
      "invalid-load",
      `缺少负荷（如 8min / 800m / 5km / 90s），实际「${rest(state).slice(0, 12)}」`,
      start,
    );
  }
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) {
    fail(state.text, "invalid-value", "负荷必须为正数", start);
  }
  state.pos += match[0].length;
  const unit = match[2];
  if (unit === "min" || unit === "s") {
    const seconds = unit === "min" ? value * 60 : value;
    if (!Number.isInteger(seconds) || seconds <= 0) {
      fail(
        state.text,
        "invalid-value",
        `时间负荷 ${match[0]} 无法无损转换为整数秒`,
        start,
        "可以改写成整数秒或整分钟",
      );
    }
    return { type: "time", seconds };
  }
  const meters = unit === "km" ? value * 1000 : value;
  if (!Number.isInteger(meters) || meters <= 0) {
    fail(
      state.text,
      "invalid-value",
      `距离负荷 ${match[0]} 无法无损转换为整数米`,
      start,
      "可以改写成整数米或有限小数的公里",
    );
  }
  return { type: "distance", meters };
}

function parseTarget(state: ParserState): TrainingTarget {
  const start = state.pos;
  const upcoming = rest(state);

  const paceRange = /^P(\d{1,3}):(\d{2})-(\d{1,3}):(\d{2})\/km/u.exec(upcoming);
  if (paceRange) {
    const fast = Number(paceRange[1]) * 60 + Number(paceRange[2]);
    const slow = Number(paceRange[3]) * 60 + Number(paceRange[4]);
    if (
      Number(paceRange[2]) > 59 ||
      Number(paceRange[4]) > 59 ||
      fast < 90 ||
      slow > 900 ||
      fast >= slow
    ) {
      fail(
        state.text,
        "invalid-value",
        `自定义配速区间无效「${paceRange[0]}」`,
        start,
        "范围为 90-900 秒/公里，且快端必须小于慢端",
      );
    }
    state.pos += paceRange[0].length;
    return { type: "pace-range", fastSecondsPerKm: fast, slowSecondsPerKm: slow };
  }
  if (upcoming.startsWith("P") && /^P/u.test(upcoming)) {
    fail(
      state.text,
      "unknown-target",
      `自定义配速格式无效「${upcoming.split("@")[0].slice(0, 16)}」`,
      start,
      "正确写法形如 P4:45-5:00/km",
    );
  }

  const heartRate = /^HR(\d{1,3})-(\d{1,3})(%max|%hrr|bpm)/u.exec(upcoming);
  if (heartRate) {
    const min = Number(heartRate[1]);
    const max = Number(heartRate[2]);
    const suffix = heartRate[3];
    if (suffix === "bpm") {
      if (min < 40 || max > 230 || min >= max) {
        fail(state.text, "invalid-value", "绝对心率无效", start, "范围 40-230 bpm 且下限小于上限");
      }
      state.pos += heartRate[0].length;
      return { type: "heart-rate-absolute", minBpm: min, maxBpm: max };
    }
    if (min < 40 || max > 100 || min >= max) {
      fail(state.text, "invalid-value", "心率百分比无效", start, "范围 40-100% 且下限小于上限");
    }
    state.pos += heartRate[0].length;
    return { type: "heart-rate", basis: suffix === "%hrr" ? "reserve" : "max", minPercent: min, maxPercent: max };
  }
  if (upcoming.startsWith("HR")) {
    fail(
      state.text,
      "unknown-target",
      `心率目标格式无效「${upcoming.split("@")[0].slice(0, 16)}」`,
      start,
      "支持 HR65-78%max、HR60-70%hrr、HR145-160bpm",
    );
  }

  const rpe = /^RPE(\d{1,2})(?!\d)/u.exec(upcoming);
  if (rpe) {
    const value = Number(rpe[1]);
    if (value < 1 || value > 10) {
      fail(state.text, "invalid-value", "RPE 目标范围应为 1-10", start);
    }
    state.pos += rpe[0].length;
    return { type: "rpe", value };
  }
  if (upcoming.startsWith("RPE")) {
    fail(state.text, "unknown-target", `RPE 目标格式无效「${upcoming.slice(0, 8)}」`, start, "正确写法形如 RPE7");
  }

  const zone = /^([A-Za-z]{1,2})/u.exec(upcoming);
  if (zone && DANIELS_ZONES.includes(zone[1] as DanielsZone) && isWordBoundary(state.text[state.pos + zone[1].length])) {
    state.pos += zone[1].length;
    return { type: "daniels", zone: zone[1] as DanielsZone };
  }
  if (zone) {
    fail(
      state.text,
      "unknown-target",
      `未知训练目标「${zone[1]}」`,
      start,
      "支持 E/M/T/I/R/ST、配速范围、心率范围与 RPE",
    );
  }
  fail(state.text, "unknown-target", `缺少训练目标，实际「${upcoming.slice(0, 12)}」`, start);
}

function parseRunAttributes(state: ParserState, step: RunStep): void {
  for (;;) {
    const save = state.pos;
    skipSpaces(state);
    if (state.text[state.pos] !== "@") {
      state.pos = save;
      return;
    }
    const at = state.pos;
    state.pos += 1;
    const upcoming = rest(state);
    const rpe = /^RPE(\d{1,2})(?!\d)/u.exec(upcoming);
    if (rpe) {
      const value = Number(rpe[1]);
      if (value < 1 || value > 10) fail(state.text, "invalid-value", "辅助 RPE 范围应为 1-10", at);
      state.pos += rpe[0].length;
      step.rpe = value;
      continue;
    }
    const incline = /^inc(\d+(?:\.\d+)?)(?![\d.])/u.exec(upcoming);
    if (incline) {
      const value = Number(incline[1]);
      if (value < 0 || value > 20) fail(state.text, "invalid-value", "坡度范围应为 0-20%", at);
      state.pos += incline[0].length;
      step.inclinePercent = value;
      continue;
    }
    if (upcoming.startsWith("note(")) {
      state.pos = at;
      const note = parseNoteAttribute(state);
      if (note !== undefined) step.note = note;
      continue;
    }
    fail(
      state.text,
      "unknown-attribute",
      `未知步骤属性「${upcoming.slice(0, 12)}」`,
      at,
      '跑步步骤支持 @RPE n、@inc n、@note("…")',
    );
  }
}

function parseTrailingNote(state: ParserState, owner: string): string | undefined {
  const save = state.pos;
  skipSpaces(state);
  if (state.text[state.pos] !== "@") {
    state.pos = save;
    return undefined;
  }
  const at = state.pos;
  if (!rest(state).startsWith("@note(")) {
    fail(
      state.text,
      "unknown-attribute",
      `${owner}只支持备注属性，实际「${rest(state).slice(0, 12)}」`,
      at,
      '请写成 @note("…")',
    );
  }
  return parseNoteAttribute(state);
}

function parseNoteAttribute(state: ParserState): string | undefined {
  state.pos += 1; // '@'
  if (!rest(state).startsWith("note(")) {
    fail(state.text, "unknown-attribute", "未知属性，期望 @note(\"…\")", state.pos - 1);
  }
  state.pos += 5;
  skipSpaces(state);
  const quoteStart = state.pos;
  if (state.text[quoteStart] !== '"') {
    fail(state.text, "invalid-value", "备注必须使用双引号", quoteStart, '形如 @note("保持放松")');
  }
  let cursor = quoteStart + 1;
  while (cursor < state.end) {
    const char = state.text[cursor];
    if (char === "\\") {
      cursor += 2;
      continue;
    }
    if (char === '"') break;
    cursor += 1;
  }
  if (cursor >= state.end) fail(state.text, "invalid-value", "备注缺少右侧引号", quoteStart);
  const raw = state.text.slice(quoteStart, cursor + 1);
  let value: string;
  try {
    value = JSON.parse(raw) as string;
  } catch {
    fail(state.text, "invalid-value", "备注中的转义序列无效", quoteStart, "备注使用 JSON 字符串转义规则");
  }
  state.pos = cursor + 1;
  skipSpaces(state);
  expectChar(state, ")", "unexpected-token", "备注缺少右侧括号 ')'", '形如 @note("保持放松")');
  return value === "" ? undefined : value;
}

// ---------------------------------------------------------------- 序列化

function trimToUndefined(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function formatDecimal(value: number, decimals = 3): string {
  return String(Number(value.toFixed(decimals)));
}

/** 时间负荷的标准写法：整分钟用 min，否则用 s */
export function formatTimeDsl(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60}min` : `${seconds}s`;
}

/** 距离负荷的标准写法：≥1000 米用 km，否则用 m */
export function formatDistanceDsl(meters: number): string {
  return meters >= 1000 ? `${formatDecimal(meters / 1000)}km` : `${meters}m`;
}

export function formatLoadDsl(load: Load): string {
  return load.type === "time" ? formatTimeDsl(load.seconds) : formatDistanceDsl(load.meters);
}

function formatPaceValue(secondsPerKm: number): string {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = String(secondsPerKm % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function serializeTarget(target: TrainingTarget): string {
  switch (target.type) {
    case "daniels":
      return target.zone;
    case "pace-range":
      return `P${formatPaceValue(target.fastSecondsPerKm)}-${formatPaceValue(target.slowSecondsPerKm)}/km`;
    case "heart-rate":
      return `HR${target.minPercent}-${target.maxPercent}${target.basis === "reserve" ? "%hrr" : "%max"}`;
    case "heart-rate-absolute":
      return `HR${target.minBpm}-${target.maxBpm}bpm`;
    case "rpe":
      return `RPE${target.value}`;
  }
}

function serializeNoteAttribute(note: string): string {
  return `@note(${JSON.stringify(note)})`;
}

function serializeSegment(segment: WorkoutSegment): string {
  switch (segment.kind) {
    case "run": {
      const attributes: string[] = [];
      if (segment.rpe !== undefined) attributes.push(`@RPE${segment.rpe}`);
      if (segment.inclinePercent !== undefined) attributes.push(`@inc${formatDecimal(segment.inclinePercent, 2)}`);
      if (segment.note !== undefined && segment.note !== "") attributes.push(serializeNoteAttribute(segment.note));
      return `${formatLoadDsl(segment.load)}@${serializeTarget(segment.target)}${attributes.join("")}`;
    }
    case "recovery": {
      const note = segment.note !== undefined && segment.note !== "" ? serializeNoteAttribute(segment.note) : "";
      return `${formatLoadDsl(segment.load)}@jog${note}`;
    }
    case "rest": {
      const note = segment.note !== undefined && segment.note !== "" ? serializeNoteAttribute(segment.note) : "";
      return `${formatTimeDsl(segment.durationSeconds)}@rest${note}`;
    }
    case "repeat": {
      const note = segment.note !== undefined && segment.note !== "" ? serializeNoteAttribute(segment.note) : "";
      return `${segment.repetitions}x(${segment.segments.map(serializeSegment).join("+")})${note}`;
    }
  }
}

/** 序列化为 v1 DSL。默认输出版本行；`{ version: false }` 为紧凑导出。 */
export function serializeWorkoutV1(workout: Workout, options: SerializeWorkoutOptions = {}): string {
  const version = workout?.dslVersion ?? WORKOUT_DSL_V1_VERSION;
  if (!workout || version !== WORKOUT_DSL_V1_VERSION) {
    throw new Error(`serializeWorkoutV1 只支持版本 ${WORKOUT_DSL_V1_VERSION}，当前为 ${String(version)}`);
  }
  const issues = validateWorkout(workout);
  if (issues.length > 0) {
    throw new Error(`课程内容无效，无法导出 DSL：${issues[0].message}`);
  }
  const lines: string[] = [];
  if (options.version !== false) lines.push(`WORKOUT/${WORKOUT_DSL_V1_VERSION}`);
  const title = trimToUndefined(workout.title);
  if (title !== undefined) lines.push(`TITLE:${title}`);
  lines.push(`GOAL:${workout.goal.trim()}`);
  const note = trimToUndefined(workout.note);
  if (note !== undefined) lines.push(`NOTE:${note}`);
  const byRole = new Map(workout.phases.map((phase) => [phase.role, phase]));
  for (const role of ORDERED_ROLES) {
    const phase = byRole.get(role);
    if (!phase) continue;
    lines.push(`${PHASE_TAGS[role]}:${phase.segments.map(serializeSegment).join("+")}`);
  }
  return lines.join("\n");
}
