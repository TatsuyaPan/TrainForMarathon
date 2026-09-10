import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SessionRecord from "../src/views/SessionRecord.vue";

const { push, service } = vi.hoisted(() => ({
  push: vi.fn(),
  service: {
    listSessions: vi.fn(),
    saveSession: vi.fn(),
  },
}));

vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));
vi.mock("../src/app-context.js", () => ({ service }));

const plannedWorkout = {
  goal: "有氧耐力",
  segments: [{ kind: "step", intensity: { type: "pace", zone: "E" }, load: { type: "distance", meters: 8000 } }],
};

function session(overrides = {}) {
  return {
    id: "plan:day:0",
    planId: "plan",
    dayId: "day",
    seq: 0,
    label: "轻松跑",
    status: "planned",
    plannedWorkout,
    createdAt: "2026-09-10T08:00:00.000Z",
    updatedAt: "2026-09-10T08:00:00.000Z",
    ...overrides,
  };
}

const ButtonStub = { emits: ["click"], template: "<button @click=\"$emit('click')\"><slot /></button>" };
const InputNumberStub = {
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template: "<input :value=\"modelValue ?? ''\" @input=\"$emit('update:modelValue', $event.target.value === '' ? null : Number($event.target.value))\" />",
};

async function mountPage(currentSession = session()) {
  service.listSessions.mockResolvedValue([currentSession]);
  const wrapper = mount(SessionRecord, {
    props: { planId: "plan", sessionId: currentSession.id, date: "2026-09-10" },
    global: {
      stubs: {
        "t-button": ButtonStub,
        "t-card": { template: "<section><slot /></section>" },
        "t-tag": { template: "<span><slot /></span>" },
        "t-form": { template: "<form><slot /></form>" },
        "t-form-item": { template: "<label><slot /></label>" },
        "t-input-number": InputNumberStub,
        "t-textarea": { template: "<textarea />" },
        WorkoutEditorPanel: true,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("SessionRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    service.saveSession.mockResolvedValue();
  });

  it("defaults a planned session to completed-as-planned and reveals visual adjustment", async () => {
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain("按计划完成");
    expect(wrapper.findComponent({ name: "WorkoutEditorPanel" }).exists()).toBe(false);
    await wrapper.get('[data-testid="adjust-workout"]').trigger("click");
    expect(wrapper.findComponent({ name: "WorkoutEditorPanel" }).exists()).toBe(true);
  });

  it("restores an existing unique record", async () => {
    const wrapper = await mountPage(session({
      status: "done",
      actualWorkout: { ...plannedWorkout, goal: "实际节奏跑" },
      actualRpe: 7,
      log: "状态稳定",
    }));

    expect(wrapper.text()).toContain("编辑训练记录");
    expect(wrapper.vm.$.setupState.form.actualWorkout).toEqual(expect.objectContaining({ goal: "实际节奏跑" }));
    expect(wrapper.vm.$.setupState.form.adjustActualWorkout).toBe(true);
    expect(wrapper.findComponent({ name: "WorkoutEditorPanel" }).exists()).toBe(true);
    expect(wrapper.get('[data-testid="rpe-input"]').attributes("value")).toBe("7");
  });

  it("rejects invalid values without completing the session", async () => {
    const wrapper = await mountPage();
    await wrapper.get('[data-testid="rpe-input"]').setValue("11");
    await wrapper.get('[data-testid="save-record"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("RPE");
    expect(service.saveSession).not.toHaveBeenCalled();
  });

  it("saves one embedded record and returns to the training day", async () => {
    const current = session();
    const wrapper = await mountPage(current);
    expect(wrapper.vm.$.setupState.form.actualWorkout).toEqual(plannedWorkout);
    await wrapper.get('[data-testid="save-record"]').trigger("click");
    await flushPromises();

    expect(service.saveSession).toHaveBeenCalledTimes(1);
    expect(service.saveSession).toHaveBeenCalledWith(expect.objectContaining({
      id: current.id,
      status: "done",
      actualWorkout: plannedWorkout,
    }));
    expect(push).toHaveBeenCalledWith({ path: "/training/day", query: { date: "2026-09-10" } });
  });
});
