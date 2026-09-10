import { describe, expect, it } from "vitest";
import { instantiatePlan } from "../src/plans/instantiate.js";
import type { PlanInstance, PlanInstanceDay } from "../src/domain.js";
import { DefaultTrainingDataService } from "../src/workflow.js";
import type { DataStore, TrainingDataService } from "../src/workflow.js";
import {
  addExtraSession,
  applyDayAlternative,
  completeSession,
  ensureDaySessions,
  isPlanSlotSession,
  removeSession,
  sessionOrigin,
  swapTrainingDays,
} from "../src/workflow.js";

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

type Plan = PlanInstance & { id: string };

function createPlan(): Plan {
  return {
    id: "plan-1",
    ...instantiatePlan("20-week", {
      raceDate: "2027-03-21",
      thresholdPaceSecondsPerKm: 220,
      maxWeeklyKm: 100,
    }),
  };
}

function dayOf(plan: Plan, weekNumber: number, dayIndex: number): PlanInstanceDay {
  const week = plan.weeks.find((entry) => entry.week === weekNumber);
  if (!week) throw new Error(`missing week ${weekNumber}`);
  return week.days[dayIndex];
}

/** 取课表里第一个跑步步骤的强度档（循环里也算），用于断言重建后的内容 */
function firstRunZone(workout: PlanInstanceDay["workout"]): string | undefined {
  const first = workout?.phases[0]?.segments[0];
  if (!first) return undefined;
  const step = first.kind === "repeat" ? first.segments[0] : first;
  return step && step.kind === "run" && step.target.type === "daniels" ? step.target.zone : undefined;
}

function setup(): { service: TrainingDataService; plan: Plan } {
  const service = new DefaultTrainingDataService(new MemoryStore());
  return { service, plan: createPlan() };
}

describe("调整课表：结构化课表跟随训练内容", () => {
  it("互换训练日时把 workout 一起搬走（跑休日不会留下旧课表）", async () => {
    const { service, plan } = setup();
    await service.savePlan(plan);
    const goal = dayOf(plan, 20, 1).workout?.goal;
    expect(dayOf(plan, 20, 0).workout).toBeUndefined();

    const updated = await swapTrainingDays(service, plan, 20, 0, 1);

    expect(updated.weeks.find((w) => w.week === 20)?.days[0]).toMatchObject({
      id: dayOf(plan, 20, 0).id,
      date: dayOf(plan, 20, 0).date,
      label: dayOf(plan, 20, 1).label,
    });
    expect(dayOf(updated, 20, 0).workout?.goal).toBe(goal);
    expect(dayOf(updated, 20, 1).workout).toBeUndefined();
  });

  it("互换两个训练日时，计划位会话同步到各自的新课表", async () => {
    const { service, plan } = setup();
    await service.savePlan(plan);
    await ensureDaySessions(service, plan, dayOf(plan, 20, 1));
    await ensureDaySessions(service, plan, dayOf(plan, 20, 2));
    const firstGoal = dayOf(plan, 20, 1).workout?.goal;
    const secondGoal = dayOf(plan, 20, 2).workout?.goal;

    const updated = await swapTrainingDays(service, plan, 20, 1, 2);

    const sessionsOfFirst = await service.listSessions(plan.id, dayOf(plan, 20, 1).id);
    const sessionsOfSecond = await service.listSessions(plan.id, dayOf(plan, 20, 2).id);
    expect(sessionsOfFirst[0]).toMatchObject({ seq: 0, status: "planned", origin: "plan" });
    expect(sessionsOfFirst[0].label).toBe(dayOf(updated, 20, 1).label);
    expect(sessionsOfFirst[0].plannedWorkout?.goal).toBe(secondGoal);
    expect(sessionsOfSecond[0].plannedWorkout?.goal).toBe(firstGoal);
  });

  it("训练日换成休息日后，计划位会话被移除", async () => {
    const { service, plan } = setup();
    await service.savePlan(plan);
    const trainingDay = dayOf(plan, 20, 1);
    await ensureDaySessions(service, plan, trainingDay);
    expect(await service.listSessions(plan.id, trainingDay.id)).toHaveLength(1);

    const updated = await swapTrainingDays(service, plan, 20, 0, 1);

    expect(await service.listSessions(plan.id, trainingDay.id)).toHaveLength(0);
    const restDay = dayOf(updated, 20, 0);
    expect(restDay.workout).toBeDefined();
    const created = await ensureDaySessions(service, updated, restDay);
    expect(created).toHaveLength(1);
    expect(created[0].plannedWorkout?.goal).toBe(restDay.workout?.goal);
  });

  it("已有训练记录时拒绝调整，且不改动已保存的课表", async () => {
    const { service, plan } = setup();
    await service.savePlan(plan);
    const trainingDay = dayOf(plan, 20, 1);
    const [session] = await ensureDaySessions(service, plan, trainingDay);
    await completeSession(service, session, { actualDistanceKm: 10, log: "完成" });

    await expect(swapTrainingDays(service, plan, 20, 0, 1)).rejects.toThrow(/已有训练记录/);
    const stored = await service.getPlan(plan.id);
    expect(dayOf(stored as Plan, 20, 1).workout?.goal).toBe(trainingDay.workout?.goal);
    expect((await service.listSessions(plan.id, trainingDay.id))[0].status).toBe("done");
  });

  it("临时追加的训练不受课表调整影响，并且可以移除", async () => {
    const { service, plan } = setup();
    await service.savePlan(plan);
    const restDay = dayOf(plan, 20, 0);
    expect(restDay.workout).toBeUndefined();
    const extra = await addExtraSession(service, plan.id, restDay.id, { label: "晚间恢复跑" });
    expect(sessionOrigin(extra)).toBe("extra");
    expect(isPlanSlotSession(extra)).toBe(false);

    const updated = await swapTrainingDays(service, plan, 20, 0, 1);

    const kept = await service.listSessions(plan.id, restDay.id);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ id: extra.id, label: "晚间恢复跑", origin: "extra" });
    expect(dayOf(updated, 20, 0).workout).toBeDefined();

    await removeSession(service, kept[0]);
    expect(await service.listSessions(plan.id, restDay.id)).toHaveLength(0);
  });

  it("计划位会话仍然不允许移除", async () => {
    const { service, plan } = setup();
    await service.savePlan(plan);
    const [session] = await ensureDaySessions(service, plan, dayOf(plan, 20, 1));
    expect(isPlanSlotSession(session)).toBe(true);
    await expect(removeSession(service, session)).rejects.toThrow(/计划训练不能移除/);
  });

  it("采用备选方案时按当前档位重建结构化课表", async () => {
    const { service, plan } = setup();
    await service.savePlan(plan);
    const target = dayOf(plan, 18, 1);
    expect(target.items.map((item) => item.type)).toEqual(["R"]);
    expect(target.alternatives?.[0].map((item) => item.type)).toEqual(["E"]);
    const [slot] = await ensureDaySessions(service, plan, target);
    expect(firstRunZone(slot.plannedWorkout)).toBe("R");

    const updated = await applyDayAlternative(service, plan, 18, 1, 0);

    const updatedDay = dayOf(updated, 18, 1);
    expect(updatedDay.items.map((item) => item.type)).toEqual(["E"]);
    expect(updatedDay.workout?.goal).toBe("有氧基础");
    expect(firstRunZone(updatedDay.workout)).toBe("E");
    const sessions = await service.listSessions(plan.id, target.id);
    expect(sessions[0].plannedWorkout?.goal).toBe("有氧基础");
  });
});
