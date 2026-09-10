/**
 * DSL 错误：带错误码、字符位置、行列与可选修复提示。
 * 冻结规范见 spec/dsl/v1/workout-dsl-v1.md。
 */

export type WorkoutDslErrorCode =
  | "empty-document"
  | "unknown-line"
  | "metadata-order"
  | "metadata-duplicate"
  | "metadata-after-phase"
  | "invalid-version"
  | "unsupported-version"
  | "missing-goal"
  | "empty-goal"
  | "missing-main-phase"
  | "duplicate-phase"
  | "phase-order"
  | "empty-phase"
  | "unexpected-token"
  | "empty-repeat"
  | "repeat-too-deep"
  | "unknown-target"
  | "unknown-attribute"
  | "invalid-load"
  | "invalid-number"
  | "invalid-value"
  | "rest-load-unit"
  | "trailing-content";

export interface LineColumn {
  line: number;
  column: number;
}

/** 计算字符位置（0 基）所在的行列（均从 1 开始） */
export function lineColumnAt(text: string, position: number): LineColumn {
  const bounded = Math.max(0, Math.min(position, text.length));
  let line = 1;
  let lineStart = 0;
  for (let index = 0; index < bounded; index += 1) {
    const char = text[index];
    if (char === "\n") {
      line += 1;
      lineStart = index + 1;
    } else if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      line += 1;
      lineStart = index + 1;
      if (bounded === index) break;
    }
  }
  return { line, column: bounded - lineStart + 1 };
}

export interface WorkoutDslErrorInit {
  /** 完整 DSL 文本，用于换算行列 */
  text: string;
  /** 出错字符位置（0 基） */
  position: number;
  /** 可选修复提示，会追加到消息尾部 */
  hint?: string;
}

/**
 * 解析错误。`message` 是可直接展示给用户的完整文本：
 * `第 2 行第 15 列：未知训练目标 "H"。支持 E/M/T/I/R/ST、配速范围、心率范围和 RPE。`
 */
export class WorkoutDslError extends Error {
  readonly code: WorkoutDslErrorCode;
  readonly position: number;
  readonly line: number;
  readonly column: number;
  readonly hint?: string;

  constructor(code: WorkoutDslErrorCode, message: string, init: WorkoutDslErrorInit) {
    const { line, column } = lineColumnAt(init.text, init.position);
    const suffix = init.hint ? `。${init.hint}` : "";
    super(`第 ${line} 行第 ${column} 列：${message}${suffix}`);
    this.name = "WorkoutDslError";
    this.code = code;
    this.position = init.position;
    this.line = line;
    this.column = column;
    this.hint = init.hint;
  }
}

export function isWorkoutDslError(value: unknown): value is WorkoutDslError {
  return value instanceof WorkoutDslError;
}

/** 把任意异常转为可展示文本（DSL 错误直接使用其消息） */
export function describeWorkoutDslError(value: unknown): string {
  if (isWorkoutDslError(value)) return value.message;
  if (value instanceof Error) return value.message;
  return String(value);
}
