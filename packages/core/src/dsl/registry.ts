/**
 * Workout DSL 版本注册表与统一入口。
 *
 * 版本政策见 spec/dsl/README.md：
 * - 文本声明版本 → 使用对应解析器；不支持时抛出版本错误，不猜测、不降级；
 * - 未声明版本 → 使用平台当前最新版解析器（可用 options.defaultVersion 覆盖）；
 * - 平台可以绕过本入口，直接调用 `parseWorkoutDslV1` 等版本明确的解析器。
 */
import type { Workout } from "../domain.js";
import { WorkoutDslError } from "./errors.js";
import {
  WORKOUT_DSL_V1_VERSION,
  parseWorkoutDslV1,
  serializeWorkoutV1,
  type SerializeWorkoutOptions,
} from "./v1.js";

/** 平台当前支持的最新版解析器版本 */
export const CURRENT_WORKOUT_DSL_VERSION = WORKOUT_DSL_V1_VERSION;

export const SUPPORTED_WORKOUT_DSL_VERSIONS: readonly number[] = [WORKOUT_DSL_V1_VERSION];

export type WorkoutDslVersion = typeof WORKOUT_DSL_V1_VERSION;

export type WorkoutDslParser = (text: string) => Workout;
export type WorkoutDslSerializer = (workout: Workout, options?: SerializeWorkoutOptions) => string;

/** 版本 → 解析器。新增版本时在此注册。 */
export const WORKOUT_DSL_PARSERS: Readonly<Record<number, WorkoutDslParser>> = {
  [WORKOUT_DSL_V1_VERSION]: parseWorkoutDslV1,
};

/** 版本 → 序列化器 */
export const WORKOUT_DSL_SERIALIZERS: Readonly<Record<number, WorkoutDslSerializer>> = {
  [WORKOUT_DSL_V1_VERSION]: serializeWorkoutV1,
};

export function isWorkoutDslVersionSupported(version: number): boolean {
  return Object.prototype.hasOwnProperty.call(WORKOUT_DSL_PARSERS, version);
}

const VERSION_LINE = /^[ \t]*WORKOUT[ \t]*\/[ \t]*(\d+)[ \t]*$/mu;

function firstVersionLine(text: string): RegExpExecArray | null {
  for (const line of String(text ?? "").split(/\r\n|\n|\r/u)) {
    if (line.trim() === "") continue;
    return /^[ \t]*WORKOUT[ \t]*\/[ \t]*(\d+)[ \t]*$/u.exec(line);
  }
  return null;
}

/**
 * 识别文本声明的 DSL 版本；未声明时返回 undefined。
 * 声明了版本但不是正整数时抛出版本格式错误。
 */
export function detectWorkoutDslVersion(text: string): number | undefined {
  const source = String(text ?? "");
  const first = source.split(/\r\n|\n|\r/u).find((line) => line.trim() !== "") ?? "";
  if (!/^[ \t]*WORKOUT\b/u.test(first)) return undefined;
  const match = firstVersionLine(source);
  if (!match) {
    throw new WorkoutDslError("invalid-version", "版本声明无效", { text: source, position: 0, hint: "正确写法形如 WORKOUT/1" });
  }
  const version = Number(match[1]);
  if (!Number.isInteger(version) || version <= 0) {
    throw new WorkoutDslError("invalid-version", "版本号必须为正整数", { text: source, position: 0 });
  }
  return version;
}

export interface ParseWorkoutDslOptions {
  /** 文本未声明版本时使用的版本；缺省为当前最新版 */
  defaultVersion?: number;
}

/** 解析 DSL：优先使用文本声明的版本，其次 options.defaultVersion，最后当前最新版。 */
export function parseWorkoutDsl(text: string, options: ParseWorkoutDslOptions = {}): Workout {
  const source = String(text ?? "");
  const declared = detectWorkoutDslVersion(source);
  const version = declared ?? options.defaultVersion ?? CURRENT_WORKOUT_DSL_VERSION;
  const parser = WORKOUT_DSL_PARSERS[version];
  if (!parser) {
    const match = VERSION_LINE.exec(source);
    throw new WorkoutDslError("unsupported-version", `不支持的课程 DSL 版本 ${version}`, {
      text: source,
      position: match ? (match.index ?? 0) : 0,
      hint: `当前支持：${SUPPORTED_WORKOUT_DSL_VERSIONS.join("、")}；请升级解析器或改用受支持的版本`,
    });
  }
  return parser(source);
}

/** 序列化 Workout：按 AST 中的 dslVersion 分发给对应序列化器。 */
export function serializeWorkout(workout: Workout, options: SerializeWorkoutOptions = {}): string {
  const version = workout?.dslVersion;
  const serializer = version === undefined ? undefined : WORKOUT_DSL_SERIALIZERS[version];
  if (!serializer) {
    throw new Error(
      `不支持的课程 DSL 版本 ${String(version)}；当前支持：${SUPPORTED_WORKOUT_DSL_VERSIONS.join("、")}`,
    );
  }
  return serializer(workout, options);
}

/**
 * 冻结规范在包内的位置（相对包根）。
 *
 * 规范的事实来源是仓库根目录的 `spec/dsl/`，构建时由 `scripts/sync-spec.mjs` 逐字节复制到
 * 包内同名的 `spec/dsl/`，因此包内相对路径与仓库相对路径一致。这样「按版本的解析器」和
 * 「该版本的冻结文本」一起发布：只依赖 `@train-for-marathon/core/dsl/v1` 的平台，
 * 也能读到同一版本的规范。
 */
export const WORKOUT_DSL_SPEC_DIR = "spec/dsl";

/** 指定版本的冻结规范目录（相对包根）。 */
export function workoutDslSpecVersionDir(version: number): string {
  return `${WORKOUT_DSL_SPEC_DIR}/v${version}`;
}

/** 指定版本的冻结规范文件（相对包根）；文件名约定见 spec/dsl/README.md。 */
export function workoutDslSpecVersionFile(version: number): string {
  return `${workoutDslSpecVersionDir(version)}/workout-dsl-v${version}.md`;
}
