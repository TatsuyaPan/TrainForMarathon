import type { PlanTemplate } from "../domain.js";
import { planWeek, trainingDay } from "./build.js";

const rest = "跑休";
const eSt = "E + 6–8 ST";

export const TWENTY_WEEK_PLAN: PlanTemplate = {
  id: "20-week",
  name: "典型 20 周训练计划",
  schemaVersion: 1,
  weekCount: 20,
  weeks: [
    planWeek(20, "基础期", 0.6, 0.7, [rest, "E", "E", "E", rest, eSt, "M"]),
    planWeek(19, "基础期", 0.8, 0.8, [rest, "T", "E", "E", rest, eSt, "L + E"]),
    planWeek(18, "基础期", 0.9, 0.9, [rest, trainingDay("R（不适应可改 E）", ["R"], [["E"]]), "E", "E", rest, eSt, trainingDay("M 或 L + E", ["M"], [["L", "E"]], "自由选择较短的 M 或较长的 L；选择 M 时控制距离，避免负荷过大")]),
    planWeek(17, "基础期", 0.8, 0.8, [rest, "E", "E", "E", rest, eSt, "L + E"], "调整周，除 ST 外不安排强度，准备进入提高期"),
    planWeek(16, "提高期", 0.9, 0.9, [rest, "T + R", "E", "E", rest, eSt, "L + E"]),
    planWeek(15, "提高期", 1, 1, [rest, "T", "E", "I", rest, eSt, "L + E"]),
    planWeek(14, "提高期", 1, 1, [rest, trainingDay("T + M（可选 E）混合刺激", ["T", "M"], [["T", "M", "E"]]), "E", "R", rest, "E", "L + E"]),
    planWeek(13, "提高期", 0.9, 0.9, [rest, "E", "E", eSt, rest, eSt, "L + E"], "调整周，无强度"),
    planWeek(12, "提高期", 1, 1, [rest, "T", "E", "R", rest, "E", "L + E"]),
    planWeek(11, "提高期", 1, 1, [rest, "T", "E", "I", rest, "E", "L + E"]),
    planWeek(10, "提高期", 1, 1, [rest, "T", "E", "R", rest, "E", "T + M + E 长距离"], "本周负荷较大"),
    planWeek(9, "提高期", 0.9, 0.9, [rest, "E", "E", eSt, rest, "E", "L + E"], "调整周，准备进入巅峰期"),
    planWeek(8, "巅峰期", 1, 1, [rest, "T", "E", "I", rest, eSt, "L + E"]),
    planWeek(7, "巅峰期", 1, 1, [rest, "T + R", "E", "I", rest, eSt, "L + E"]),
    planWeek(6, "巅峰期", 1, 1.1, [rest, "T", "E", "R", rest, "E", "L + E 或赛前自测"]),
    planWeek(5, "巅峰期", 1, 1.1, [rest, "T", "E", "I", rest, "E", "L + E 或赛前自测"]),
    planWeek(4, "巅峰期", 1, 1, [rest, "T + M 或 E + M", "E", "M + R", rest, "E", "L + E"]),
    planWeek(3, "巅峰期", 1, 1, [rest, "T 或 T + M 或 M + T + I 混合训练", "E", "I", rest, eSt, "L + E 或 T + M + E 长距离"]),
    planWeek(2, "赛前减量", 0.6, 0.6, [
      rest,
      trainingDay("T + M 或 T", ["T", "M"], [["T"]], "最后一个完整强度课，从后一天开始减量"),
      trainingDay("E", ["E"], undefined, "减量到正常训练量的 0.7"),
      trainingDay("E + M + R", ["E", "M", "R"], undefined, "减量到正常训练量的 0.6–0.7"),
      rest,
      trainingDay("E", ["E"], undefined, "减量到正常训练量的 0.5"),
      trainingDay("L + E", ["L", "E"], undefined, "不再跑强度，减量到正常训练量的 0.5–0.6"),
    ]),
    planWeek(1, "赛前减量", 0.4, 0.4, [
      rest,
      trainingDay("M + E", ["M", "E"], undefined, "减量到正常训练量的 0.4–0.5"),
      trainingDay("M + E 或 E", ["M", "E"], [["E"]], "减量到正常训练量的 0.4"),
      trainingDay("E 或跑休", ["E"], [["REST"]], "减量到正常训练量的 0.4"),
      trainingDay("E 或跑休", ["E"], [["REST"]], "减量到正常训练量的 0.4"),
      trainingDay("跑休；必要时 E", ["REST"], [["E"]], "若周三、周四均未跑，可进行 0.4 倍正常训练量的 E 跑"),
      "比赛日",
    ]),
  ],
};
