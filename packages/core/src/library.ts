/**
 * 课程库：内置课程（书内各章推荐课表）+ 自定义课程。
 *
 * 课程内容的唯一事实来源是 `workout`（AST）；DSL 在展示或导出时即时序列化，
 * 因此课程库不会同时保存两份可能过期的内容。
 * 内置课程按 Workout DSL v1 全新重写（含训练目的），不再保留旧版语法。
 */
import { DANIELS_ZONES, type DanielsZone, type Workout } from "./domain.js";
import { deepClone } from "./clone.js";
import { parseWorkoutDsl, serializeWorkout } from "./dsl/registry.js";
import { normalizeWorkout, validateWorkout, workoutZones, type WorkoutIssue } from "./dsl/workout.js";

export const LIBRARY_CATEGORIES = ["E", "M", "T", "I", "R", "ST", "mixed"] as const;
export type LibraryCategory = (typeof LIBRARY_CATEGORIES)[number];
export type LibraryOrigin = "builtin" | "custom";

export const LIBRARY_CATEGORY_LABELS: Record<LibraryCategory, string> = {
  E: "轻松跑 / 长距离",
  M: "马拉松配速跑",
  T: "乳酸阈值跑",
  I: "最大摄氧量跑",
  R: "重复跑",
  ST: "跨步跑 / 神经激活",
  mixed: "混合刺激",
};

export const LIBRARY_CATEGORY_ORDER: readonly LibraryCategory[] = LIBRARY_CATEGORIES;

export interface LibraryCourse {
  id: string;
  origin: LibraryOrigin;
  category: LibraryCategory;
  /** 适用强度标签（用于筛选） */
  tags: DanielsZone[];
  /** 适用周跑量建议，供分档提示 */
  weeklyKmHint?: string;
  /** 来源说明：内置课程为书名，自定义课程为「自定义」或「复制自 …」 */
  source: string;
  /** 类型化出处：训练思想文章 id（如 training-types/threshold）；课程卡可直达原文 */
  sourceContentId?: string;
  workout: Workout;
  createdAt?: string;
  updatedAt?: string;
}

export interface LibraryIssue {
  code: string;
  message: string;
  path: string;
}

function isCategory(value: unknown): value is LibraryCategory {
  return typeof value === "string" && (LIBRARY_CATEGORIES as readonly string[]).includes(value);
}

/**
 * 标签默认取课程主分类；混合课程按实际出现的强度档位展开。
 * 标签表达训练重点，而不是“课程里出现过的所有档位”（热身、冷身不算重点）。
 */
function deriveTags(workout: Workout, category: LibraryCategory): DanielsZone[] {
  if (category === "mixed") {
    const zones = workoutZones(workout);
    return zones.length > 0 ? zones : [...DANIELS_ZONES];
  }
  return [category];
}

/**
 * 依据主训练阶段的强度档位推断课程分类：单一档位直接采用，多档位归为混合刺激。
 * 热身与冷身通常都是 E，不参与分类判断；没有主训练时归为混合刺激。
 *
 * 导入 DSL 后由各平台调用（Web 与小程序共用同一套推断规则），避免两端分类口径不一致。
 */
export function inferLibraryCategory(workout: Workout): LibraryCategory {
  const main = workout?.phases?.find((phase) => phase.role === "main");
  const zones = workoutZones(main ? { ...workout, phases: [main] } : workout);
  return zones.length === 1 ? zones[0] : "mixed";
}

const DANIELS_TAGS = new Set<string>(DANIELS_ZONES);

/** 校验课程库条目：元数据 + Workout 结构 */
export function validateLibraryCourse(course: LibraryCourse): LibraryIssue[] {
  const issues: LibraryIssue[] = [];
  if (!course || typeof course !== "object") {
    return [{ code: "invalid-course", message: "课程数据缺失", path: "course" }];
  }
  if (typeof course.id !== "string" || course.id.trim() === "") {
    issues.push({ code: "invalid-id", message: "课程缺少 id", path: "course.id" });
  }
  if (course.origin !== "builtin" && course.origin !== "custom") {
    issues.push({ code: "invalid-origin", message: "课程来源只能是内置或自定义", path: "course.origin" });
  }
  if (!isCategory(course.category)) {
    issues.push({ code: "invalid-category", message: `未知课程分类「${String(course.category)}」`, path: "course.category" });
  }
  if (!Array.isArray(course.tags) || course.tags.some((tag) => !DANIELS_TAGS.has(tag))) {
    issues.push({ code: "invalid-tags", message: "课程标签只能是 E/M/T/I/R/ST", path: "course.tags" });
  }
  if (!course.workout || typeof course.workout !== "object") {
    issues.push({ code: "invalid-workout", message: "课程缺少训练内容", path: "course.workout" });
    return issues;
  }
  for (const issue of validateWorkout(course.workout)) {
    issues.push({ code: issue.code, message: issue.message, path: `course.${issue.path}` });
  }
  return issues;
}

export interface CreateLibraryCourseInput {
  id?: string;
  origin?: LibraryOrigin;
  category: LibraryCategory;
  tags?: DanielsZone[];
  weeklyKmHint?: string;
  source?: string;
  sourceContentId?: string;
  workout: Workout;
  createdAt?: string;
  updatedAt?: string;
}

export function createLibraryCourseId(): string {
  return `course-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** 新建课程条目；校验不通过直接抛错（写入任何存储之前调用） */
export function createLibraryCourse(input: CreateLibraryCourseInput): LibraryCourse {
  const workout = normalizeWorkout(deepClone(input.workout));
  const timestamp = nowIso();
  const course: LibraryCourse = {
    id: input.id ?? createLibraryCourseId(),
    origin: input.origin ?? "custom",
    category: input.category,
    tags: input.tags && input.tags.length > 0 ? [...new Set(input.tags)] : deriveTags(workout, input.category),
    weeklyKmHint: input.weeklyKmHint,
    source: input.source ?? "自定义",
    sourceContentId: input.sourceContentId,
    workout,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
  };
  const issues = validateLibraryCourse(course);
  if (issues.length > 0) throw new Error(`课程无效：${issues[0].message}`);
  return course;
}

/** 更新自定义课程：保留 id 与 createdAt，刷新 updatedAt */
export function updateLibraryCourse(
  course: LibraryCourse,
  patch: Partial<Pick<LibraryCourse, "category" | "tags" | "weeklyKmHint" | "source" | "workout">>,
): LibraryCourse {
  const updated: LibraryCourse = {
    ...course,
    ...patch,
    // 标签始终复制一份：课程与调用方（响应式列表、批量导入）不共享数组引用
    tags: [...new Set(patch.tags ?? (patch.category && patch.category !== course.category
      ? deriveTags(patch.workout ?? course.workout, patch.category)
      : course.tags))],
    workout: normalizeWorkout(deepClone(patch.workout ?? course.workout)),
    updatedAt: nowIso(),
  };
  const issues = validateLibraryCourse(updated);
  if (issues.length > 0) throw new Error(`课程无效：${issues[0].message}`);
  return updated;
}

export interface CloneLibraryCourseOverrides {
  id?: string;
  category?: LibraryCategory;
  tags?: DanielsZone[];
  weeklyKmHint?: string;
  source?: string;
  title?: string;
}

/** 复制课程：深拷贝内容，生成新的自定义课程（标题存在时追加「（副本）」） */
export function cloneLibraryCourse(
  course: LibraryCourse,
  overrides: CloneLibraryCourseOverrides = {},
): LibraryCourse {
  const workout = deepClone(course.workout);
  const hasTitle = typeof workout.title === "string" && workout.title.trim() !== "";
  workout.title = overrides.title ?? (hasTitle ? `${workout.title!.trim()}（副本）` : workout.title);
  return createLibraryCourse({
    id: overrides.id ?? createLibraryCourseId(),
    origin: "custom",
    category: overrides.category ?? course.category,
    tags: overrides.tags ?? course.tags,
    weeklyKmHint: overrides.weeklyKmHint ?? course.weeklyKmHint,
    source: overrides.source ?? (course.origin === "builtin" ? `复制自《${course.source}》` : "复制自自定义课程"),
    sourceContentId: course.sourceContentId,
    workout,
  });
}

/** 序列化课程内容（导出/分享用） */
export function serializeLibraryCourse(course: LibraryCourse, options?: { version?: boolean }): string {
  return serializeWorkout(course.workout, options);
}

interface BuiltinSource {
  source: string;
  contentId?: string;
}

function builtin(
  id: string,
  category: LibraryCategory,
  source: string | BuiltinSource,
  dsl: string,
  weeklyKmHint?: string,
  tags?: DanielsZone[],
): LibraryCourse {
  const workout = parseWorkoutDsl(dsl);
  const sourceLabel = typeof source === "string" ? source : source.source;
  const sourceContentId = typeof source === "string" ? undefined : source.contentId;
  return {
    id,
    origin: "builtin",
    category,
    tags: tags ?? deriveTags(workout, category),
    weeklyKmHint,
    source: sourceLabel,
    sourceContentId,
    workout,
  };
}

const LINKS: BuiltinSource = { source: "《乳酸阈值跑》", contentId: "training-types/threshold" };
const VO2: BuiltinSource = { source: "《最大摄氧量跑》", contentId: "training-types/interval" };
const REP: BuiltinSource = { source: "《重复跑》", contentId: "training-types/repetition" };
const MARATHON: BuiltinSource = { source: "《马拉松配速跑》", contentId: "training-types/marathon" };
const EASY: BuiltinSource = { source: "《轻松跑》", contentId: "training-types/easy" };
const MIX: BuiltinSource = { source: "《混合训练》", contentId: "training-types/mixed" };

/** 内置课程（来源 = 书内表格，全部按 Workout DSL v1 重写） */
export const BUILTIN_COURSES: readonly LibraryCourse[] = [
  // ---- T 跑（《乳酸阈值跑》） ----
  builtin(
    "t-20min",
    "T",
    LINKS,
    ["TITLE:20 分钟阈值连续跑", "GOAL:乳酸阈能力", "MS:20min@T@RPE7"].join("\n"),
    "周跑量较低 / 基础期",
  ),
  builtin(
    "t-2k-x5",
    "T",
    LINKS,
    ["TITLE:2km×5 阈值跑", "GOAL:乳酸阈能力", "MS:5x(2km@T+2min@jog)"].join("\n"),
    "周跑量 160km 可加到 7-9 组",
  ),
  builtin(
    "t-6min-x8",
    "T",
    LINKS,
    [
      "TITLE:6 分钟阈值跑 ×8",
      "GOAL:乳酸阈能力",
      "WU:15min@E",
      "MS:8x(6min@T@RPE8+1min@jog)",
      "CD:10min@E",
    ].join("\n"),
    "周跑量 100-120km",
  ),
  builtin(
    "t-8min-x6",
    "T",
    LINKS,
    [
      "TITLE:8 分钟阈值跑 ×6",
      "GOAL:乳酸阈能力",
      "WU:15min@E",
      "MS:6x(8min@T@RPE8+90s@jog)",
      "CD:10min@E",
    ].join("\n"),
    "周跑量 ≥100km",
  ),
  builtin(
    "t-combo-50",
    "T",
    LINKS,
    [
      "TITLE:分段阈值 50 分钟",
      "GOAL:乳酸阈能力",
      "WU:15min@E",
      "MS:20min@T@RPE8+4min@jog+2x(10min@T@RPE8+2min@jog)+2x(5min@T@RPE8+1min@jog)",
      "CD:10min@E",
    ].join("\n"),
    "周跑量 ≥120km",
  ),
  builtin(
    "t-combo-50b",
    "T",
    LINKS,
    [
      "TITLE:递减阈值 20-15-10-5",
      "GOAL:乳酸阈能力",
      "WU:15min@E",
      "MS:20min@T@RPE8+4min@jog+15min@T@RPE8+2min@jog+10min@T@RPE8+2min@jog+5min@T@RPE8+1min@jog",
      "CD:10min@E",
    ].join("\n"),
    "周跑量 ≥120km",
  ),

  // ---- I 跑（《最大摄氧量跑》） ----
  builtin(
    "i-yasso-800",
    "I",
    VO2,
    ["TITLE:亚索 800", "GOAL:最大摄氧量", "WU:15min@E", "MS:10x(800m@I+3min@jog)", "CD:10min@E"].join("\n"),
    "通用",
  ),
  builtin(
    "i-1000-x8",
    "I",
    VO2,
    ["TITLE:1000m 间歇 ×8", "GOAL:最大摄氧量", "WU:15min@E", "MS:8x(1000m@I+3min@jog)", "CD:10min@E"].join("\n"),
    "通用",
  ),
  builtin(
    "i-3min-x8",
    "I",
    VO2,
    [
      "TITLE:3 分钟间歇 ×8",
      "GOAL:最大摄氧量",
      "WU:15min@E",
      "MS:8x(3min@I@RPE9+2min@jog)",
      "CD:10min@E",
    ].join("\n"),
    "非标准操场绕圈",
  ),
  builtin(
    "i-pyramid",
    "I",
    VO2,
    [
      "TITLE:I 强度金字塔",
      "GOAL:最大摄氧量",
      "WU:15min@E",
      "MS:3x(3min@I+2min@jog)+4x(2min@I+1min@jog)+5x(60s@I+30s@jog)",
      "CD:10min@E",
    ].join("\n"),
    "周跑量 100km 左右",
  ),
  builtin(
    "i-400-x20",
    "I",
    VO2,
    ["TITLE:400m 间歇 ×20", "GOAL:最大摄氧量", "WU:15min@E", "MS:20x(400m@I+90s@jog)", "CD:10min@E"].join("\n"),
    "通用",
  ),

  // ---- R 跑（《重复跑》） ----
  builtin(
    "r-200-x20",
    "R",
    REP,
    ["TITLE:200m 重复 ×20", "GOAL:速度与跑步经济性", "WU:15min@E", "MS:20x(200m@R+200m@jog)", "CD:10min@E"].join("\n"),
    "通用",
  ),
  builtin(
    "r-400-x10",
    "R",
    REP,
    ["TITLE:400m 重复 ×10", "GOAL:速度与跑步经济性", "WU:15min@E", "MS:10x(400m@R+400m@jog)", "CD:10min@E"].join("\n"),
    "通用",
  ),
  builtin(
    "r-200-400-combo",
    "R",
    REP,
    [
      "TITLE:200-400 组合重复",
      "GOAL:速度与跑步经济性",
      "WU:15min@E",
      "MS:4x(200m@R+200m@jog)+8x(400m@R+400m@jog)+4x(200m@R+200m@jog)",
      "CD:10min@E",
    ].join("\n"),
    "周跑量 100km 左右",
  ),
  builtin(
    "r-decreasing",
    "R",
    REP,
    [
      "TITLE:递减重复 600-400-200",
      "GOAL:速度与跑步经济性",
      "WU:15min@E",
      "MS:4x(600m@R+600m@jog)+4x(400m@R+400m@jog)+4x(200m@R+200m@jog)",
      "CD:10min@E",
    ].join("\n"),
    "周跑量 100km 左右",
  ),
  builtin(
    "r-800-hard",
    "R",
    REP,
    [
      "TITLE:高强度重复 800-400-200",
      "GOAL:速度与跑步经济性",
      "WU:15min@E",
      "MS:2x(800m@R+800m@jog)+4x(400m@R+400m@jog)+8x(200m@R+200m@jog)",
      "CD:10min@E",
    ].join("\n"),
    "高难度",
  ),

  // ---- M 跑（《马拉松配速跑》） ----
  builtin(
    "m-15km",
    "M",
    MARATHON,
    ["TITLE:15 公里马拉松配速跑", "GOAL:马拉松配速适应", "MS:15km@M@RPE7"].join("\n"),
    "控制距离",
  ),
  builtin(
    "m-60min",
    "M",
    MARATHON,
    ["TITLE:60 分钟马拉松配速跑", "GOAL:马拉松配速适应", "MS:60min@M@RPE7"].join("\n"),
    "控制时长",
  ),

  // ---- E / L（《轻松跑》） ----
  builtin(
    "e-40min",
    "E",
    EASY,
    ["TITLE:40 分钟轻松跑", "GOAL:有氧基础", "MS:40min@E"].join("\n"),
    "≥30min，按心率",
    ["E", "M"],
  ),
  builtin(
    "l-120min",
    "E",
    EASY,
    ["TITLE:120 分钟长距离", "GOAL:长距离耐力", "MS:120min@E"].join("\n"),
    "2-2.5h，不超周跑量 25%",
    ["E", "M"],
  ),

  // ---- ST 跨步跑（项目扩展强度） ----
  builtin(
    "st-100-x6",
    "ST",
    "《重复跑》· 项目扩展（ST）",
    [
      "TITLE:100m 跨步跑 ×6",
      "GOAL:神经激活与跑姿",
      "WU:15min@E",
      "MS:6x(100m@ST+100m@jog)",
      "CD:10min@E",
    ].join("\n"),
    "赛前或轻松跑后",
  ),
  builtin(
    "st-30s-x6",
    "ST",
    "《重复跑》· 项目扩展（ST）",
    [
      "TITLE:30 秒跨步跑 ×6",
      "GOAL:神经激活与跑姿",
      "WU:15min@E",
      "MS:6x(30s@ST+60s@jog)",
      "CD:10min@E",
    ].join("\n"),
    "场地受限时使用",
  ),

  // ---- 混合刺激（《混合训练》） ----
  builtin(
    "mix-pyramid-54321",
    "mixed",
    MIX,
    [
      "TITLE:54321 倒金字塔",
      "GOAL:混合刺激",
      "WU:15min@E",
      "MS:5km@M@RPE7+150s@jog+4km@T@RPE8+150s@jog+3km@T@RPE8+150s@jog+2km@I@RPE9+150s@jog+1km@I@RPE9",
      "CD:10min@E",
    ].join("\n"),
    "周跑量 100km 左右",
    ["T", "I", "M"],
  ),
  builtin(
    "mix-tm-short",
    "mixed",
    MIX,
    [
      "TITLE:TM 中短距离混合",
      "GOAL:混合刺激",
      "WU:15min@E",
      "MS:5km@M+3min@jog+20min@T@RPE8+3min@jog+3km@M",
      "CD:10min@E",
    ].join("\n"),
    "通用",
    ["T", "M"],
  ),
  builtin(
    "mix-tme-long",
    "mixed",
    MIX,
    [
      "TITLE:TME 长距离混合",
      "GOAL:混合刺激",
      "WU:5km@E",
      "MS:3x(3km@M+1km@T+1km@M+1km@E)",
      "CD:5km@E",
    ].join("\n"),
    "通用",
    ["T", "M", "E"],
  ),
  builtin(
    "mix-t-only",
    "mixed",
    MIX,
    [
      "TITLE:T 配速法特莱克",
      "GOAL:混合刺激",
      "WU:6.4km@E",
      "MS:4.8km@T+3min@jog+3.2km@T+2min@jog+3.2km@T+2min@jog+1.6km@T",
      "CD:3.2km@E",
    ].join("\n"),
    "周跑量 100km 左右",
    ["T", "E"],
  ),
  builtin(
    "mix-tir",
    "mixed",
    MIX,
    [
      "TITLE:TIR 混合课表",
      "GOAL:混合刺激",
      "WU:3.2km@E",
      "MS:3x(1.6km@T+1min@jog)+3x(1000m@I+2min@jog)+3x(400m@R+400m@jog)",
      "CD:3.2km@E",
    ].join("\n"),
    "通用",
    ["T", "I", "R", "E"],
  ),
  builtin(
    "mix-tr",
    "mixed",
    MIX,
    [
      "TITLE:TR 混合跑",
      "GOAL:混合刺激",
      "WU:15min@E",
      "MS:20min@T+4min@jog+10min@T+2min@jog+5x(400m@R+400m@jog)",
      "CD:10min@E",
    ].join("\n"),
    "通用",
    ["T", "R"],
  ),
];

/** 按分类筛选课程（内置 + 自定义都用 tags 匹配） */
export function listCoursesByCategory(
  courses: readonly LibraryCourse[],
  category?: LibraryCategory,
): LibraryCourse[] {
  if (!category) return [...courses];
  return courses.filter(
    (course) =>
      course.category === category ||
      (category !== "mixed" && course.tags.includes(category)),
  );
}

/** 按 id 查课程（先查内置，再查传入的自定义课程） */
export function getLibraryCourse(
  id: string,
  customCourses: readonly LibraryCourse[] = [],
): LibraryCourse | undefined {
  return BUILTIN_COURSES.find((course) => course.id === id) ??
    customCourses.find((course) => course.id === id);
}

/** 推荐（占位算法）：返回该分类第一条内置课程 */
export function recommendLibraryCourse(category: LibraryCategory): LibraryCourse | null {
  return BUILTIN_COURSES.find((course) => course.category === category) ?? null;
}

/** 内置 + 自定义课程合并列表 */
export function listAllCourses(customCourses: readonly LibraryCourse[]): LibraryCourse[] {
  return [...customCourses, ...BUILTIN_COURSES];
}
