/**
 * Workout DSL v2：解析器与序列化器。
 *
 * 冻结规范：spec/dsl/v2/workout-dsl-v2.md（实现依据）
 * v2 是 v1 的严格超集，唯一新增为 H 记法（H 与 I 同一强度，H 基于时间，见 v2 规范 §1.4）。
 * 复用 v1 实现：解析前把 @H 规范化为 @I 并校验负荷类型，序列化输出规范写法（@I）。
 */
import type { Workout } from "../domain.js";
import { WorkoutDslError } from "./errors.js";
import {
  parseWorkoutDslV1,
  serializeWorkoutV1,
  type SerializeWorkoutOptions,
} from "./v1.js";

export const WORKOUT_DSL_V2_VERSION = 2;

const VERSION_LINE = /^[ \t]*WORKOUT\s*\/\s*(\d+)[ \t]*$/mu;

const DISTANCE_LOAD_BEFORE_H =
  /([0-9]+(?:\.[0-9]+)?\s*(?:km|m))\s*@H\b/u;

/**
 * 把 @H 规范化为 @I（H 与 I 同一强度，负荷类型保留时间语义）。
 * 距离负荷 + @H（如 800m@H）与 H 的定义冲突（H 基于时间），直接报错。
 */
function normalizeHNotation(text: string): string {
  const conflict = DISTANCE_LOAD_BEFORE_H.exec(text);
  if (conflict) {
    throw new WorkoutDslError(
      "invalid-value",
      "H 表示按时间控制的 I 强度，负荷必须为时间（如 3min@H）",
      {
        text,
        position: conflict.index,
        hint: "距离型 I 强度直接使用 @I（如 800m@I）",
      },
    );
  }
  return text.replace(/@H\b/gu, "@I");
}

/** 解析 v2 DSL。v2 兼容 v1 的全部合法输入。 */
export function parseWorkoutDslV2(rawText: string): Workout {
  const text = String(rawText ?? "");
  let body = text;
  const match = VERSION_LINE.exec(text);
  if (match) {
    const declared = Number(match[1]);
    if (declared !== WORKOUT_DSL_V2_VERSION) {
      throw new WorkoutDslError(
        "unsupported-version",
        `v2 解析器不支持版本 ${declared}`,
        {
          text,
          position: match.index,
          hint: `WORKOUT/${declared} 请使用对应版本的解析器`,
        },
      );
    }
    body = text.slice(0, match.index) + text.slice(match.index + match[0].length);
  }
  const workout = parseWorkoutDslV1(normalizeHNotation(body));
  workout.dslVersion = WORKOUT_DSL_V2_VERSION;
  return workout;
}

/**
 * 序列化为 v2 DSL。H 步骤输出规范写法 @I（负荷类型已携带时间语义，见 v2 规范 §5）。
 * 默认输出版本行；`{ version: false }` 为紧凑导出。
 */
export function serializeWorkoutV2(workout: Workout, options: SerializeWorkoutOptions = {}): string {
  const version = workout?.dslVersion ?? WORKOUT_DSL_V2_VERSION;
  if (!workout || version !== WORKOUT_DSL_V2_VERSION) {
    throw new Error(`serializeWorkoutV2 只支持版本 ${WORKOUT_DSL_V2_VERSION}，当前为 ${String(version)}`);
  }
  const body = serializeWorkoutV1({ ...workout, dslVersion: 1 }, { version: false });
  return options.version === false ? body : `WORKOUT/${WORKOUT_DSL_V2_VERSION}\n${body}`;
}
