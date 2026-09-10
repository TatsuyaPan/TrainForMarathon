import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Fitness from "../src/views/Fitness.vue";

const { clearAthleteFitness, fitnessSavedHint, getAthlete, push, saveAthleteFitness } = vi.hoisted(() => ({
  clearAthleteFitness: vi.fn(),
  fitnessSavedHint: vi.fn(),
  getAthlete: vi.fn(),
  push: vi.fn(),
  saveAthleteFitness: vi.fn(),
}));

vi.mock("../src/app-context.js", () => ({
  clearAthleteFitness,
  fitnessSavedHint,
  getAthlete,
  saveAthleteFitness,
}));

const ButtonStub = { emits: ["click"], template: "<button @click=\"$emit('click')\"><slot /></button>" };
const InputNumberStub = {
  props: ["modelValue"],
  emits: ["update:modelValue"],
  template:
    "<input :value=\"modelValue ?? ''\" @input=\"$emit('update:modelValue', $event.target.value === '' ? null : Number($event.target.value))\" />",
};
const DialogStub = {
  props: ["visible"],
  template: "<div v-if=\"visible\" role=\"dialog\"><slot /></div>",
};

const vdotAthlete = {
  id: "local",
  provider: "local",
  vdot: 45,
  raceResults: [{ distanceM: 10000, timeSeconds: 2700, label: "夏季自测", date: "2026-08-01" }],
  isBeginner: false,
};
const sixAthlete = { id: "local", provider: "local", thresholdPaceSecondsPerKm: 240 };
const bareAthlete = { id: "local", provider: "local" };

async function mountPage(athlete) {
  getAthlete.mockResolvedValue(athlete);
  const wrapper = mount(Fitness, {
    global: {
      mocks: { $router: { push } },
      stubs: {
        "t-button": ButtonStub,
        "t-card": { template: "<section><slot /></section>" },
        "t-typography-title": { template: "<h4><slot /></h4>" },
        "t-dialog": DialogStub,
        "t-input-number": InputNumberStub,
      },
    },
  });
  await flushPromises();
  return wrapper;
}

describe("我的能力", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fitnessSavedHint.mockResolvedValue("");
  });

  it("VDOT 能力展示基准模式、成绩依据与五档配速", async () => {
    const wrapper = await mountPage(vdotAthlete);

    expect(wrapper.get('[data-testid="fitness-mode"]').text()).toBe("VDOT 45.0");
    expect(wrapper.text()).toContain("10 公里 45:00（夏季自测） · 2026-08-01");
    expect(wrapper.findAll('[data-testid="pace-row"]')).toHaveLength(5);
  });

  it("6 秒规则能力展示阈值配速", async () => {
    const wrapper = await mountPage(sixAthlete);

    expect(wrapper.get('[data-testid="fitness-mode"]').text()).toBe("6 秒规则（阈值配速）");
    expect(wrapper.text()).toContain("4:00/km");
  });

  it("未建立能力时可直接设置阈值配速，并在对话框内预览档位", async () => {
    const wrapper = await mountPage(bareAthlete);
    expect(wrapper.text()).toContain("尚未建立能力");
    expect(wrapper.find('[data-testid="six-dialog"]').exists()).toBe(false);

    await wrapper.get('[data-testid="open-six"]').trigger("click");
    const dialog = wrapper.get('[data-testid="six-dialog"]');
    // 默认按 4:00/km 预览，确认能够看到即将生效的配速
    expect(dialog.text()).toContain("4:00/km");

    saveAthleteFitness.mockResolvedValue({});
    await wrapper.get('[data-testid="six-min"]').setValue("4");
    await wrapper.get('[data-testid="six-sec"]').setValue("30");
    await wrapper.get('[data-testid="six-save"]').trigger("click");
    await flushPromises();

    expect(saveAthleteFitness).toHaveBeenCalledWith({ mode: "sixSecond", thresholdPaceSecondsPerKm: 270 });
    expect(wrapper.find('[data-testid="six-dialog"]').exists()).toBe(false);
  });

  it("阈值配速过慢时给出提示且不保存", async () => {
    const wrapper = await mountPage(bareAthlete);
    await wrapper.get('[data-testid="open-six"]').trigger("click");

    await wrapper.get('[data-testid="six-min"]').setValue("0");
    await wrapper.get('[data-testid="six-sec"]').setValue("30");
    await wrapper.get('[data-testid="six-save"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="six-error"]').text()).toContain("阈值配速需大于 45 秒/公里");
    expect(saveAthleteFitness).not.toHaveBeenCalled();
  });
});
