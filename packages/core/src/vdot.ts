/**
 * VDOT 模型（丹尼尔斯/吉尔伯特公式）：
 * 多个不同距离的最佳成绩 → VDOT → 各训练档位配速（E/M/T/I/R）。
 *
 * 公式（开源实现，Apache-2.0，作者已按官方丹尼尔斯表在 VDOT 45/55/65 校验）：
 *   VO2(ml/kg/min) = -4.60 + 0.182258v + 0.000104v²   （v: 米/分钟）
 *   %max(t) = 0.8 + 0.1894393e^(-0.012778t) + 0.2989558e^(-0.1932605t)  （t: 分钟）
 *   VDOT = VO2(成绩配速) / %max(成绩用时)
 * 训练档位 = VDOT × 百分比 → 反解速度 → 配速（秒/公里）
 *
 * 数据来源标注：原书《丹尼尔斯经典跑步训练法》VDOT 表；实现参考开源
 * Daniels/Gilbert 模型（HuggingFace hoodarunner/running-coach-sft，Apache-2.0）。
 */
import type { TrainingPaces } from "./pace.js";

/** 训练强度占 VDOT 的百分比（与官方表一致） */
export const VDOT_INTENSITY_FACTORS = {
  E_slow: 0.62, // 轻松跑慢端
  E_fast: 0.72, // 轻松跑快端
  M: 0.842, // 马拉松配速
  T: 0.884, // 乳酸阈
  I: 0.977, // 最大摄氧量
  R: 1.058, // 重复跑（速度）
} as const;

export interface RaceResult {
  distanceM: number;
  timeSeconds: number;
  label?: string;
  /** 取得该成绩的日期（YYYY-MM-DD 或 ISO）；缺省视为录入当天 */
  date?: string;
}

/** 成绩时效参数（天） */
export const FITNESS_IGNORE_AFTER_DAYS = 180; // 半年以上忽略
export const FITNESS_THRESHOLD_PRIORITY_DAYS = 60; // 两个月内乳酸域成绩最高
export const FITNESS_RECENT_PB_DAYS = 30; // 一个月内所有 PB 同时段

/** 类型优先级：15/16km > 10km > 半马 > 其他（训练配速建议视角，非成绩预测） */
export function raceTypePriority(meters: number): number {
  if (meters >= 14000 && meters <= 17000) return 0; // 15/16km
  if (Math.abs(meters - 10000) < 200) return 1; // 10km
  if (Math.abs(meters - 21097.5) < 200) return 2; // 半马
  return 3;
}

/** 是否为乳酸域成绩（10k-16km） */
export function isThresholdDomainRace(meters: number): boolean {
  return meters >= 9000 && meters <= 17000;
}

export interface FitnessRaceSelection {
  selected: RaceResult | null;
  /** 因超期被忽略的数量 */
  ignoredCount: number;
}

/**
 * 按时效与类型优先级选择最有代表性的成绩（用于推算训练配速，而非预测成绩）：
 * 1. 超过 180 天的成绩忽略；
 * 2. 最近 60 天内的乳酸域成绩（10k-16km）优先级最高；
 * 3. 最近 30 天内的所有成绩视为同一时段，不区分时间先后；
 * 4. 更久远的成绩越新越好；
 * 5. 同档内类型优先级：15/16km > 10km > 半马 > 其他。
 */
export function selectFitnessRace(
  results: readonly RaceResult[],
  options: { now?: string } = {},
): FitnessRaceSelection {
  const now = new Date(options.now ?? new Date().toISOString());
  const daysAge = (result: RaceResult): number => {
    const recorded = result.date ? new Date(result.date).getTime() : now.getTime();
    return Math.max(0, (now.getTime() - recorded) / 86_400_000);
  };
  const valid = results.filter((result) => daysAge(result) <= FITNESS_IGNORE_AFTER_DAYS);
  const ignoredCount = results.length - valid.length;
  if (valid.length === 0) return { selected: null, ignoredCount };

  const score = (result: RaceResult): number[] => {
    const age = daysAge(result);
    const thresholdNow = isThresholdDomainRace(result.distanceM) && age <= FITNESS_THRESHOLD_PRIORITY_DAYS;
    const recent = age <= FITNESS_RECENT_PB_DAYS;
    const bucket = thresholdNow ? 0 : recent ? 1 : 2;
    return [bucket, raceTypePriority(result.distanceM), age];
  };
  const sorted = [...valid].sort((a, b) => {
    const sa = score(a);
    const sb = score(b);
    for (let index = 0; index < sa.length; index += 1) {
      if (sa[index] !== sb[index]) return sa[index] - sb[index];
    }
    return 0;
  });
  return { selected: sorted[0], ignoredCount };
}

/** 速度（米/分钟）→ 每公斤每分钟摄氧量 */
export function vo2AtVelocity(vMetersPerMin: number): number {
  return -4.6 + 0.182258 * vMetersPerMin + 0.000104 * vMetersPerMin ** 2;
}

/** 摄氧量 → 速度（米/分钟），解二次方程 */
export function velocityAtVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -4.6 - vo2;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** 可持续最大摄氧量比例（t: 分钟） */
export function pctMaxForDuration(tMinutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * tMinutes) +
    0.2989558 * Math.exp(-0.1932605 * tMinutes)
  );
}

/** 一次成绩 → VDOT */
export function vdotFromRace(distanceM: number, timeSeconds: number): number {
  if (!Number.isFinite(distanceM) || distanceM <= 0) throw new Error("距离必须为正数");
  if (!Number.isFinite(timeSeconds) || timeSeconds <= 0) throw new Error("时间必须为正数");
  const tMinutes = timeSeconds / 60;
  const v = distanceM / tMinutes;
  return vo2AtVelocity(v) / pctMaxForDuration(tMinutes);
}

/** VDOT → 该距离的预测完赛时间（秒），二分反解 */
export function raceTimeFromVdot(vdot: number, distanceM: number): number {
  let low = 60;
  let high = 6 * 3600;
  for (let index = 0; index < 80; index += 1) {
    const mid = (low + high) / 2;
    if (vdotFromRace(distanceM, mid) > vdot) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** VDOT × 百分比 → 该档配速（秒/公里） */
export function paceSecondsPerKm(factor: number, vdot: number): number {
  const v = velocityAtVo2(factor * vdot);
  return (1000 / v) * 60;
}

/**
 * VDOT → 完整训练档位（TrainingPaces，秒/公里）。
 * E 用官方区间（62-72%）；T/I/R 用百分比单点展开 ±5 秒；M 用马拉松总时间反推
 * 均配（原书 M 列为马拉松实际配速，含长距离经验修正，低 VDOT 下与固定百分比偏差明显）。
 * 新手/低 VDOT（≤30）请优先查 BEGINNER_TABLE（表 5-3），本函数公式版作为兜底。
 */
export function pacesFromVdot(vdot: number): TrainingPaces {
  if (!Number.isFinite(vdot) || vdot < 20 || vdot > 85) {
    throw new Error(`VDOT 超出合理范围（20-85），实际 ${vdot}`);
  }
  const around = (factor: number): { slow: number; fast: number } => {
    const center = paceSecondsPerKm(factor, vdot);
    return { slow: center + 5, fast: center - 5 };
  };
  const mPace = raceTimeFromVdot(vdot, 42195) / 42.195;
  return {
    E: {
      slow: paceSecondsPerKm(VDOT_INTENSITY_FACTORS.E_slow, vdot),
      fast: paceSecondsPerKm(VDOT_INTENSITY_FACTORS.E_fast, vdot),
    },
    M: { slow: mPace + 5, fast: mPace - 5 },
    T: around(VDOT_INTENSITY_FACTORS.T),
    I: around(VDOT_INTENSITY_FACTORS.I),
    R: around(VDOT_INTENSITY_FACTORS.R),
  };
}

export interface VdotAssessment {
  vdot: number;
  /** 按时效+类型优先级选中的基准成绩 */
  contributingResult: RaceResult;
  paces: TrainingPaces;
  /** 因超期被忽略的成绩数 */
  ignoredCount: number;
}

/**
 * 成绩 → VDOT（按优先级选择最具代表性的成绩，而非取最大）：
 * 过滤超期 → 时效/类型排序 → 取第一 → VDOT → 档位。
 * 原书思路：以近期最具代表性的成绩推算当前训练配速能力。
 */
export function assessFromResults(
  results: readonly RaceResult[],
  options: { now?: string } = {},
): VdotAssessment {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error("至少提供一个比赛成绩");
  }
  const { selected, ignoredCount } = selectFitnessRace(results, options);
  if (!selected) {
    throw new Error(`所有成绩均已超过 ${FITNESS_IGNORE_AFTER_DAYS} 天，请更新近期成绩`);
  }
  const vdot = vdotFromRace(selected.distanceM, selected.timeSeconds);
  return {
    vdot,
    contributingResult: selected,
    paces: pacesFromVdot(vdot),
    ignoredCount,
  };
}

/** 常用比赛距离（米），供成绩输入快捷选择 */
export const COMMON_RACE_DISTANCES: ReadonlyArray<{ key: string; label: string; meters: number }> = [
  { key: "1500m", label: "1500 米", meters: 1500 },
  { key: "3000m", label: "3000 米", meters: 3000 },
  { key: "5k", label: "5 公里", meters: 5000 },
  { key: "8k", label: "8 公里", meters: 8000 },
  { key: "10k", label: "10 公里", meters: 10000 },
  { key: "half", label: "半马", meters: 21097.5 },
  { key: "marathon", label: "全马", meters: 42195 },
];
