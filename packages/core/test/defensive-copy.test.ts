import { describe, expect, it } from "vitest";
import { instantiatePlan } from "../src/plans/instantiate.js";
import type { DanielsZone, PlanInstance, PlanInstanceDay, Workout } from "../src/domain.js";
import {
  DefaultTrainingDataService,
  addExtraSession,
  completeSession,
  ensureDaySessions,
  setSessionPlannedWorkout,
  syncDayPlannedWorkout,
} from "../src/workflow.js";
import type { TrainingDataService } from "../src/workflow.js";
import { cloneLibraryCourse, createLibraryCourse, updateLibraryCourse } from "../src/library.js";
import { parseWorkoutDsl } from "../src/dsl/registry.js";
import { MemoryStore } from "./helpers/memory-store.js";

/**
 * core 只保存属于自己的那份数据。
 *
 * Web 传给 core 的课表可能是 Vue 的响应式代理，小程序可能复用同一个对象做别的事，
 * 批量导入也可能反复用同一个模板对象。所以平台不需要自己复制领域对象：core 的写入口
 * 统一先深拷贝再归一化。这组测试用「写完后再改传进去的对象」来证明这条约定成立——
 * 一旦有人把深拷贝删掉，这里会立刻变红。
 */

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

function trainingDay(plan: Plan): PlanInstanceDay {
  for (const week of plan.weeks) {
    const day = week.days.find((entry) => entry.workout);
    if (day) return day;
  }
  throw new Error("课表里没有带结构化课表的训练日");
}

function simpleWorkout(goal: string, minutes = 40): Workout {
  return parseWorkoutDsl(`GOAL:${goal}\nMS:${minutes}min@E`);
}

function setup(): { service: TrainingDataService; plan: Plan } {
  return { service: new DefaultTrainingDataService(new MemoryStore()), plan: createPlan() };
}

async function storedSession(service: TrainingDataService, plan: Plan, sessionId: string) {
  const sessions = await service.listSessions(plan.id);
  return sessions.find((session) => session.id === sessionId);
}

describe("追加训练：计划内容按快照写入", () => {
  it("追加后再改传入的课表，已存会话不受影响", async () => {
    const { service, plan } = setup();
    const day = trainingDay(plan);
    const source = simpleWorkout("午后慢跑");

    const session = await addExtraSession(service, plan.id, day.id, {
      label: "第二次训练",
      plannedWorkout: source,
    });

    const first = source.phases[0].segments[0];
    if (first.kind !== "run") throw new Error("fixture 必须是跑步步骤");
    first.load = { type: "time", seconds: 60 };
    source.goal = "午前慢跑";

    const stored = await storedSession(service, plan, session.id);
    expect(stored?.plannedWorkout?.goal).toBe("午后慢跑");
    expect(stored?.plannedWorkout?.phases[0].segments[0]).toEqual({
      kind: "run",
      load: { type: "time", seconds: 2400 },
      target: { type: "daniels", zone: "E" },
    });
    expect(session.plannedWorkout).not.toBe(source);
  });

  it("没有计划内容时保持为空，不写入空壳", async () => {
    const { service, plan } = setup();
    const day = trainingDay(plan);
    const session = await addExtraSession(service, plan.id, day.id, { label: "拉伸" });

    expect(session.plannedWorkout).toBeUndefined();
    expect((await storedSession(service, plan, session.id))?.plannedWorkout).toBeUndefined();
  });
});

describe("完成训练：实际内容按快照写入", () => {
  it("保存后再改表单里的实际内容，训练记录不受影响", async () => {
    const { service, plan } = setup();
    const day = trainingDay(plan);
    const session = await addExtraSession(service, plan.id, day.id, { label: "午后慢跑" });
    const actual = simpleWorkout("实际训练", 50);

    await completeSession(service, session, {
      actualWorkout: actual,
      actualDistanceKm: 10,
      actualDurationMinutes: 50,
      actualRpe: 6,
      log: "状态稳定",
    });

    actual.goal = "改过了";
    actual.phases[0].segments.length = 0;

    const stored = await storedSession(service, plan, session.id);
    expect(stored?.status).toBe("done");
    expect(stored?.actualWorkout?.goal).toBe("实际训练");
    expect(stored?.actualWorkout?.phases[0].segments).toHaveLength(1);
    expect(stored?.log).toBe("状态稳定");
  });
});

describe("计划位：课表快照与计划对象解耦", () => {
  it("惰性生成会话后，会话不复用计划日里的课表对象", async () => {
    const { service, plan } = setup();
    const day = trainingDay(plan);
    await service.savePlan(plan);

    const [created] = await ensureDaySessions(service, plan, day);
    expect(created.plannedWorkout).toBeDefined();
    expect(created.plannedWorkout).not.toBe(day.workout);
    expect(created.plannedWorkout?.phases[0].segments).not.toBe(day.workout?.phases[0].segments);

    day.workout!.goal = "原地改过的目标";
    const stored = await storedSession(service, plan, created.id);
    expect(stored?.plannedWorkout?.goal).toBe(created.plannedWorkout?.goal);
    expect(stored?.plannedWorkout?.goal).not.toBe("原地改过的目标");
  });

  it("课表同步写入的是新内容的快照", async () => {
    const { service, plan } = setup();
    const day = trainingDay(plan);
    await service.savePlan(plan);
    await ensureDaySessions(service, plan, day);

    const replacement = simpleWorkout("换过的课表", 30);
    const synced = await syncDayPlannedWorkout(service, plan, { ...day, workout: replacement });
    const planSlot = synced.find((session) => session.origin === "plan" && session.status === "planned");
    expect(planSlot?.plannedWorkout?.goal).toBe("换过的课表");

    replacement.goal = "又改了一次";
    const stored = await storedSession(service, plan, planSlot!.id);
    expect(stored?.plannedWorkout?.goal).toBe("换过的课表");
  });

  it("手动设置计划内容时，会话持有自己的副本", async () => {
    const { service, plan } = setup();
    const day = trainingDay(plan);
    await service.savePlan(plan);
    const [created] = await ensureDaySessions(service, plan, day);

    const manual = simpleWorkout("手动填写", 25);
    const updated = await setSessionPlannedWorkout(service, created, manual);
    manual.phases[0].segments.length = 0;

    expect(updated.plannedWorkout?.phases[0].segments).toHaveLength(1);
    expect((await storedSession(service, plan, created.id))?.plannedWorkout?.phases[0].segments).toHaveLength(1);
  });
});

describe("课程库：元数据与内容都不共享引用", () => {
  it("创建、更新、复制都不会被调用方的后续改动污染", () => {
    const workout = simpleWorkout("课程目标");
    const tags: DanielsZone[] = ["E"];
    const course = createLibraryCourse({ category: "E", tags, workout });

    tags.push("T");
    workout.goal = "改过了";
    expect(course.tags).toEqual(["E"]);
    expect(course.workout.goal).toBe("课程目标");

    const patchTags: DanielsZone[] = ["R"];
    const updated = updateLibraryCourse(course, { tags: patchTags });
    patchTags.push("I");
    expect(updated.tags).toEqual(["R"]);
    expect(course.tags).toEqual(["E"]);

    const updatedWorkout = simpleWorkout("更新后的目标");
    const withNewWorkout = updateLibraryCourse(course, { workout: updatedWorkout });
    updatedWorkout.goal = "改过了";
    expect(withNewWorkout.workout.goal).toBe("更新后的目标");
    expect(course.workout.goal).toBe("课程目标");

    const copy = cloneLibraryCourse(course);
    copy.tags.push("I");
    copy.workout.goal = "副本改过";
    expect(course.tags).toEqual(["E"]);
    expect(course.workout.goal).toBe("课程目标");
  });
});
