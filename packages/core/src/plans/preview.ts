/**
 * 计划预览数据（纯描述，供文章嵌入等场景渲染计划表格）。
 * 平台无关：web 与小程序共用同一份描述，各自渲染。
 */
import type { PlanTemplate } from "../domain.js";

export interface PlanPreviewRow {
  week: number;
  phase: string;
  volumeLabel: string;
  days: string[];
  note?: string;
}

export interface PlanPreview {
  id: string;
  name: string;
  weekCount: number;
  rows: PlanPreviewRow[];
}

export function describePlanTemplate(template: PlanTemplate): PlanPreview {
  return {
    id: template.id,
    name: template.name,
    weekCount: template.weekCount,
    rows: template.weeks.map((week) => ({
      week: week.week,
      phase: week.phase,
      volumeLabel: week.volume.min === week.volume.max
        ? String(week.volume.min)
        : `${week.volume.min}–${week.volume.max}`,
      days: week.days.map((day) => day.label),
      note: week.note,
    })),
  };
}
