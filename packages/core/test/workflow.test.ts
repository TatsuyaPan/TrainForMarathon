import { describe, expect, it } from "vitest";
import {
  DefaultTrainingDataService,
  checkIn,
  createSetup,
  ensureAthlete,
  getHomeSummary,
  getSetupState,
  resetSetup,
  todayIso,
} from "../src/workflow.js";
import type { DataStore } from "../src/workflow.js";

/** 内存 DataStore（模拟任何平台存储） */
class MemoryStore implements DataStore {
  private collections = new Map<string, Map<string, unknown>>();

  async get(collection: string, id: string): Promise<unknown | null> {
    return this.collections.get(collection)?.get(id) ?? null;
  }

  async set(collection: string, id: string, value: unknown): Promise<void> {
    if (!this.collections.has(collection)) this.collections.set(collection, new Map());
    this.collections.get(collection)!.set(id, structuredClone(value));
  }

  async list(collection: string, filters: Record<string, unknown> = {}): Promise<unknown[]> {
    return [...(this.collections.get(collection)?.values() ?? [])].filter((doc) =>
      Object.entries(filters).every(([key, value]) => (doc as Record<string, unknown>)[key] === value),
    );
  }

  async delete(collection: string, id: string): Promise<void> {
    this.collections.get(collection)?.delete(id);
  }
}

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
});
