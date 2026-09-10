import { describe, expect, it } from "vitest";
import { DefaultTrainingDataService } from "../src/workflow.js";
import {
  addExtraSession,
  completeSession,
  createSetup,
  ensureDaySessions,
  getHomeSummary,
  sessionsToProgress,
  skipSession,
} from "../src/workflow.js";
import type { DataStore } from "../src/workflow.js";

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

const RACE_DATE = "2026-11-15";

describe("training session lifecycle", () => {
  it("lazily generates one planned session per training day (rest days excluded)", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    const athlete = (await service.getAthleteProfile()) ?? {
      id: "a", provider: "local", createdAt: "x", updatedAt: "x", schemaVersion: 1,
    };
    const plan = await createSetup(service, athlete, {
      templateId: "20-week",
      raceDate: RACE_DATE,
      maxWeeklyKm: 80,
      paceMode: "sixSecond",
      thresholdPaceSecondsPerKm: 240,
    });
    const trainingDay = plan.weeks[19].days.find((d) => !d.items.every((i) => i.type === "REST"));
    const restDay = plan.weeks[19].days.find((d) => d.items.every((i) => i.type === "REST"));

    const sessions = await ensureDaySessions(service, plan, trainingDay);
    expect(sessions.length).toBe(1);
    expect(sessions[0].status).toBe("planned");
    expect(sessions[0].plannedWorkout).toBeTruthy();
    expect(sessions[0].seq).toBe(0);
    // 幂等：再次调用不重复生成
    const again = await ensureDaySessions(service, plan, trainingDay);
    expect(again.length).toBe(1);

    const restSessions = await ensureDaySessions(service, plan, restDay);
    expect(restSessions.length).toBe(0);
  });

  it("completes a session with actual content and a training log", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    const athlete = (await service.getAthleteProfile()) ?? {
      id: "a", provider: "local", createdAt: "x", updatedAt: "x", schemaVersion: 1,
    };
    const plan = await createSetup(service, athlete, {
      templateId: "20-week", raceDate: RACE_DATE, maxWeeklyKm: 80,
      paceMode: "sixSecond", thresholdPaceSecondsPerKm: 240,
    });
    const day = plan.weeks[19].days.find((d) => !d.items.every((i) => i.type === "REST"));
    const [session] = await ensureDaySessions(service, plan, day);

    const done = await completeSession(service, session, {
      actualDistanceKm: 9.6,
      actualDurationMinutes: 42,
      actualRpe: 8,
      log: "状态不错，配速稳定",
      actualWorkout: { goal: "乳酸阈刺激", segments: [] },
    });
    expect(done.status).toBe("done");
    expect(done.actualDistanceKm).toBe(9.6);
    expect(done.log).toContain("配速稳定");
    expect(done.finishedAt).toBeTruthy();
  });

  it("skips a session and supports multiple sessions per day", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    const athlete = (await service.getAthleteProfile()) ?? {
      id: "a", provider: "local", createdAt: "x", updatedAt: "x", schemaVersion: 1,
    };
    const plan = await createSetup(service, athlete, {
      templateId: "20-week", raceDate: RACE_DATE, maxWeeklyKm: 80,
      paceMode: "sixSecond", thresholdPaceSecondsPerKm: 240,
    });
    const day = plan.weeks[19].days.find((d) => !d.items.every((i) => i.type === "REST"));
    const [planned] = await ensureDaySessions(service, plan, day);

    const extra = await addExtraSession(service, plan.id, day.id, {
      label: "补充轻松跑",
      plannedWorkout: { goal: "恢复", segments: [] },
    });
    expect(extra.seq).toBe(1);
    expect((await service.listSessions(plan.id, day.id)).length).toBe(2);

    await skipSession(service, planned);
    await completeSession(service, extra, { actualDistanceKm: 5, log: "补跑" });
    const records = sessionsToProgress(await service.listSessions(plan.id, day.id));
    expect(records).toHaveLength(2);
    // 同一天多会话：状态集合包含完成与跳过
    expect(records.map((r) => r.status).sort()).toEqual(["completed", "skipped"]);
  });

  it("home summary merges sessions (priority) with legacy progress", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    const athlete = (await service.getAthleteProfile()) ?? {
      id: "a", provider: "local", createdAt: "x", updatedAt: "x", schemaVersion: 1,
    };
    const plan = await createSetup(service, athlete, {
      templateId: "20-week", raceDate: RACE_DATE, maxWeeklyKm: 80,
      paceMode: "sixSecond", thresholdPaceSecondsPerKm: 240,
    });
    const day = plan.weeks[19].days.find((d) => !d.items.every((i) => i.type === "REST"));
    // 旧路径打卡 + 新路径会话
    await service.saveProgress(plan.id, { dayId: day.id, status: "completed", actualDistanceKm: 3, updatedAt: "2026-11-09T08:00:00.000Z" });
    const [session] = await ensureDaySessions(service, plan, day);
    await completeSession(service, session, { actualDistanceKm: 10, finishedAt: "2026-11-09T10:00:00.000Z" });

    const summary = await getHomeSummary(service, plan, day.date);
    // 会话优先：距离取 session 的 10km
    expect(summary.progressCount).toBe(1);
    expect(summary.progressRecords[0].actualDistanceKm).toBe(10);
  });
});
