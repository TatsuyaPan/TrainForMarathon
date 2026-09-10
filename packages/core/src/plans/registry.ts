import type { PlanTemplate } from "../domain.js";
import { FIVE_WEEK_PLAN } from "./five-week.js";
import { TWENTY_WEEK_PLAN } from "./twenty-week.js";
import { validatePlanTemplate } from "./validate.js";

const templates = [clonePlanTemplate(TWENTY_WEEK_PLAN), clonePlanTemplate(FIVE_WEEK_PLAN)] as const;
const registry = new Map<string, PlanTemplate>();

for (const template of templates) {
  validatePlanTemplate(template);
  if (registry.has(template.id)) throw new Error(`Duplicate plan template: ${template.id}`);
  registry.set(template.id, template);
}

export function listPlanTemplates(): readonly PlanTemplate[] {
  return templates.map(clonePlanTemplate);
}

export function getPlanTemplate(templateId: string): PlanTemplate {
  const template = registry.get(templateId);
  if (!template) throw new Error(`Unknown plan template: ${templateId}`);
  return clonePlanTemplate(template);
}

function clonePlanTemplate(template: PlanTemplate): PlanTemplate {
  return {
    ...template,
    weeks: template.weeks.map((week) => ({
      ...week,
      volume: { ...week.volume },
      days: week.days.map((day) => ({
        ...day,
        items: day.items.map((item) => ({
          ...item,
          repetitionRange: item.repetitionRange ? { ...item.repetitionRange } : undefined,
        })),
        alternatives: day.alternatives?.map((choice) => choice.map((item) => ({
          ...item,
          repetitionRange: item.repetitionRange ? { ...item.repetitionRange } : undefined,
        }))),
      })),
    })),
  };
}
