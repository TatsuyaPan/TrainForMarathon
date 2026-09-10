import { describe, expect, it } from "vitest";
import { DefaultTrainingDataService } from "../src/workflow.js";
import { athleteFitness } from "../src/fitness.js";
import { createSetup, ensureAthlete, getSetupState, updateAthleteFitness } from "../src/workflow.js";
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

describe("athlete fitness management", () => {
  it("extracts fitness summary from profile", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    const athlete = await ensureAthlete(service);
    expect(athleteFitness(athlete)).toBeNull();
    const updated = await updateAthleteFitness(service, {
      mode: "vdot",
      raceResults: [
        { distanceM: 10000, timeSeconds: 45 * 60, label: "10k" },
        { distanceM: 5000, timeSeconds: 21 * 60, label: "5k" },
      ],
      isBeginner: false,
    });
    const fitness = athleteFitness(updated);
    expect(fitness?.mode).toBe("vdot");
    expect(fitness?.vdot).toBeGreaterThan(30);
    expect(fitness?.raceResults?.length).toBe(2);
  });

  it("switches to six-second mode and clears vdot", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    await ensureAthlete(service);
    await updateAthleteFitness(service, {
      mode: "vdot",
      raceResults: [{ distanceM: 10000, timeSeconds: 45 * 60 }],
    });
    const updated = await updateAthleteFitness(service, {
      mode: "sixSecond",
      thresholdPaceSecondsPerKm: 240,
    });
    const fitness = athleteFitness(updated);
    expect(fitness?.mode).toBe("sixSecond");
    expect(fitness?.thresholdPaceSecondsPerKm).toBe(240);
    expect(updated.vdot).toBeUndefined();
  });

  it("creates a plan reusing saved fitness when config omits pace (skip flow)", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    await ensureAthlete(service);
    await updateAthleteFitness(service, {
      mode: "vdot",
      raceResults: [{ distanceM: 10000, timeSeconds: 45 * 60, label: "10k" }],
    });
    // 只给模板/日期/跑量，不重复填能力（前端每次读最新档案）
    const athlete = (await service.getAthleteProfile())!;
    const plan = await createSetup(service, athlete, {
      templateId: "20-week",
      raceDate: RACE_DATE,
      maxWeeklyKm: 80,
    });
    expect(plan.weeks.length).toBe(20);
    expect(plan.paces.T.slow).toBeGreaterThan(0);
    const state = await getSetupState(service);
    expect(state.athlete?.vdot).toBeGreaterThan(30);
    expect(state.athlete?.raceResults?.length).toBe(1);
  });

  it("requires fitness when none exists", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    const athlete = await ensureAthlete(service);
    await expect(
      createSetup(service, athlete, { templateId: "20-week", raceDate: RACE_DATE, maxWeeklyKm: 80 }),
    ).rejects.toThrowError(/能力/);
  });

  it("overrides saved fitness with explicit config", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    const athlete = await ensureAthlete(service);
    await updateAthleteFitness(service, {
      mode: "vdot",
      raceResults: [{ distanceM: 10000, timeSeconds: 45 * 60 }],
    });
    const plan = await createSetup(service, athlete, {
      templateId: "5-week-cycle",
      raceDate: RACE_DATE,
      maxWeeklyKm: 60,
      paceMode: "sixSecond",
      thresholdPaceSecondsPerKm: 250,
    });
    const state = await getSetupState(service);
    expect(state.athlete?.thresholdPaceSecondsPerKm).toBe(250);
    expect(state.athlete?.vdot).toBeUndefined();
    expect(plan.paces.T).toEqual({ fast: 235, slow: 250 });
  });
});
