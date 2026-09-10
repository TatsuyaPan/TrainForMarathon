import { describe, expect, it } from "vitest";
import {
  PlanValidationError,
  validatePlanTemplate,
  type PlanTemplate,
} from "../src/index.js";

const sevenRestDays = () => Array.from({ length: 7 }, (_, dayIndex) => ({
  dayIndex,
  label: "跑休",
  items: [{ type: "REST" as const }],
}));

function template(overrides: Partial<PlanTemplate> = {}): PlanTemplate {
  return {
    id: "test-plan",
    name: "测试课表",
    schemaVersion: 1,
    weekCount: 2,
    weeks: [
      { week: 2, phase: "基础期", volume: { min: 0.6, max: 0.7 }, days: sevenRestDays() },
      { week: 1, phase: "比赛周", volume: { min: 0.4, max: 0.4 }, days: sevenRestDays() },
    ],
    ...overrides,
  };
}

describe("validatePlanTemplate", () => {
  it("accepts a complete countdown template", () => {
    expect(validatePlanTemplate(template())).toBe(template().id);
  });

  it("rejects discontinuous week numbers", () => {
    const invalid = template({
      weeks: [template().weeks[0], { ...template().weeks[1], week: 8 }],
    });
    expect(() => validatePlanTemplate(invalid)).toThrowError(/expected week 1, received 8/);
  });

  it("rejects weeks without exactly seven ordered days", () => {
    const invalid = template({
      weeks: [{ ...template().weeks[0], days: sevenRestDays().slice(0, 6) }, template().weeks[1]],
    });
    expect(() => validatePlanTemplate(invalid)).toThrowError(/exactly 7 days/);
  });

  it("rejects unregistered training type identifiers", () => {
    const invalid = template();
    invalid.weeks[0].days[0].items = [{ type: "UNKNOWN" as never }];
    expect(() => validatePlanTemplate(invalid)).toThrowError(/unknown training type UNKNOWN/);
  });

  it("rejects inverted volume ranges", () => {
    const invalid = template();
    invalid.weeks[0].volume = { min: 0.9, max: 0.8 };
    expect(() => validatePlanTemplate(invalid)).toThrowError(PlanValidationError);
    expect(() => validatePlanTemplate(invalid)).toThrowError(/volume range/);
  });

  it("rejects non-finite volume and empty training items", () => {
    const invalidVolume = template();
    invalidVolume.weeks[0].volume = { min: Number.NaN, max: 1 };
    expect(() => validatePlanTemplate(invalidVolume)).toThrowError(/finite volume range/);
    const emptyDay = template();
    emptyDay.weeks[0].days[0].items = [];
    expect(() => validatePlanTemplate(emptyDay)).toThrowError(/at least one training item/);
  });

  it("rejects invalid stride ranges and empty alternatives", () => {
    const invalid = template();
    invalid.weeks[0].days[0].items[0].repetitionRange = { min: 8, max: 6 };
    invalid.weeks[0].days[1].alternatives = [[]];
    expect(() => validatePlanTemplate(invalid)).toThrowError(/invalid repetition range.*alternative 0 must contain/);
  });
});
