import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EditWorkout from "../src/views/EditWorkout.vue";

const { push, service } = vi.hoisted(() => ({
  push: vi.fn(),
  service: {
    getPlan: vi.fn(),
    savePlan: vi.fn(),
    listSessions: vi.fn(),
    saveSession: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));
vi.mock("../src/app-context.js", () => ({ service }));

const ButtonStub = {
  props: ["disabled"],
  emits: ["click"],
  template: "<button :disabled=\"disabled\" @click=\"$emit('click')\"><slot /></button>",
};

const dayWorkout = {
  dslVersion: 1,
  goal: "乳酸阈刺激",
  phases: [
    {
      role: "main",
      segments: [{ kind: "run", load: { type: "time", seconds: 1200 }, target: { type: "daniels", zone: "T" } }],
    },
  ],
};

function makeDay() {
  return {
    id: "day-1",
    date: "2026-09-10",
    label: "阈值训练",
    items: [{ type: "T", text: "20min T" }],
    workout: JSON.parse(JSON.stringify(dayWorkout)),
  };
}

function makePlan(day) {
  return { id: "plan-1", paces: {}, weeks: [{ week: 1, days: [day] }] };
}

function session(seq, overrides = {}) {
  return {
    id: `plan-1:day-1:${seq}`,
    planId: "plan-1",
    dayId: "day-1",
    seq,
    label: seq === 0 ? "阈值训练" : "晚间放松跑",
    status: "planned",
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    ...overrides,
  };
}

async function mountEditor(props) {
  const wrapper = mount(EditWorkout, {
    props,
    global: {
      stubs: {
        "t-button": ButtonStub,
        "t-card": { template: "<section><slot /></section>" },
        "t-tag": { template: "<span><slot /></span>" },
        "t-typography-title": { template: "<h1><slot /></h1>" },
        // 编辑器与导入对话框有独立测试；这里只验证视图的保存链路
        WorkoutEditor: { template: "<div data-testid=\"stub-editor\" />" },
        StructurePreview: { template: "<div />" },
        CourseImportDialog: { template: "<div />" },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("EditWorkout", () => {
  beforeEach(() => {
    push.mockReset();
    service.getPlan.mockReset();
    service.savePlan.mockReset().mockResolvedValue();
    service.listSessions.mockReset().mockResolvedValue([]);
    service.saveSession.mockReset().mockResolvedValue();
    window.localStorage.clear();
    vi.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("edits the day workout and pushes the change into unfinished sessions", async () => {
    const day = makeDay();
    service.getPlan.mockResolvedValue(makePlan(day));
    service.listSessions.mockResolvedValue([session(0, { plannedWorkout: JSON.parse(JSON.stringify(dayWorkout)) })]);

    const wrapper = await mountEditor({ planId: "plan-1", dayId: "day-1" });
    expect(wrapper.get('[data-testid="day-goal"]').element.value).toBe("乳酸阈刺激");
    expect(wrapper.text()).toContain("当天课表");

    await wrapper.get('[data-testid="day-goal"]').setValue("改为比赛配速");
    await wrapper.get('[data-testid="save-day"]').trigger("click");
    await flushPromises();

    const saved = service.savePlan.mock.calls[0][0];
    expect(saved.weeks[0].days[0].workout.goal).toBe("改为比赛配速");
    // 计划位同步跟随；测试里给的是 planned 会话
    expect(service.saveSession).toHaveBeenCalledTimes(1);
    expect(service.saveSession.mock.calls[0][0].plannedWorkout.goal).toBe("改为比赛配速");
    expect(push).toHaveBeenCalledWith({ path: "/training/day", query: { date: "2026-09-10" } });
  });

  it("edits a single added session without touching the plan", async () => {
    const day = makeDay();
    service.getPlan.mockResolvedValue(makePlan(day));
    service.listSessions.mockResolvedValue([
      session(0, { plannedWorkout: JSON.parse(JSON.stringify(dayWorkout)) }),
      session(1),
    ]);

    const wrapper = await mountEditor({ planId: "plan-1", dayId: "day-1", sessionId: "plan-1:day-1:1" });
    expect(wrapper.text()).toContain("单独这次训练");
    // 追加训练还没有计划内容 → 给出可编辑草稿
    expect(wrapper.vm.$.setupState.workout.phases).toHaveLength(1);

    await wrapper.get('[data-testid="day-goal"]').setValue("晚间恢复");
    await wrapper.get('[data-testid="save-day"]').trigger("click");
    await flushPromises();

    expect(service.savePlan).not.toHaveBeenCalled();
    expect(service.saveSession).toHaveBeenCalledTimes(1);
    const saved = service.saveSession.mock.calls[0][0];
    expect(saved.id).toBe("plan-1:day-1:1");
    expect(saved.status).toBe("planned");
    expect(saved.plannedWorkout.goal).toBe("晚间恢复");
  });

  it("lets a rest day gain a structured workout and blocks an empty goal", async () => {
    const day = { id: "day-1", date: "2026-09-10", label: "休息", items: [{ type: "REST", text: "休息" }] };
    service.getPlan.mockResolvedValue(makePlan(day));

    const wrapper = await mountEditor({ planId: "plan-1", dayId: "day-1" });
    expect(wrapper.vm.$.setupState.workout.goal).toBe("");

    await wrapper.get('[data-testid="save-day"]').trigger("click");
    await flushPromises();

    expect(service.savePlan).not.toHaveBeenCalled();
    expect(wrapper.get(".error-text").text()).toContain("训练目的");
  });
});
