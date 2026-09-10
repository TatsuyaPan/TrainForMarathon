import { describe, expect, it } from "vitest";
import {
  DefaultTrainingDataService,
  SESSION_STATUS_LABELS,
  checkIn,
  createSetup,
  describeWorkout,
  ensureAthlete,
  findPlanDayById,
  getHomeSummary,
  getSetupState,
  mergeProgressRecords,
  resetSetup,
  todayIso,
} from "../src/workflow.js";
import { calculateTrainingPaces } from "../src/pace.js";
import { parseWorkoutDsl } from "../src/dsl/registry.js";
import { MemoryStore } from "./helpers/memory-store.js";

const RACE_DATE = "2026-11-15"; // 周日

describe("training workflow (platform-agnostic)", () => {
  it("bootstraps a local athlete and runs the full loop", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());

    // 虚拟用户（web 场景：无需登录）
    const athlete = await ensureAthlete(service);
    expect(athlete.provider).toBe("local");
    expect(athlete.id).toBeTruthy();
    expect((await getSetupState(service)).needsSetup).toBe(true);

    // 建立配置 → 课表
    const plan = await createSetup(service, athlete, {
      templateId: "20-week",
      raceDate: RACE_DATE,
      thresholdPaceSecondsPerKm: 240,
      maxWeeklyKm: 80,
    });
    expect(plan.id).toBe(`20-week:${RACE_DATE}`);
    expect(plan.weeks.length).toBe(20);
    expect((await getSetupState(service)).needsSetup).toBe(false);

    // 打卡两天
    const trainingDays = plan.weeks[19].days.filter(
      (day) => !day.items.every((item) => item.type === "REST"),
    );
    await checkIn(service, plan.id, {
      dayId: trainingDays[0].id,
      status: "completed",
      actualDistanceKm: 10,
      updatedAt: "2026-11-09T10:00:00.000Z",
    });
    await checkIn(service, plan.id, {
      dayId: trainingDays[1].id,
      status: "completed",
      actualDistanceKm: 12,
      updatedAt: "2026-11-10T10:00:00.000Z",
    });

    // 统计
    const summary = await getHomeSummary(service, plan, trainingDays[1].date);
    expect(summary.progressCount).toBe(2);
    expect(summary.weekStats?.completedSessions).toBe(2);
    expect(summary.weekStats?.actualDistanceKm).toBe(22);

    // 重置
    await resetSetup(service);
    expect((await getSetupState(service)).needsSetup).toBe(true);
    expect(await service.getPlan(plan.id)).toBeNull();
  });

  it("todayIso uses UTC calendar day", () => {
    expect(todayIso(new Date("2026-09-10T18:30:00.000Z"))).toBe("2026-09-10");
  });

  it("describes pace ranges fast-to-slow with a single unit", () => {
    // 阈值 4:00/km → E 3:10–3:30/km
    const paces = calculateTrainingPaces(240);

    const easy = describeWorkout(parseWorkoutDsl("GOAL:有氧基础\nMS:40min@E"), paces, {
      includeGoal: false,
    });
    expect(easy[0]).toContain("3:10–3:30/km（估算）");

    const custom = describeWorkout(
      parseWorkoutDsl("GOAL:自定义配速\nMS:5km@P4:45-5:00/km"),
      paces,
      { includeGoal: false },
    );
    expect(custom[0]).toContain("4:45–5:00/km（自定义配速）");

    // 单位只出现一次（历史缺陷：4:50/km–5:10/km/km）
    expect([...easy, ...custom].join(" ")).not.toContain("/km/km");
  });
});

describe("跨端共用的定位与合并规则", () => {
  it("按 dayId 定位计划日，找不到时返回 null", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    const athlete = await ensureAthlete(service);
    const plan = await createSetup(service, athlete, {
      templateId: "20-week",
      raceDate: RACE_DATE,
      thresholdPaceSecondsPerKm: 240,
      maxWeeklyKm: 80,
    });

    const day = plan.weeks[3].days[2];
    expect(findPlanDayById(plan, day.id)).toBe(day);
    expect(findPlanDayById(plan, "day-不存在")).toBeNull();
  });

  it("同一天会话优先，旧打卡只在没有会话时兜底", () => {
    const legacy = [
      { dayId: "day-1", status: "completed" as const, actualDistanceKm: 5, updatedAt: "2026-09-01T00:00:00.000Z" },
      { dayId: "day-2", status: "completed" as const, actualDistanceKm: 8, updatedAt: "2026-09-02T00:00:00.000Z" },
    ];
    const fromSessions = [
      { dayId: "day-1", status: "partial" as const, actualDistanceKm: 12, updatedAt: "2026-09-10T00:00:00.000Z" },
    ];

    const merged = mergeProgressRecords(legacy, fromSessions);
    expect(merged).toHaveLength(2);
    expect(merged.find((record) => record.dayId === "day-1")).toEqual(fromSessions[0]);
    expect(merged.find((record) => record.dayId === "day-2")).toEqual(legacy[1]);
  });

  it("会话状态文案覆盖全部状态，且各状态说法不重复", () => {
    expect(Object.keys(SESSION_STATUS_LABELS).sort()).toEqual(["done", "planned", "skipped"]);
    expect(new Set(Object.values(SESSION_STATUS_LABELS)).size).toBe(3);
  });
});
