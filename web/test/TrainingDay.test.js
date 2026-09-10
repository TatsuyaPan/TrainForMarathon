import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TrainingDay from "../src/views/TrainingDay.vue";

const { addExtraSession, push, service, skipSession } = vi.hoisted(() => ({
  addExtraSession: vi.fn(),
  push: vi.fn(),
  service: {},
  skipSession: vi.fn(),
}));

let trainingData;

vi.mock("@core", async () => ({
  ...(await vi.importActual("@core")),
  addExtraSession,
  skipSession,
}));
vi.mock("../src/app-context.js", () => ({ service }));
vi.mock("../src/composables/useTrainingData.js", () => ({ useTrainingData: () => trainingData }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

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

const day = {
  id: "day-1",
  date: "2026-09-10",
  label: "阈值训练",
  items: [{ type: "T", text: "20min T" }],
  workout: dayWorkout,
};
const plan = { id: "plan-1", paces: {}, weeks: [{ week: 1, days: [day] }] };

function session(seq, status, overrides = {}) {
  return {
    id: `plan-1:day-1:${seq}`,
    planId: "plan-1",
    dayId: "day-1",
    seq,
    label: seq === 0 ? "阈值训练" : `附加训练 ${seq}`,
    status,
    plannedWorkout: day.workout,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    ...overrides,
  };
}

const ButtonStub = { emits: ["click"], template: "<button @click=\"$emit('click')\"><slot /></button>" };
const InputStub = {
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: "<input :value=\"modelValue\" @input=\"$emit('update:modelValue', $event.target.value)\" />",
};

async function mountDay(sessions) {
  trainingData = {
    loading: ref(false),
    needsSetup: ref(false),
    plan: ref(plan),
    load: vi.fn(),
    loadDaySessions: vi.fn().mockResolvedValue(sessions),
    refreshDaySessions: vi.fn().mockResolvedValue(sessions),
  };
  const wrapper = mount(TrainingDay, {
    props: { date: day.date },
    global: {
      mocks: { $router: { push } },
      stubs: {
        "t-button": ButtonStub,
        "t-card": { template: "<section><slot /></section>" },
        "t-tag": { template: "<span><slot /></span>" },
        "t-input": InputStub,
        "t-form": { template: "<form><slot /></form>" },
        "t-form-item": { template: "<label><slot /></label>" },
        "t-typography-title": { template: "<h1><slot /></h1>" },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("TrainingDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addExtraSession.mockResolvedValue();
    skipSession.mockResolvedValue();
  });

  it("shows a day with zero sessions", async () => {
    const wrapper = await mountDay([]);
    expect(wrapper.text()).toContain("无训练安排");
    expect(wrapper.findAll("[data-session-id]")).toHaveLength(0);
  });

  it("orders many sessions and shows lifecycle-specific actions", async () => {
    const wrapper = await mountDay([session(2, "skipped"), session(0, "planned"), session(1, "done")]);
    const cards = wrapper.findAll("[data-session-id]");

    expect(cards.map((card) => card.attributes("data-session-id"))).toEqual([
      "plan-1:day-1:0",
      "plan-1:day-1:1",
      "plan-1:day-1:2",
    ]);
    expect(cards[0].text()).toContain("记录并完成");
    expect(cards[1].text()).toContain("查看或编辑记录");
    expect(cards[2].text()).toContain("改为已完成");
  });

  it("routes every record action to the session's unique record", async () => {
    const current = session(0, "planned");
    const wrapper = await mountDay([current]);
    await wrapper.get(`[data-record-session="${current.id}"]`).trigger("click");

    expect(push).toHaveBeenCalledWith({
      path: "/training/session",
      query: { plan: "plan-1", session: current.id, date: day.date },
    });
  });

  it("opens the day workout editor from the hero", async () => {
    const wrapper = await mountDay([session(0, "planned")]);
    await wrapper.get('[data-testid="edit-day-workout"]').trigger("click");

    expect(push).toHaveBeenCalledWith({ path: "/edit", query: { plan: "plan-1", day: "day-1" } });
  });

  it("opens a per-session plan editor only for added sessions", async () => {
    const planned = session(0, "planned");
    const extra = session(1, "planned", { plannedWorkout: undefined });
    const wrapper = await mountDay([planned, extra]);

    // 计划位（seq 0）由「编辑课表」统一负责，不提供逐次入口
    expect(wrapper.find(`[data-plan-session="${planned.id}"]`).exists()).toBe(false);
    await wrapper.get(`[data-plan-session="${extra.id}"]`).trigger("click");

    expect(push).toHaveBeenCalledWith({
      path: "/edit",
      query: { plan: "plan-1", day: "day-1", session: extra.id },
    });
  });

  it("skips a planned session and refreshes the day", async () => {
    const current = session(0, "planned");
    const wrapper = await mountDay([current]);
    await wrapper.get(`[data-skip-session="${current.id}"]`).trigger("click");
    await flushPromises();

    expect(skipSession).toHaveBeenCalledWith(service, current);
    expect(trainingData.refreshDaySessions).toHaveBeenCalledWith(day.id);
  });

  it("adds a named extra session and refreshes the day", async () => {
    const wrapper = await mountDay([]);
    await wrapper.get('[data-testid="show-add-session"]').trigger("click");
    await wrapper.get('[data-testid="extra-session-label"]').setValue("晚间恢复跑");
    await wrapper.get('[data-testid="add-session"]').trigger("click");
    await flushPromises();

    expect(addExtraSession).toHaveBeenCalledWith(service, plan.id, day.id, { label: "晚间恢复跑" });
    expect(trainingData.refreshDaySessions).toHaveBeenCalledWith(day.id);
  });
});
