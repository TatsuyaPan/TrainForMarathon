/**
 * 课表 DSL：Workout ↔ 文本（忠实文档表达，可分享/导入）。
 *
 * 语法（v2）：
 *   workout  := goal? segment ('+' segment)*
 *   goal     := '[' label ']'                // 课表级训练目的（可选）
 *   segment  := set | step
 *   set      := '(' workout ')' '*' int      // 组（可嵌套，限深）
 *   step     := load '@' intensity attr* rest?
 *   attr     := '@' ('warmup'|'cooldown'|'rpe' 1-10|'inc' 坡度%)
 *   rest     := '+' load '@' ('jg'|'rest')
 *   load     := number ('km'|'m'|'min')
 *   intensity:= 'E'|'M'|'T'|'I'|'R'|'ST' | 'HR' int '-' int '%'
 *
 * 示例：
 *   [赛前减量·T] 20min@T@rpe7
 *   10min@E@warmup+(800m@I+3min@jg)*10@inc1+10min@E@cooldown
 *   (6min@T@rpe8+1min@jg)*8
 */
import type {
  IntensitySpec,
  LoadSpec,
  RestSpec,
  Workout,
  WorkoutSegment,
  WorkoutSet,
  WorkoutStep,
} from "./domain.js";

export class DslError extends Error {
  constructor(message: string, public position: number) {
    super(`${message}（位置 ${position}）`);
    this.name = "DslError";
  }
}

const ZONES = new Set(["E", "M", "T", "I", "R", "ST"]);
const MAX_DEPTH = 10;

// ---------- 序列化 ----------

export function serializeWorkout(workout: Workout): string {
  const parts: string[] = [];
  if (workout.goal) parts.push(`[${workout.goal}]`);
  parts.push(workout.segments.map(serializeSegment).join("+"));
  return parts.join(" ");
}

function serializeSegment(segment: WorkoutSegment): string {
  return segment.kind === "set" ? serializeSet(segment) : serializeStep(segment);
}

function serializeSet(set: WorkoutSet): string {
  const body = set.segments.map(serializeSegment).join("+");
  return `(${body})*${set.repeats}`;
}

function serializeStep(step: WorkoutStep): string {
  const attrs: string[] = [];
  if (step.phase === "warmup") attrs.push("@warmup");
  if (step.phase === "cooldown") attrs.push("@cooldown");
  if (step.rpe !== undefined) attrs.push(`@rpe${step.rpe}`);
  if (step.inclinePercent !== undefined) attrs.push(`@inc${formatNumber(step.inclinePercent)}`);
  const attrsText = attrs.length > 0 ? attrs.join("") : "";
  const restText = step.rest ? serializeRest(step.rest) : "";
  return `${serializeLoad(step.load)}@${serializeIntensity(step.intensity)}${attrsText}${restText}`;
}

function serializeLoad(load: LoadSpec): string {
  if (load.type === "time") {
    const seconds = load.minutes * 60;
    return Number.isInteger(seconds) && seconds < 60 ? `${seconds}s` : `${formatNumber(load.minutes)}min`;
  }
  const meters = load.meters;
  return meters % 1000 === 0 && meters >= 1000
    ? `${formatNumber(meters / 1000)}km`
    : `${meters}m`;
}

function serializeIntensity(intensity: IntensitySpec): string {
  switch (intensity.type) {
    case "pace":
      return intensity.zone;
    case "paceRange":
      return `P${intensity.fastSecondsPerKm}-${intensity.slowSecondsPerKm}`;
    case "heartRate": {
      if (intensity.minPercent === undefined || intensity.maxPercent === undefined) {
        throw new Error("心率强度必须提供 minPercent 与 maxPercent 才能导出 DSL");
      }
      return `HR${intensity.minPercent}-${intensity.maxPercent}%`;
    }
    case "custom":
      throw new Error(`自定义强度"${intensity.label}"无法导出 DSL，请改用配速档、配速区间或心率区间`);
  }
}

function serializeRest(rest: RestSpec): string {
  if (rest.type === "jog") {
    throw new Error("无负荷的慢跑休息无法导出 DSL，请补充时间或距离");
  }
  const mode = rest.mode === "jog" ? "jg" : "rest";
  return `+${serializeLoad(rest.type === "time" ? { type: "time", minutes: rest.minutes } : { type: "distance", meters: rest.meters })}@${mode}`;
}

function formatNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

// ---------- 解析 ----------

interface ParserState {
  text: string;
  pos: number;
}

export function parseWorkoutDsl(text: string): Workout {
  const state: ParserState = { text: String(text ?? "").trim(), pos: 0 };
  const workout = parseWorkout(state, 0);
  skipWhitespace(state);
  if (state.pos < state.text.length) {
    throw new DslError(`无法解析的剩余内容 "${state.text.slice(state.pos)}"`, state.pos);
  }
  return workout;
}

function parseWorkout(state: ParserState, depth: number): Workout {
  if (depth > MAX_DEPTH) {
    throw new DslError("组嵌套过深（超过 10 层）", state.pos);
  }
  skipWhitespace(state);
  const goal = peekGoal(state);
  const segments: WorkoutSegment[] = [];
  for (;;) {
    segments.push(parseSegment(state, depth));
    skipWhitespace(state);
    if (state.pos < state.text.length && state.text[state.pos] === "+") {
      state.pos += 1;
      continue;
    }
    break;
  }
  if (segments.length === 0) throw new DslError("课表为空", state.pos);
  return { goal, segments };
}

function parseSegment(state: ParserState, depth: number): WorkoutSegment {
  skipWhitespace(state);
  if (state.pos < state.text.length && state.text[state.pos] === "(") {
    return parseSet(state, depth);
  }
  return parseStep(state);
}

function parseSet(state: ParserState, depth: number): WorkoutSet {
  state.pos += 1; // '('
  const body = parseWorkout(state, depth + 1);
  skipWhitespace(state);
  expect(state, ")", "缺少组的闭合括号 ')'");
  state.pos += 1;
  skipWhitespace(state);
  expect(state, "*", "组缺少重复次数（应为 (…)*N）");
  state.pos += 1;
  skipWhitespace(state);
  const repeats = parseInteger(state);
  if (!Number.isInteger(repeats) || repeats <= 0) {
    throw new DslError("组重复次数必须为正整数", state.pos);
  }
  return { kind: "set", repeats, segments: body.segments };
}

function parseStep(state: ParserState): WorkoutStep {
  skipWhitespace(state);
  const load = parseLoad(state);
  skipWhitespace(state);
  expect(state, "@", "负荷后缺少 '@'（应为 负荷@强度）");
  state.pos += 1;
  const intensity = parseIntensity(state);
  const step: WorkoutStep = { kind: "step", intensity, load };
  for (;;) {
    skipWhitespace(state);
    if (state.pos < state.text.length && state.text[state.pos] === "@") {
      parseAttr(state, step);
      continue;
    }
    if (state.pos < state.text.length && state.text[state.pos] === "+") {
      // 可能是休息（rest 负荷后跟 @jg/@rest）；但也可能是下一个分部——仅当 '@' 后是 jg/rest 时视为休息
      const next = state.pos + 1;
      if (next < state.text.length && state.text[next] === "+") {
        throw new DslError("连续出现 '+'", next);
      }
      const rest = tryParseRest(state);
      if (rest) {
        step.rest = rest;
        continue;
      }
    }
    break;
  }
  return step;
}

function parseLoad(state: ParserState): LoadSpec {
  // 单位按 min/km/m/s 顺序匹配，避免 "8min" 被 "m" 抢先解析成 "8m"
  const match = /^(\d+(?:\.\d+)?)(min|km|m|s)/u.exec(state.text.slice(state.pos));
  if (!match) throw new DslError(`缺少负荷（如 8min / 800m / 5km / 30s），实际 "${state.text.slice(state.pos, state.pos + 12)}"`, state.pos);
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) throw new DslError("负荷必须为正数", state.pos);
  state.pos += match[0].length;
  if (match[2] === "min") return { type: "time", minutes: value };
  if (match[2] === "s") return { type: "time", minutes: value / 60 };
  if (match[2] === "km") return { type: "distance", meters: Math.round(value * 1000) };
  return { type: "distance", meters: Math.round(value) };
}

function parseIntensity(state: ParserState): IntensitySpec {
  const rest = state.text.slice(state.pos);
  const zone = /^([A-Za-z]{1,2})/u.exec(rest);
  if (zone && ZONES.has(zone[1])) {
    state.pos += zone[1].length;
    return { type: "pace", zone: zone[1] as "E" | "M" | "T" | "I" | "R" | "ST" };
  }
  const paceRange = /^P(\d{2,4})-(\d{2,4})/u.exec(rest);
  if (paceRange) {
    const fast = Number(paceRange[1]);
    const slow = Number(paceRange[2]);
    if (fast < 90 || slow > 900 || fast >= slow) {
      throw new DslError("配速区间无效（应为 Pfast-slow，秒/公里，且 fast < slow）", state.pos);
    }
    state.pos += paceRange[0].length;
    return { type: "paceRange", fastSecondsPerKm: fast, slowSecondsPerKm: slow };
  }
  const hr = /^HR(\d{1,3})-(\d{1,3})%/u.exec(rest);
  if (hr) {
    const min = Number(hr[1]);
    const max = Number(hr[2]);
    if (min < 40 || max > 100 || min >= max) {
      throw new DslError("心率区间无效（应为 HR40-100% 且 min < max）", state.pos);
    }
    state.pos += hr[0].length;
    return { type: "heartRate", minPercent: min, maxPercent: max };
  }
  const badZone = /^([A-Za-z]+)/u.exec(rest);
  throw new DslError(
    badZone ? `未知强度档位 "${badZone[1]}"（支持 E/M/T/I/R/ST/HR区间）` : `缺少强度档位，实际 "${rest.slice(0, 12)}"`,
    state.pos,
  );
}

function parseAttr(state: ParserState, step: WorkoutStep): void {
  state.pos += 1; // '@'
  const rest = state.text.slice(state.pos);
  if (/^warmup\b/u.test(rest)) {
    state.pos += "warmup".length;
    step.phase = "warmup";
    return;
  }
  if (/^cooldown\b/u.test(rest)) {
    state.pos += "cooldown".length;
    step.phase = "cooldown";
    return;
  }
  const rpe = /^rpe(\d{1,2})/u.exec(rest);
  if (rpe) {
    const level = Number(rpe[1]);
    if (level < 1 || level > 10) throw new DslError("RPE 范围应为 1-10", state.pos);
    state.pos += rpe[0].length;
    step.rpe = level;
    return;
  }
  const inc = /^inc(\d+(?:\.\d+)?)/u.exec(rest);
  if (inc) {
    const value = Number(inc[1]);
    if (value < 0 || value > 20) throw new DslError("坡度范围应为 0-20%", state.pos);
    state.pos += inc[0].length;
    step.inclinePercent = value;
    return;
  }
  throw new DslError(`未知属性 "${rest.slice(0, 12)}"（支持 @warmup/@cooldown/@rpeN/@incN）`, state.pos);
}

function tryParseRest(state: ParserState): RestSpec | null {
  const save = state.pos;
  state.pos += 1; // '+'
  skipWhitespace(state);
  try {
    const load = parseLoad(state);
    skipWhitespace(state);
    if (state.pos >= state.text.length || state.text[state.pos] !== "@") {
      state.pos = save;
      return null;
    }
    state.pos += 1;
    const modeText = state.text.slice(state.pos, state.pos + 5);
    if (modeText.startsWith("jg")) {
      state.pos += 2;
      return load.type === "time"
        ? { type: "time", minutes: load.minutes, mode: "jog" }
        : { type: "distance", meters: load.meters, mode: "jog" };
    }
    if (modeText.startsWith("rest")) {
      state.pos += 4;
      return load.type === "time"
        ? { type: "time", minutes: load.minutes, mode: "rest" }
        : { type: "distance", meters: load.meters, mode: "rest" };
    }
    state.pos = save;
    return null;
  } catch {
    state.pos = save;
    return null;
  }
}

function peekGoal(state: ParserState): string | undefined {
  skipWhitespace(state);
  if (state.pos < state.text.length && state.text[state.pos] === "[") {
    const end = state.text.indexOf("]", state.pos + 1);
    if (end === -1) throw new DslError("缺少训练目的的闭合 ']'", state.pos);
    const label = state.text.slice(state.pos + 1, end).trim();
    if (!label) throw new DslError("训练目的不能为空", state.pos);
    if (/[\[+\]]/u.test(label)) {
      throw new DslError(`训练目的含非法字符（不允许 [ ] +），实际 "${label}"`, state.pos);
    }
    state.pos = end + 1;
    return label;
  }
  return undefined;
}

function parseInteger(state: ParserState): number {
  const match = /^(\d+)/u.exec(state.text.slice(state.pos));
  if (!match) return Number.NaN;
  state.pos += match[0].length;
  return Number(match[0]);
}

function skipWhitespace(state: ParserState): void {
  while (state.pos < state.text.length && /\s/u.test(state.text[state.pos])) state.pos += 1;
}

function expect(state: ParserState, char: string, message: string): void {
  if (state.pos >= state.text.length || state.text[state.pos] !== char) {
    throw new DslError(message, state.pos);
  }
}

// ---------- 汇总（递归，含组重复） ----------

export interface WorkoutTotals {
  distanceKm: number;
  durationMinutes: number;
}

export function workoutTotals(workout: Workout): WorkoutTotals {
  const totals = sumSegments(workout.segments);
  return {
    distanceKm: round1(totals.distanceKm),
    durationMinutes: Math.round(totals.durationMinutes),
  };
}

function sumSegments(segments: readonly WorkoutSegment[]): WorkoutTotals {
  let distanceKm = 0;
  let durationMinutes = 0;
  for (const segment of segments) {
    if (segment.kind === "set") {
      const inner = sumSegments(segment.segments);
      distanceKm += inner.distanceKm * segment.repeats;
      durationMinutes += inner.durationMinutes * segment.repeats;
    } else {
      if (segment.load.type === "distance") distanceKm += segment.load.meters / 1000;
      else durationMinutes += segment.load.minutes;
    }
  }
  return { distanceKm, durationMinutes };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// ---------- 校验 ----------

/**
 * 校验 Workout 结构。训练目的（goal）为必填——它是每堂训练的最高纲领，
 * 不允许保存无目的的课表。返回错误列表（空数组 = 合法）。
 */
export function validateWorkout(workout: Workout): string[] {
  const errors: string[] = [];
  if (!workout.goal || !workout.goal.trim()) {
    errors.push("训练目的（goal）为必填项：每次训练都必须明确训练目的");
  }
  if (!Array.isArray(workout.segments) || workout.segments.length === 0) {
    errors.push("课表内容不能为空（至少包含一个步骤或组）");
    return errors;
  }
  const validateSegment = (segment: WorkoutSegment, prefix: string): void => {
    if (segment.kind === "set") {
      if (!Number.isInteger(segment.repeats) || segment.repeats <= 0) {
        errors.push(`${prefix}：组重复次数必须为正整数`);
      }
      if (!Array.isArray(segment.segments) || segment.segments.length === 0) {
        errors.push(`${prefix}：组内至少包含一个分部`);
      }
      segment.segments.forEach((child, index) => validateSegment(child, `${prefix}.${index}`));
      return;
    }
    if (!segment.intensity || !segment.load) {
      errors.push(`${prefix}：步骤缺少强度或负荷`);
      return;
    }
    if (segment.load.type === "time" && (!Number.isFinite(segment.load.minutes) || segment.load.minutes <= 0)) {
      errors.push(`${prefix}：时间负荷必须为正数`);
    }
    if (segment.load.type === "distance" && (!Number.isFinite(segment.load.meters) || segment.load.meters <= 0)) {
      errors.push(`${prefix}：距离负荷必须为正数`);
    }
    if (segment.intensity.type === "paceRange") {
      const { fastSecondsPerKm, slowSecondsPerKm } = segment.intensity;
      if (!Number.isFinite(fastSecondsPerKm) || !Number.isFinite(slowSecondsPerKm) || fastSecondsPerKm >= slowSecondsPerKm) {
        errors.push(`${prefix}：自定义配速区间无效（快端必须小于慢端）`);
      }
    }
    if (segment.rpe !== undefined && (segment.rpe < 1 || segment.rpe > 10)) {
      errors.push(`${prefix}：RPE 范围应为 1-10`);
    }
    if (segment.inclinePercent !== undefined && (segment.inclinePercent < 0 || segment.inclinePercent > 20)) {
      errors.push(`${prefix}：坡度范围应为 0-20%`);
    }
  };
  workout.segments.forEach((segment, index) => validateSegment(segment, `分部[${index}]`));
  return errors;
}
