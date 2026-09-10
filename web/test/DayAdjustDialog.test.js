import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DayAdjustDialog from "../src/components/DayAdjustDialog.vue";

const { applyDayAlternative, service, swapTrainingDays } = vi.hoisted(() => ({
  applyDayAlternative: vi.fn(),
  service: {},
  swapTrainingDays: vi.fn(),
}));

vi.mock("@core", async () => ({
  ...(await vi.importActual("@core")),
  applyDayAlternative,
  swapTrainingDays,
}));
vi.mock("../src/app-context.js", () => ({ service }));

const CardStub = { template: "<section><slot /></section>" };

const workout = {
  dslVersion: 1,
  goal: "速度与跑步经济性",
  phases: [
    {
      role: "main",
      segments: [{ kind: "run", load: { type: "distance", meters: 400 }, target: { type: "daniels", zone: "R" } }],
    },
  ],
};

const days = [
  { id: "d0", date: "2026-09-07", label: "跑休", items: [{ type: "REST" }] },
  {
    id: "d1",
    date: "2026-09-08",
    label: "R（不适应可改 E）",
    items: [{ type: "R" }],
    alternatives: [[{ type: "E" }]],
    workout,
  },
  { id: "d2", date: "2026-09-09", label: "E", items: [{ type: "E" }], workout: { ...workout, goal: "有氧基础" } },
];

const plan = { id: "plan-1", weeks: [{ week: 18, days }] };

function mountDialog(props = {}) {
  return mount(DayAdjustDialog, {
    props: { plan, week: { week: 18, days }, day: days[1], visible: true, ...props },
    global: { stubs: { "t-card": CardStub } },
  });
}

describe("DayAdjustDialog", () => {
  beforeEach(() => {
    applyDayAlternative.mockReset();
    swapTrainingDays.mockReset();
    window.confirm = vi.fn(() => true);
  });

  it("lists the declared alternatives with readable training names", () => {
    const wrapper = mountDialog();
    expect(wrapper.get('[data-testid="apply-alternative-0"]').text()).toContain("轻松跑");
    expect(wrapper.find('[data-testid="no-alternatives"]').exists()).toBe(false);
  });

  it("explains when a day has no alternatives", () => {
    const wrapper = mountDialog({ day: days[2] });
    expect(wrapper.get('[data-testid="no-alternatives"]').text()).toContain("没有声明备选方案");
  });

  it("offers the other days of the week but not the current day", () => {
    const wrapper = mountDialog();
    expect(wrapper.find('[data-testid="swap-with-2026-09-07"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="swap-with-2026-09-09"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="swap-with-2026-09-08"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="swap-with-2026-09-07"]').text()).toContain("休息日");
  });

  it("swaps with the chosen day and reports the updated plan", async () => {
    const updated = { id: "plan-1", weeks: [] };
    swapTrainingDays.mockResolvedValue(updated);
    const wrapper = mountDialog();

    await wrapper.get('[data-testid="swap-with-2026-09-09"]').trigger("click");
    await flushPromises();

    expect(swapTrainingDays).toHaveBeenCalledWith(service, plan, 18, 1, 2);
    expect(wrapper.emitted("updated")?.[0]).toEqual([updated]);
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("applies an alternative through the core orchestration", async () => {
    applyDayAlternative.mockResolvedValue({ id: "plan-1", weeks: [] });
    const wrapper = mountDialog();

    await wrapper.get('[data-testid="apply-alternative-0"]').trigger("click");
    await flushPromises();

    expect(applyDayAlternative).toHaveBeenCalledWith(service, plan, 18, 1, 0);
  });

  it("does nothing when the swap confirmation is declined", async () => {
    window.confirm = vi.fn(() => false);
    const wrapper = mountDialog();
    await wrapper.get('[data-testid="swap-with-2026-09-07"]').trigger("click");
    await flushPromises();
    expect(swapTrainingDays).not.toHaveBeenCalled();
  });

  it("surfaces the core refusal when the day already has records", async () => {
    swapTrainingDays.mockRejectedValue(new Error("2026-09-08 已有训练记录，不能调整课表；请先处理这一天的记录"));
    const wrapper = mountDialog();

    await wrapper.get('[data-testid="swap-with-2026-09-09"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="adjust-error"]').text()).toContain("已有训练记录");
    expect(wrapper.emitted("updated")).toBeUndefined();
  });
});
