import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it } from "vitest";
import { parseWorkoutDsl } from "@core";
import CourseCard from "../src/components/CourseCard.vue";
import DisplayModeSwitch from "../src/components/DisplayModeSwitch.vue";
import { clearAthleteFitness, saveAthleteFitness } from "../src/app-context.js";
import { usePaceDisplay } from "../src/composables/usePaceDisplay.js";
import {
  DISPLAY_PREFS_KEY,
  readTargetDisplayMode,
  writeTargetDisplayMode,
} from "../src/stores/display-prefs.js";

const COURSE = {
  id: "custom:t",
  origin: "custom",
  category: "T",
  tags: ["T"],
  workout: parseWorkoutDsl("TITLE:阈值 8 分钟 ×3\nGOAL:乳酸阈能力\nWU:15min@E\nMS:3x(8min@T+90s@jog)\nCD:10min@E"),
};

function structureText(wrapper) {
  return wrapper.findAll('[data-testid^="structure-step-"]').map((row) => row.text()).join("\n");
}

async function mountExpandedCard() {
  const wrapper = mount(CourseCard, {
    props: { course: COURSE },
    global: { stubs: { "t-button": { template: "<button><slot /></button>" } } },
  });
  await wrapper.get('[data-testid="toggle-structure"]').trigger("click");
  return wrapper;
}

/** 能力读取是异步的（app-context 里是 async 函数），等一轮微任务再断言 */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("课表展示偏好（localStorage）", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("默认按配速展示，读写后保持选择", () => {
    expect(readTargetDisplayMode()).toBe("pace");
    expect(writeTargetDisplayMode("zone")).toBe("zone");
    expect(readTargetDisplayMode()).toBe("zone");
    expect(JSON.parse(localStorage.getItem(DISPLAY_PREFS_KEY))).toEqual({ targetDisplayMode: "zone" });
  });

  it("数据损坏或取值非法时回退默认口径", () => {
    localStorage.setItem(DISPLAY_PREFS_KEY, "{不是 JSON");
    expect(readTargetDisplayMode()).toBe("pace");
    localStorage.setItem(DISPLAY_PREFS_KEY, JSON.stringify({ targetDisplayMode: "speed" }));
    expect(readTargetDisplayMode()).toBe("pace");
    expect(writeTargetDisplayMode("speed")).toBe("pace");
  });
});

describe("强度 ↔ 配速开关", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAthleteFitness();
    usePaceDisplay().setMode("pace");
  });

  it("切到「强度」写入偏好，切回「配速」恢复", async () => {
    const wrapper = mount(DisplayModeSwitch);
    expect(wrapper.get('[data-testid="display-mode-pace"]').attributes("aria-pressed")).toBe("true");

    await wrapper.get('[data-testid="display-mode-zone"]').trigger("click");
    expect(wrapper.get('[data-testid="display-mode-zone"]').attributes("aria-pressed")).toBe("true");
    expect(readTargetDisplayMode()).toBe("zone");

    await wrapper.get('[data-testid="display-mode-pace"]').trigger("click");
    expect(readTargetDisplayMode()).toBe("pace");
  });

  it("尚未建立能力时说明为什么看不到配速", async () => {
    const wrapper = mount(DisplayModeSwitch);
    await flush();
    await wrapper.vm.$nextTick();
    expect(wrapper.get('[data-testid="display-mode-hint"]').text()).toContain("尚未建立能力");
  });
});

describe("课程卡片跟随展示口径", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearAthleteFitness();
    usePaceDisplay().setMode("pace");
  });

  it("建立能力后，配速口径显示换算结果，强度口径保留档位", async () => {
    await saveAthleteFitness({ mode: "sixSecond", thresholdPaceSecondsPerKm: 240 });
    const wrapper = await mountExpandedCard();
    expect(structureText(wrapper)).toContain("3:45–4:00/km（T）");
    expect(structureText(wrapper)).toContain("3:10–3:30/km（E · 估算）");

    usePaceDisplay().setMode("zone");
    await wrapper.vm.$nextTick();
    const zoneText = structureText(wrapper);
    expect(zoneText).toContain("乳酸阈配速（T）");
    expect(zoneText).not.toContain("/km");
  });

  it("没有能力时不伪造配速，回退到强度标签", async () => {
    const wrapper = await mountExpandedCard();
    const text = structureText(wrapper);
    expect(text).toContain("乳酸阈配速（T）");
    expect(text).not.toContain("/km");
  });
});
