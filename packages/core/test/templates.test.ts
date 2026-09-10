import { describe, expect, it } from "vitest";
import {
  FIVE_WEEK_PLAN,
  TWENTY_WEEK_PLAN,
  getPlanTemplate,
  listPlanTemplates,
  validatePlanTemplate,
} from "../src/index.js";

describe("built-in plan templates", () => {
  it("contains the complete five-week countdown", () => {
    expect(FIVE_WEEK_PLAN.weeks.map(({ week }) => week)).toEqual([5, 4, 3, 2, 1]);
    expect(() => validatePlanTemplate(FIVE_WEEK_PLAN)).not.toThrow();
  });

  it("contains the complete twenty-week countdown with corrected race week", () => {
    expect(TWENTY_WEEK_PLAN.weeks.map(({ week }) => week)).toEqual(
      Array.from({ length: 20 }, (_, index) => 20 - index),
    );
    expect(TWENTY_WEEK_PLAN.weeks.at(-1)?.days.at(-1)?.items[0]?.type).toBe("RACE");
    expect(() => validatePlanTemplate(TWENTY_WEEK_PLAN)).not.toThrow();
  });

  it("preserves both the long-run option and race-test option", () => {
    const day = TWENTY_WEEK_PLAN.weeks.find(({ week }) => week === 6)?.days[6];
    expect(day?.items.map(({ type }) => type)).toEqual(["L", "E"]);
    expect(day?.alternatives?.[0].map(({ type }) => type)).toEqual(["TEST"]);
  });

  it("preserves conditional training and stride repetition ranges", () => {
    const week18 = TWENTY_WEEK_PLAN.weeks.find(({ week }) => week === 18);
    expect(week18?.days[1].items.map(({ type }) => type)).toEqual(["R"]);
    expect(week18?.days[1].alternatives?.[0].map(({ type }) => type)).toEqual(["E"]);
    expect(week18?.days[5].items.find(({ type }) => type === "ST")?.repetitionRange)
      .toEqual({ min: 6, max: 8 });
  });

  it("lists and resolves registered templates", () => {
    expect(listPlanTemplates().map(({ id }) => id)).toEqual(["20-week", "5-week-cycle"]);
    expect(getPlanTemplate("5-week-cycle")).toEqual(FIVE_WEEK_PLAN);
    expect(() => getPlanTemplate("missing")).toThrowError(/Unknown plan template/);
  });

  it("returns isolated templates from the registry", () => {
    const first = getPlanTemplate("20-week");
    first.weeks[0].volume.min = 9;
    expect(getPlanTemplate("20-week").weeks[0].volume.min).toBe(0.6);
  });

  it("does not allow public template constants to corrupt the registry", () => {
    const original = TWENTY_WEEK_PLAN.weeks[0].volume.min;
    TWENTY_WEEK_PLAN.weeks[0].volume.min = 9;
    expect(getPlanTemplate("20-week").weeks[0].volume.min).toBe(original);
    TWENTY_WEEK_PLAN.weeks[0].volume.min = original;
  });

  it("preserves load-critical taper guidance", () => {
    const plan = getPlanTemplate("20-week");
    expect(plan.weeks.find(({ week }) => week === 18)?.days[6].note).toMatch(/M.*负荷/);
    expect(plan.weeks.find(({ week }) => week === 2)?.days[2].note).toMatch(/0\.7/);
    expect(plan.weeks.find(({ week }) => week === 1)?.days[5].alternatives?.[0][0].type).toBe("E");
  });
});
