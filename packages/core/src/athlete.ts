/**
 * 运动员（Athlete）模型：所有平台（微信小程序 / web / 测试）统一的数据结构。
 *
 * 平台差异只收敛在两处：
 * - 身份标识：微信登录 → openid；web → 本地生成的虚拟 id。
 * - 存储：微信 → 云数据库；web → localStorage；测试 → 内存。
 * 业务逻辑（课表生成、打卡、统计）完全不感知平台。
 */

export type AthleteProvider = "wechat" | "local";

export interface AthleteProfile {
  schemaVersion: 1;
  /** 平台用户标识：微信 openid / 本地虚拟 id */
  id: string;
  provider: AthleteProvider;
  /** 昵称（用户自由设置；微信侧可同步微信昵称） */
  name?: string;
  /** 当前课表 id（同模板同比赛日唯一） */
  planId?: string;
  templateId?: string;
  raceDate?: string;
  thresholdPaceSecondsPerKm?: number;
  maxWeeklyKm?: number;
  /** VDOT 评估（由多个比赛成绩推算）；存在时课表使用 VDOT 档位 */
  vdot?: number;
  raceResults?: Array<{ distanceM: number; timeSeconds: number; label?: string; date?: string }>;
  /** 新手/初跑者（低 VDOT ≤30）：使用原书表 5-3 新手配速表 */
  isBeginner?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAthleteInput {
  id: string;
  provider: AthleteProvider;
  /** 昵称（可选，用户自由设置） */
  name?: string;
  now?: string;
}

/** 创建运动员档案（虚拟用户）。微信登录后以 openid 为 id，web 用本地生成的 id。 */
export function createAthlete(input: CreateAthleteInput): AthleteProfile {
  const timestamp = input.now ?? new Date().toISOString();
  return {
    schemaVersion: 1,
    id: input.id,
    provider: input.provider,
    name: input.name,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

/** 生成本地运动员 id（web/测试环境，无需登录） */
export function createLocalAthleteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `athlete-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** 判断档案是否已建立训练配置 */
export function hasTrainingSetup(profile: AthleteProfile | null | undefined): profile is AthleteProfile & { planId: string } {
  return Boolean(profile?.planId);
}
