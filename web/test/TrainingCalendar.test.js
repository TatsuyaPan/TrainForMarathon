import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { instantiatePlan } from "@core";
import TrainingCalendar from "../src/views/TrainingCalendar.vue";

const { getHomeSummary, load, push, service } = vi.hoisted(() => ({
  getHomeSummary: vi.fn(),
  load: vi.fn(),
  push: vi.fn(),
  service: {},
}));

let trainingData;

vi.mock("@core", async () => ({
  ...(await vi.importActual("@core")),
  getHomeSummary,
}));
vi.mock("../src/app-context.js", () => ({ service }));
vi.mock("../src/composables/useTrainingData.js", () => ({ useTrainingData: () => trainingData }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

const RACE_DATE = "2027-03-21";

/** router-link 桩：把目标序列化到 data-to，便于断言跳转目标 */
const RouterLinkStub = {
  props: ["to"],
  template: '<a class="day-cell-link" :data-to="JSON.stringify(to)"><slot /></a>',
};

async function mountCalendar(plan) {
  trainingData = {
    loading: ref(false),
    needsSetup: ref(!plan),
    plan: ref(plan),
    recordsByDay: ref(new Map()),
    load,
  };
  const wrapper = mount(TrainingCalendar, {
    global: {
      mocks: { $router: { push } },
      stubs: {
        "router-link": RouterLinkStub,
        "t-button": { template: "<button><slot /></button>" },
        "t-card": { template: "<section><slot /></section>" },
        "t-tag": { template: "<span><slot /></span>" },
        "t-typography-title": { template: "<h1><slot /></h1>" },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("TrainingCalendar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHomeSummary.mockResolvedValue({ currentWeek: null, weekStats: null, progressCount: 0 });
  });

  it("以比赛收尾的计划说「比赛日」", async () => {
    const plan = instantiatePlan("20-week", { raceDate: RACE_DATE, thresholdPaceSecondsPerKm: 220, maxWeeklyKm: 80 });
    const wrapper = await mountCalendar(plan);

    expect(wrapper.text()).toContain(`比赛日 ${RACE_DATE}`);
    expect(wrapper.findAll(".period-row")).toHaveLength(20);
  });

  it("五周循环没有比赛日，但仍有完整周期", async () => {
    const plan = instantiatePlan("5-week-cycle", { raceDate: RACE_DATE, thresholdPaceSecondsPerKm: 220, maxWeeklyKm: 80 });
    const wrapper = await mountCalendar(plan);

    expect(wrapper.text()).toContain(`周期结束日 ${RACE_DATE}`);
    expect(wrapper.text()).not.toContain("比赛日");
    expect(wrapper.findAll(".period-row")).toHaveLength(5);
  });

  it("点周次进入本周视图，点格子进入训练日", async () => {
    const plan = instantiatePlan("5-week-cycle", { raceDate: RACE_DATE, thresholdPaceSecondsPerKm: 220, maxWeeklyKm: 80 });
    const wrapper = await mountCalendar(plan);

    await wrapper.get('[data-testid="week-col-5"]').trigger("click");
    expect(push).toHaveBeenCalledWith({
      path: "/training/week",
      query: { date: plan.weeks[0].days[0].date },
    });

    const firstCell = wrapper.findAll(".day-cell-link")[0];
    expect(JSON.parse(firstCell.attributes("data-to"))).toEqual({
      path: "/training/day",
      query: { date: plan.weeks[0].days[0].date },
    });
  });

  it("没有课表时引导去建立配置", async () => {
    const wrapper = await mountCalendar(null);

    expect(wrapper.text()).toContain("建立配置");
    expect(wrapper.findAll(".period-row")).toHaveLength(0);
  });
});
