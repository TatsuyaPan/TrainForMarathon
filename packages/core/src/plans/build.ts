import type { PlanDay, PlanWeek, TrainingItem, TrainingTypeId } from "../domain.js";

const codePattern = /ST|[EMTIRL]/g;

function itemsFromLabel(label: string): TrainingItem[] {
  if (label.includes("比赛日")) return [{ type: "RACE" }];
  const codes: string[] = [...(label.match(codePattern) ?? [])];
  if (label.includes("赛前自测")) codes.push("TEST");
  if (label.includes("跑休") && codes.length === 0) return [{ type: "REST" }];
  const items = codes.map((type) => ({
    type: type as TrainingTypeId,
    ...(type === "ST" && /6[–-]8\s*ST/u.test(label)
      ? { repetitionRange: { min: 6, max: 8 } }
      : {}),
  }));
  return items.length > 0 ? items : [{ type: "REST" }];
}

export interface PlanDaySource {
  label: string;
  items: TrainingItem[];
  alternatives?: TrainingItem[][];
  note?: string;
}

export function trainingDay(
  label: string,
  types: TrainingTypeId[],
  alternatives?: TrainingTypeId[][],
  note?: string,
): PlanDaySource {
  return {
    label,
    items: types.map((type) => ({ type })),
    alternatives: alternatives?.map((choice) => choice.map((type) => ({ type }))),
    note,
  };
}

export function planWeek(
  week: number,
  phase: string,
  volumeMin: number,
  volumeMax: number,
  labels: [
    string | PlanDaySource,
    string | PlanDaySource,
    string | PlanDaySource,
    string | PlanDaySource,
    string | PlanDaySource,
    string | PlanDaySource,
    string | PlanDaySource,
  ],
  note?: string,
): PlanWeek {
  const days: PlanDay[] = labels.map((source, dayIndex) => {
    if (typeof source !== "string") return { dayIndex, ...source };
    const label = source;
    const choices = label.split(/\s*或\s*/u);
    return {
      dayIndex,
      label,
      items: itemsFromLabel(choices[0]),
      alternatives: choices.length > 1 ? choices.slice(1).map(itemsFromLabel) : undefined,
    };
  });
  return { week, phase, volume: { min: volumeMin, max: volumeMax }, days, note };
}
