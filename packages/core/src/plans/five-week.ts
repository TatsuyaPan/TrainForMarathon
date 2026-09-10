import type { PlanTemplate } from "../domain.js";
import { planWeek } from "./build.js";

const eSt = "E + 6–8 ST";

export const FIVE_WEEK_PLAN: PlanTemplate = {
  id: "5-week-cycle",
  name: "五周循环训练计划",
  schemaVersion: 1,
  weekCount: 5,
  weeks: [
    planWeek(5, "循环", 1, 1, [eSt, "E", "T", "R", "E", eSt, "L + E"]),
    planWeek(4, "循环", 1, 1, [eSt, "E", "T", "R", "E", eSt, "M"], "M 跑不需要跑到 L 跑的距离"),
    planWeek(3, "循环", 1, 1, [eSt, "E", "T", "I", "E", eSt, "L + E"]),
    planWeek(2, "循环", 1, 1, [eSt, "E", "T", "R", "E", eSt, "M"], "M 跑不需要跑到 L 跑的距离"),
    planWeek(1, "循环", 1, 1, [eSt, "E", "T", "I + R 混合训练", "E", eSt, "L + E"]),
  ],
};
