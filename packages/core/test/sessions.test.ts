import { describe, expect, it } from "vitest";
import { DefaultTrainingDataService } from "../src/workflow.js";
import {
  addExtraSession,
  completeSession,
  createSetup,
  ensureDaySessions,
  getHomeSummary,
  removeSession,
  sessionsToProgress,
  skipSession,
  syncDayPlannedWorkout,
} from "../src/workflow.js";
import type { DataStore } from "../src/workflow.js";
import type { TrainingSession } from "../src/domain.js";
import { MemoryStore } from "./helpers/memory-store.js";

const RACE_DATE = "2026-11-15";

describe("training session lifecycle", () => {
  it("aggregates multiple sessions into one daily progress record", () => {
    const session = (
      id: string,
      status: TrainingSession["status"],
      overrides: Partial<TrainingSession> = {},
    ): TrainingSession => ({
      id,
      planId: "plan-1",
      dayId: "day-1",
      seq: Number(id.at(-1)),
      label: id,
      status,
      createdAt: "2026-09-10T08:00:00.000Z",
      updatedAt: "2026-09-10T08:00:00.000Z",
      ...overrides,
    });

    const completed = sessionsToProgress([
      session("done-0", "done", {
        actualDistanceKm: 10,
        actualDurationMinutes: 50,
        finishedAt: "2026-09-10T09:00:00.000Z",
      }),
      session("done-1", "done", {
        actualDistanceKm: 5,
        actualDurationMinutes: 28,
        finishedAt: "2026-09-10T18:00:00.000Z",
      }),
    ]);
    expect(completed).toEqual([{
      dayId: "day-1",
      status: "completed",
      actualDistanceKm: 15,
      actualDurationMinutes: 78,
      updatedAt: "2026-09-10T18:00:00.000Z",
    }]);

    expect(sessionsToProgress([
      session("skip-0", "skipped"),
      session("skip-1", "skipped"),
    ])[0].status).toBe("skipped");

    expect(sessionsToProgress([
      session("done-0", "done", { actualDistanceKm: 8 }),
      session("skip-1", "skipped"),
    ])[0]).toMatchObject({ status: "partial", actualDistanceKm: 8 });

    expect(sessionsToProgress([
      session("done-0", "done"),
      session("plan-1", "planned", { updatedAt: "2026-09-10T20:00:00.000Z" }),
    ])[0]).toMatchObject({ status: "partial", updatedAt: "2026-09-10T20:00:00.000Z" });

    expect(sessionsToProgress([session("plan-0", "planned")])).toEqual([]);
  });

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

  it("generates a session once a rest day gains a structured workout", async () => {
    const service = new DefaultTrainingDataService(new MemoryStore());
    const athlete = (await service.getAthleteProfile()) ?? {
      id: "a", provider: "local", createdAt: "x", updatedAt: "x", schemaVersion: 1,
    };
    const plan = await createSetup(service, athlete, {
      templateId: "20-week", raceDate: RACE_DATE, maxWeeklyKm: 80,
      paceMode: "sixSecond", thresholdPaceSecondsPerKm: 240,
    });
    const restDay = plan.weeks[19].days.find((d) => d.items.every((i) => i.type === "REST"));
    expect(await ensureDaySessions(service, plan, restDay)).toEqual([]);

    // 编辑器为休息日补上结构化课表
    const editedPlan = structuredClone(plan);
    const editedDay = editedPlan.weeks.flatMap((week) => week.days).find((entry) => entry.id === restDay.id);
    editedDay.workout = { dslVersion: 1, goal: "放松恢复跑", phases: [] };

    const sessions = await ensureDaySessions(service, editedPlan, editedDay);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].plannedWorkout.goal).toBe("放松恢复跑");
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
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: "partial", actualDistanceKm: 5 });
  });

  it("removes a mistakenly added session but protects the plan slot", async () => {
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
    const extra = await addExtraSession(service, plan.id, day.id, { label: "误添加的训练" });
    expect((await service.listSessions(plan.id, day.id)).length).toBe(2);

    await removeSession(service, extra);
    const remaining = await service.listSessions(plan.id, day.id);
    expect(remaining.map((entry) => entry.id)).toEqual([planned.id]);

    // 计划位删除后会被惰性生成重新补回，因此拒绝移除，引导改用「未进行」
    await expect(removeSession(service, planned)).rejects.toThrow(/未进行/);
    expect((await service.listSessions(plan.id, day.id)).length).toBe(1);
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

  it("follows an edited day workout for planned sessions and freezes finished ones", async () => {
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
    expect(planned.plannedWorkout.goal).toBe(day.workout.goal);

    // 教练在课表编辑器里就地改写当天计划内容
    const withEditedDay = (goal) => {
      const edited = structuredClone(plan);
      const target = edited.weeks.flatMap((week) => week.days).find((entry) => entry.id === day.id);
      target.workout = { ...structuredClone(day.workout), goal };
      return { plan: edited, day: target };
    };

    const first = withEditedDay("改为比赛配速");
    const [synced] = await ensureDaySessions(service, first.plan, first.day);
    expect(synced.status).toBe("planned");
    expect(synced.plannedWorkout.goal).toBe("改为比赛配速");
    // 幂等：内容一致的重复同步不产生写操作以外的副作用（对象保持等价）
    const [resynced] = await syncDayPlannedWorkout(service, first.plan, first.day);
    expect(resynced.plannedWorkout.goal).toBe("改为比赛配速");

    // 结束首个训练 + 追加一次临时训练后，再次改课表
    await completeSession(service, synced, { actualDistanceKm: 12, log: "按新计划完成" });
    const extra = await addExtraSession(service, plan.id, day.id, { label: "晚间放松跑" });
    const second = withEditedDay("再次调整");
    const after = await syncDayPlannedWorkout(service, second.plan, second.day);

    const [doneSession, extraSession] = after;
    // 已完成会话保留当时快照，不被事后改课表改写
    expect(doneSession.status).toBe("done");
    expect(doneSession.plannedWorkout.goal).toBe("改为比赛配速");
    expect(doneSession.actualDistanceKm).toBe(12);
    // 追加训练不属于「计划位」，同样保持原样
    expect(extraSession.id).toBe(extra.id);
    expect(extraSession.plannedWorkout).toBeUndefined();
    expect(extraSession.label).toBe("晚间放松跑");
  });
});
