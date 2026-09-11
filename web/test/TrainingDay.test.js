import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TrainingDay from "../src/views/TrainingDay.vue";

const { addExtraSession, push, removeSession, service, skipSession } = vi.hoisted(() => ({
  addExtraSession: vi.fn(),
  push: vi.fn(),
  removeSession: vi.fn(),
  service: {},
  skipSession: vi.fn(),
}));

let trainingData;

vi.mock("@core", async () => ({
  ...(await vi.importActual("@core")),
  addExtraSession,
  removeSession,
  skipSession,
}));
vi.mock("../src/app-context.js", () => ({
  service,
  // 训练日只用到「当前能力」的可选展示口径：这里给出已建立能力的档案
  getAthlete: async () => ({ id: "local-test", provider: "local", thresholdPaceSecondsPerKm: 240 }),
  onAthleteChange: () => () => {},
}));
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
    removeSession.mockResolvedValue();
    skipSession.mockResolvedValue();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("shows a day with zero sessions", async () => {
    const wrapper = await mountDay([]);
    expect(wrapper.text()).toContain("无训练安排");
    expect(wrapper.findAll("[data-session-id]")).toHaveLength(0);
  });

  it("annotates the condensed day label with a plain training type", async () => {
    const wrapper = await mountDay([]);
    // 计划标题是紧凑记号（T、R…），标题旁补中文类型便于阅读
    expect(wrapper.get(".day-hero h1").text()).toContain("阈值训练");
    expect(wrapper.get(".day-hero h1").text()).toContain("阈值跑");
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

  it("summarizes a multi-session day for the reader", async () => {
    const wrapper = await mountDay([
      session(0, "done", { actualDistanceKm: 10, actualDurationMinutes: 50 }),
      session(1, "done", { actualDistanceKm: 5.5, actualDurationMinutes: 30 }),
      session(2, "skipped"),
    ]);

    const summary = wrapper.get('[data-testid="day-summary"]').text();
    expect(summary).toContain("当天 3 次训练");
    expect(summary).toContain("已完成 2");
    expect(summary).toContain("未进行 1");
    // 只有已完成的训练计入累计
    expect(summary).toContain("累计 15.5 km");
    expect(summary).toContain("累计 80 min");
    // 聚合状态与日历/周视图一致（完成 + 跳过 → 部分完成）
    expect(wrapper.get('[data-testid="day-summary-status"]').text()).toBe("部分完成");
  });

  it("shows no day summary when the day has no session at all", async () => {
    const wrapper = await mountDay([]);
    expect(wrapper.find('[data-testid="day-summary"]').exists()).toBe(false);
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

  it("attaches course plan content when an extra session picks a library course", async () => {
    const wrapper = await mountDay([]);
    await wrapper.get('[data-testid="show-add-session"]').trigger("click");

    const select = wrapper.get('[data-testid="extra-session-course"]');
    const option = select.findAll("option").find((entry) => entry.element.value !== "");
    expect(option, "课程库至少应有一门可选课程").toBeTruthy();
    await select.setValue(option.element.value);

    // 选了课程就自动带出训练名称，并预览计划内容
    expect(wrapper.get('[data-testid="extra-session-label"]').element.value).not.toBe("");
    expect(wrapper.get('[data-testid="extra-session-preview"]').text()).toContain("计划内容");

    await wrapper.get('[data-testid="add-session"]').trigger("click");
    await flushPromises();

    const [, , , input] = addExtraSession.mock.calls[0];
    expect(input.label).not.toBe("");
    expect(input.plannedWorkout.dslVersion).toBe(2);
    expect(input.plannedWorkout.goal).toBeTruthy();
    expect(input.plannedWorkout.phases.length).toBeGreaterThan(0);
  });

  it("removes an added session only after confirmation", async () => {
    const extra = session(1, "planned", { plannedWorkout: undefined });
    const wrapper = await mountDay([session(0, "planned"), extra]);

    // 计划位由课表管理，不提供移除入口
    expect(wrapper.find(`[data-remove-session="${session(0, "planned").id}"]`).exists()).toBe(false);

    await wrapper.get(`[data-remove-session="${extra.id}"]`).trigger("click");
    await flushPromises();

    expect(removeSession).toHaveBeenCalledWith(service, extra);
    expect(trainingData.refreshDaySessions).toHaveBeenCalledWith(day.id);
  });

  it("keeps the session when removal is cancelled", async () => {
    window.confirm.mockReturnValue(false);
    const extra = session(1, "planned");
    const wrapper = await mountDay([extra]);

    await wrapper.get(`[data-remove-session="${extra.id}"]`).trigger("click");
    await flushPromises();

    expect(removeSession).not.toHaveBeenCalled();
  });

  it("removes a temporary session that was added on a rest day", async () => {
    // 休息日加练会占用 seq 0；它属于「临时追加」，必须可以移除
    const extra = session(0, "planned", { origin: "extra", plannedWorkout: undefined, label: "晚间恢复跑" });
    const wrapper = await mountDay([extra]);
    const button = wrapper.find(`[data-remove-session="${extra.id}"]`);

    expect(button.exists()).toBe(true);
    await button.trigger("click");
    await flushPromises();

    expect(removeSession).toHaveBeenCalledWith(service, extra);
  });

  it("opens the plan adjustment dialog from the hero", async () => {
    const wrapper = await mountDay([session(0, "planned")]);
    expect(wrapper.find('[data-testid="day-adjust"]').exists()).toBe(false);

    await wrapper.get('[data-testid="open-day-adjust"]').trigger("click");

    expect(wrapper.find('[data-testid="day-adjust"]').exists()).toBe(true);
  });
});
