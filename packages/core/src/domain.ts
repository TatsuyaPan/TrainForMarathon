export const TRAINING_TYPE_IDS = [
  "E",
  "M",
  "T",
  "I",
  "R",
  "L",
  "ST",
  "REST",
  "RACE",
  "TEST",
] as const;

export type TrainingTypeId = (typeof TRAINING_TYPE_IDS)[number];

export interface TrainingItem {
  type: TrainingTypeId;
  repetitions?: number;
  repetitionRange?: VolumeRange;
  note?: string;
}

export interface PlanDay {
  dayIndex: number;
  label: string;
  items: TrainingItem[];
  alternatives?: TrainingItem[][];
  note?: string;
}

export interface VolumeRange {
  min: number;
  max: number;
}

export interface PlanWeek {
  week: number;
  phase: string;
  volume: VolumeRange;
  days: PlanDay[];
  note?: string;
}

export interface PlanTemplate {
  id: string;
  name: string;
  schemaVersion: 1;
  weekCount: number;
  weeks: PlanWeek[];
}

export type ProgressStatus = "completed" | "partial" | "skipped";

export interface ProgressRecord {
  dayId: string;
  status: ProgressStatus;
  updatedAt: string;
  actualDistanceKm?: number;
  actualDurationMinutes?: number;
}

export interface PlanInstanceDay extends PlanDay {
  id: string;
  date: string;
  plannedDistanceKm?: number;
  plannedDurationMinutes?: number;
}

export interface PlanInstanceWeek extends Omit<PlanWeek, "days"> {
  targetKm: VolumeRange;
  days: PlanInstanceDay[];
}

export interface PlanInstance {
  templateId: string;
  templateVersion: number;
  raceDate: string;
  paces: import("./pace.js").PaceProfile;
  weeks: PlanInstanceWeek[];
}
