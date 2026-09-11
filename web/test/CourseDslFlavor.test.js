import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { createLibraryCourse, parseWorkoutDsl } from "@core";
import CourseCard from "../src/components/CourseCard.vue";
import { invalidateAthlete } from "../src/app-context.js";
import { refreshPaceDisplay } from "../src/composables/usePaceDisplay.js";

const ATHLETE_KEY = "tfm:athletes:current";

const ButtonStub = {
  props: ["disabled"],
  emits: ["click"],
  template: "<button :disabled=\"disabled\" @click=\"$emit('click')\"><slot /></button>",
};

const WORKOUT = parseWorkoutDsl(
  ["TITLE:阈值课", "GOAL:乳酸阈能力", "WU:15min@E", "MS:6x(8min@T+90s@jog)", "CD:10min@E"].join("\n"),
);

/** 只放能力：阈值 4:00/km → T 3:45-4:00、E 3:10-3:30 */
async function seedAbility(thresholdPaceSecondsPerKm) {
  window.localStorage.clear();
  if (thresholdPaceSecondsPerKm !== null) {
    window.localStorage.setItem(
      ATHLETE_KEY,
      JSON.stringify({
        id: "local-test",
        provider: "local",
        schemaVersion: 1,
        maxWeeklyKm: 60,
        thresholdPaceSecondsPerKm,
        isBeginner: false,
        createdAt: "2026-09-10T08:00:00.000Z",
        updatedAt: "2026-09-10T08:00:00.000Z",
      }),
    );
  }
  invalidateAthlete();
  await refreshPaceDisplay();
}

async function mountCardWithDsl() {
  const course = createLibraryCourse({ category: "T", workout: WORKOUT });
  const wrapper = mount(CourseCard, {
    props: { course },
    global: { stubs: { "t-button": ButtonStub } },
  });
  await wrapper.get('[data-testid="toggle-dsl"]').trigger("click");
  return wrapper;
}

async function mountWorkoutWithDsl(workout, category = "mixed") {
  const course = createLibraryCourse({ category, workout });
  const wrapper = mount(CourseCard, {
    props: { course },
    global: { stubs: { "t-button": ButtonStub } },
  });
  await wrapper.get('[data-testid="toggle-dsl"]').trigger("click");
  return wrapper;
}

function dslText(wrapper) {
  return wrapper.get('[data-testid="course-dsl"]').text();
}

describe("课程卡片的 DSL 写法", () => {
  afterEach(async () => {
    await seedAbility(null);
  });

  it("默认跟随课表展示口径：配速口径下把档位换算成明确配速", async () => {
    await seedAbility(240);
    const wrapper = await mountCardWithDsl();

    const dsl = dslText(wrapper);
    expect(dsl.startsWith("WORKOUT/2")).toBe(true);
    expect(dsl).toContain("WU:15min@P3:10-3:30/km");
    expect(dsl).toContain("6x(8min@P3:45-4:00/km+90s@jog)");
    expect(dsl).not.toContain("@T");
    expect(wrapper.get('[data-testid="dsl-flavor-pace"]').attributes("aria-pressed")).toBe("true");
  });

  it("切换写法：档位写法只有档位，配速写法只有明确配速", async () => {
    await seedAbility(240);
    const wrapper = await mountCardWithDsl();

    await wrapper.get('[data-testid="dsl-flavor-zone"]').trigger("click");
    const zoneDsl = dslText(wrapper);
    expect(zoneDsl.startsWith("WORKOUT/2")).toBe(true);
    expect(zoneDsl).toContain("6x(8min@T+90s@jog)");
    expect(zoneDsl).not.toContain("@P");
    expect(wrapper.get('[data-testid="dsl-flavor-zone"]').attributes("aria-pressed")).toBe("true");

    await wrapper.get('[data-testid="dsl-flavor-pace"]').trigger("click");
    const paceDsl = dslText(wrapper);
    expect(paceDsl).toContain("6x(8min@P3:45-4:00/km+90s@jog)");
    expect(paceDsl).not.toContain("@T");
    // 配速写法是派生投影：两条文本不同，只有档位写法带训练意图
    expect(paceDsl).not.toBe(zoneDsl);
  });

  it("没有能力时配速写法退回档位写法，并说明原因", async () => {
    await seedAbility(null);
    const wrapper = await mountCardWithDsl();

    expect(wrapper.get('[data-testid="dsl-flavor-pace"]').attributes("aria-pressed")).toBe("true");
    const dsl = dslText(wrapper);
    expect(dsl).toContain("6x(8min@T+90s@jog)");
    expect(dsl).not.toContain("@P");
    expect(wrapper.text()).toContain("尚未建立能力");
  });

  it("只有明确配速的课表没有写法可切换，也不会被反推成档位", async () => {
    await seedAbility(240);
    const wrapper = await mountWorkoutWithDsl(
      parseWorkoutDsl("TITLE:马拉松配速课\nGOAL:马拉松专项适应\nMS:12km@P4:45-5:00/km"),
    );

    expect(wrapper.find('[data-testid="dsl-flavor-zone"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="dsl-flavor-pace"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="dsl-single-flavor"]').text()).toContain("不含强度档位");

    const dsl = dslText(wrapper);
    expect(dsl).toContain("12km@P4:45-5:00/km");
    // 明确配速保持原样：不会被换算成 E/M/T/I/R
    expect(dsl).not.toMatch(/@(?:E|M|T|I|R)\b/u);
  });

  it("混合课程：只把档位换算成配速，明确配速保持不变", async () => {
    await seedAbility(240);
    const wrapper = await mountWorkoutWithDsl(
      parseWorkoutDsl("GOAL:I 与阈值混合\nWU:15min@E\nMS:5x(3min@I+2min@jog)+5min@P4:45-5:00/km"),
    );

    const paceDsl = dslText(wrapper);
    expect(paceDsl).toContain("3min@P3:30-3:45/km");
    expect(paceDsl).toContain("5min@P4:45-5:00/km");
    expect(paceDsl).not.toContain("@I");
  });
});
