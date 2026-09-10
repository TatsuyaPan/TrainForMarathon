/**
 * 新手/低 VDOT 训练配速表（原书《丹尼尔斯经典跑步训练法》表 5-3，VDOT 20-30）。
 * 适用于初跑者和从较慢水平起步的跑者；常规 VDOT 表从 30 开始，该表补足 20-29。
 *
 * 数据来源：原书表 5-3「适用于初跑者和其他从较慢水平起步的人」；
 * 字段为分段时间（R/I/T 的 200m-1.6km 单圈时间）与 M 马拉松总时间/均配。
 * 注意：M 列为马拉松实际均配（含长距离经验修正），与公式百分比推算存在偏差，
 * 新手档一律查表而非公式。
 */

export interface BeginnerTableRow {
  vdot: number;
  /** 1.6 公里比赛时间（秒） */
  race1600Seconds: number;
  /** 5 公里比赛时间（秒） */
  race5kSeconds: number;
  r200Seconds?: number;
  r300Seconds?: number;
  i200Seconds?: number;
  i400Seconds?: number;
  t400Seconds?: number;
  t1000Seconds?: number;
  t1600Seconds?: number;
  /** M 马拉松总时间（秒） */
  marathonTotalSeconds: number;
  /** M 平均配速（秒/公里） */
  mPacePerKmSeconds: number;
  mPacePer1600Seconds: number;
}

/** 时分秒序列解析：[9,10]→550s；[4,57,0]→17820s */
function hms(parts: number[]): number {
  let seconds = 0;
  for (const part of parts) seconds = seconds * 60 + part;
  return seconds;
}

/** 表 5-3 数据（来源：原书第 5 章表 5-3） */
export const BEGINNER_TABLE: readonly BeginnerTableRow[] = [
  { vdot: 30, race1600Seconds: hms([9, 10]), race5kSeconds: hms([30, 40]), r200Seconds: 68, r300Seconds: 102, i200Seconds: 71, i400Seconds: 144, t400Seconds: 153, t1000Seconds: 384, t1600Seconds: 618, marathonTotalSeconds: hms([4, 57, 0]), mPacePerKmSeconds: 423, mPacePer1600Seconds: 681 },
  { vdot: 29, race1600Seconds: hms([9, 27]), race5kSeconds: hms([31, 32]), r200Seconds: 70, r300Seconds: 105, i200Seconds: 74, i400Seconds: 148, t400Seconds: 157, t1000Seconds: 394, t1600Seconds: 634, marathonTotalSeconds: hms([5, 6, 0]), mPacePerKmSeconds: 435, mPacePer1600Seconds: 701 },
  { vdot: 28, race1600Seconds: hms([9, 44]), race5kSeconds: hms([32, 27]), r200Seconds: 73, r300Seconds: 109, i200Seconds: 77, i400Seconds: 154, t400Seconds: 162, t1000Seconds: 405, t1600Seconds: 652, marathonTotalSeconds: hms([5, 15, 0]), mPacePerKmSeconds: 447, mPacePer1600Seconds: 722 },
  { vdot: 27, race1600Seconds: hms([10, 2]), race5kSeconds: hms([33, 25]), r200Seconds: 75, r300Seconds: 113, i200Seconds: 79, i400Seconds: 158, t400Seconds: 166, t1000Seconds: 416, t1600Seconds: 670, marathonTotalSeconds: hms([5, 25, 0]), mPacePerKmSeconds: 461, mPacePer1600Seconds: 744 },
  { vdot: 26, race1600Seconds: hms([10, 22]), race5kSeconds: hms([34, 27]), r200Seconds: 78, r300Seconds: 117, i200Seconds: 82, i400Seconds: 164, t400Seconds: 171, t1000Seconds: 429, t1600Seconds: 690, marathonTotalSeconds: hms([5, 35, 0]), mPacePerKmSeconds: 476, mPacePer1600Seconds: 767 },
  { vdot: 25, race1600Seconds: hms([10, 43]), race5kSeconds: hms([35, 33]), r200Seconds: 81, r300Seconds: 122, i200Seconds: 84, i400Seconds: 168, t400Seconds: 176, t1000Seconds: 441, t1600Seconds: 711, marathonTotalSeconds: hms([5, 45, 0]), mPacePerKmSeconds: 490, mPacePer1600Seconds: 791 },
  { vdot: 24, race1600Seconds: hms([11, 6]), race5kSeconds: hms([36, 44]), r200Seconds: 84, r300Seconds: undefined, i200Seconds: 87, i400Seconds: 175, t400Seconds: 182, t1000Seconds: 455, t1600Seconds: 733, marathonTotalSeconds: hms([5, 56, 0]), mPacePerKmSeconds: 506, mPacePer1600Seconds: 816 },
  { vdot: 23, race1600Seconds: hms([11, 30]), race5kSeconds: hms([38, 1]), r200Seconds: 87, r300Seconds: undefined, i200Seconds: 90, i400Seconds: 181, t400Seconds: 188, t1000Seconds: 470, t1600Seconds: 756, marathonTotalSeconds: hms([6, 8, 0]), mPacePerKmSeconds: 523, mPacePer1600Seconds: 842 },
  { vdot: 22, race1600Seconds: hms([11, 56]), race5kSeconds: hms([39, 22]), r200Seconds: 90, r300Seconds: undefined, i200Seconds: 93, i400Seconds: 187, t400Seconds: 194, t1000Seconds: 486, t1600Seconds: 782, marathonTotalSeconds: hms([6, 19, 0]), mPacePerKmSeconds: 539, mPacePer1600Seconds: 869 },
  { vdot: 21, race1600Seconds: hms([12, 24]), race5kSeconds: hms([40, 49]), r200Seconds: 93, r300Seconds: undefined, i200Seconds: 96, i400Seconds: 193, t400Seconds: 201, t1000Seconds: 503, t1600Seconds: 809, marathonTotalSeconds: hms([6, 31, 0]), mPacePerKmSeconds: 556, mPacePer1600Seconds: 897 },
  { vdot: 20, race1600Seconds: hms([12, 55]), race5kSeconds: hms([42, 24]), r200Seconds: 97, r300Seconds: undefined, i200Seconds: 100, i400Seconds: 201, t400Seconds: 208, t1000Seconds: 521, t1600Seconds: 838, marathonTotalSeconds: hms([6, 44, 0]), mPacePerKmSeconds: 574, mPacePer1600Seconds: 926 },
];

/** 按 VDOT（向下取整匹配）查新手表；超出范围返回 undefined */
export function lookupBeginnerRow(vdot: number): BeginnerTableRow | undefined {
  const floored = Math.floor(vdot);
  return BEGINNER_TABLE.find((row) => row.vdot === floored);
}

/** 该 VDOT 是否属于新手区间（≤30） */
export function isBeginnerVdot(vdot: number): boolean {
  return vdot <= 30;
}
