/**
 * 能力（Fitness）领域模块：能力摘要与平台无关的展示数据。
 *
 * 所有平台（微信小程序 / web / 测试）共用这里的档位表与格式化，
 * 平台只负责渲染，不再各自拼配速文案，避免同一份能力在不同页面说法不一致。
 */
import type { AthleteProfile } from "./athlete.js";
import type { DanielsZone } from "./domain.js";
import { calculateSixSecondPaces, formatPace, type PaceRange } from "./pace.js";
import { COMMON_RACE_DISTANCES, pacesFromVdot, type RaceResult } from "./vdot.js";

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

/** 一个档位的展示行：档位字母 + 名称 + 配速文案 + 依据说明 */
export interface PaceZoneRow {
  zone: DanielsZone;
  name: string;
  value: string;
  note: string;
}

/** 配速区间文案（如「4:45/km – 5:00/km」）；缺失时返回占位符 */
function rangeText(range: PaceRange | null | undefined): string {
  return range ? `${formatPace(range.slow)} – ${formatPace(range.fast)}` : "—";
}

/** 6 秒规则档位表：T 为基准，I/R 各减 15 秒，E/M 为估算 */
export function sixSecondPaceRows(thresholdPaceSecondsPerKm: number): PaceZoneRow[] {
  const paces = calculateSixSecondPaces(thresholdPaceSecondsPerKm);
  return [
    {
      zone: "E",
      name: "轻松跑",
      value: "按心率（≈阈值 -40s）",
      note: "心率 65-78% 或 MAF180",
    },
    {
      zone: "M",
      name: "马拉松配速",
      value: `≈ ${formatPace(thresholdPaceSecondsPerKm - 15)}（估算）`,
      note: "低于阈值约 15 秒",
    },
    { zone: "T", name: "阈值跑", value: rangeText(paces.T), note: "基准 = 阈值配速" },
    { zone: "I", name: "最大摄氧量跑", value: rangeText(paces.I), note: "6 秒规则：阈值 -30s ∼ -15s" },
    { zone: "R", name: "重复跑", value: rangeText(paces.R), note: "6 秒规则：阈值 -45s ∼ -30s" },
  ];
}

/** VDOT 档位表：五个档位都按 Daniel 的 VDOT 百分比推算 */
export function vdotPaceRows(vdot: number): PaceZoneRow[] {
  const paces = pacesFromVdot(vdot);
  return [
    { zone: "E", name: "轻松跑", value: rangeText(paces.E), note: "VDOT 62-72%" },
    { zone: "M", name: "马拉松配速", value: rangeText(paces.M), note: "按马拉松预估时间反推" },
    { zone: "T", name: "阈值跑", value: rangeText(paces.T), note: "VDOT 88.4%" },
    { zone: "I", name: "最大摄氧量跑", value: rangeText(paces.I), note: "VDOT 97.7%" },
    { zone: "R", name: "重复跑", value: rangeText(paces.R), note: "VDOT 105.8%" },
  ];
}

/** 能力摘要 → 档位表；尚未建立能力返回空数组 */
export function fitnessPaceRows(fitness: AthleteFitness | null | undefined): PaceZoneRow[] {
  if (!fitness) return [];
  if (fitness.mode === "vdot") {
    return fitness.vdot ? vdotPaceRows(fitness.vdot) : [];
  }
  return fitness.thresholdPaceSecondsPerKm ? sixSecondPaceRows(fitness.thresholdPaceSecondsPerKm) : [];
}

/** 能力基准模式文案，例如「VDOT 45.0（新手表）」或「6 秒规则（阈值配速）」 */
export function fitnessModeLabel(fitness: AthleteFitness | null | undefined): string {
  if (!fitness) return "尚未建立能力";
  if (fitness.mode === "vdot") {
    const suffix = fitness.isBeginner ? "（新手表）" : "";
    return `VDOT ${(fitness.vdot ?? 0).toFixed(1)}${suffix}`;
  }
  return "6 秒规则（阈值配速）";
}

/** 比赛距离简称（如「半马」「10 公里」）；非常用距离回退为米数 */
export function raceDistanceLabel(meters: number): string {
  const found = COMMON_RACE_DISTANCES.find((item) => Math.abs(item.meters - meters) < 1);
  return found?.label ?? `${Math.round(meters)} 米`;
}

/** 成绩时长文案：秒数 → 45:00 / 1:24:30 */
export function formatRaceTime(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
  }
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** 成绩时长解析：45:00 / 1:24:30 → 秒；无法解析返回 NaN */
export function parseRaceTime(text: string): number {
  const trimmed = String(text ?? "").trim();
  if (trimmed === "") return Number.NaN;
  const parts = trimmed.split(":").map((part) => Number(part.trim()));
  if (parts.some((part) => !Number.isFinite(part) || part < 0)) return Number.NaN;
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds;
}

/** 单条比赛成绩文案：10 公里 45:00（夏季自测）· 2026-08-01 */
export function raceResultLine(result: RaceResult): string {
  const label = result.label ? `（${result.label}）` : "";
  const date = result.date ? ` · ${result.date}` : "";
  return `${raceDistanceLabel(result.distanceM)} ${formatRaceTime(result.timeSeconds)}${label}${date}`;
}

/** 多条比赛成绩文案，用「；」连接 */
export function raceResultsSummary(results: readonly RaceResult[] | null | undefined): string {
  if (!results?.length) return "";
  return results.map(raceResultLine).join("；");
}
