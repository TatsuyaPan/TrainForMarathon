import { describe, expect, it } from "vitest";
import {
  fitnessModeLabel,
  fitnessPaceRows,
  formatRaceTime,
  parseRaceTime,
  raceDistanceLabel,
  raceResultLine,
  raceResultsSummary,
  sixSecondPaceRows,
  vdotPaceRows,
  type AthleteFitness,
} from "../src/fitness.js";

describe("能力档位展示（平台无关）", () => {
  it("6 秒规则：T 为基准，I/R 各减 15 秒，E/M 给估算与替代方案", () => {
    const rows = sixSecondPaceRows(240);
    expect(rows.map((row) => row.zone)).toEqual(["E", "M", "T", "I", "R"]);
    expect(rows[2].value).toBe("4:00/km – 3:45/km");
    expect(rows[1].value).toContain("≈ 3:45/km");
    expect(rows[0].value).toContain("按心率");
    expect(rows.every((row) => row.name.length > 0 && row.note.length > 0)).toBe(true);
  });

  it("6 秒规则：配速过慢（≤45 秒）直接报错，不产出错误档位", () => {
    expect(() => sixSecondPaceRows(40)).toThrowError();
  });

  it("VDOT：五个档位都给出配速区间与依据", () => {
    const rows = vdotPaceRows(45);
    expect(rows.map((row) => row.zone)).toEqual(["E", "M", "T", "I", "R"]);
    for (const row of rows) {
      expect(row.value).toMatch(/km/u);
    }
    expect(rows[2].note).toContain("88.4%");
  });

  it("按能力摘要分发档位表，未建立能力时为空", () => {
    const vdot: AthleteFitness = { mode: "vdot", vdot: 45, raceResults: [] };
    const six: AthleteFitness = { mode: "sixSecond", thresholdPaceSecondsPerKm: 240 };
    expect(fitnessPaceRows(vdot)).toEqual(vdotPaceRows(45));
    expect(fitnessPaceRows(six)).toEqual(sixSecondPaceRows(240));
    expect(fitnessPaceRows(null)).toEqual([]);
  });

  it("能力基准模式文案区分 VDOT / 新手表 / 6 秒规则", () => {
    expect(fitnessModeLabel({ mode: "vdot", vdot: 45, isBeginner: false })).toBe("VDOT 45.0");
    expect(fitnessModeLabel({ mode: "vdot", vdot: 28, isBeginner: true })).toBe("VDOT 28.0（新手表）");
    expect(fitnessModeLabel({ mode: "sixSecond", thresholdPaceSecondsPerKm: 240 })).toBe("6 秒规则（阈值配速）");
    expect(fitnessModeLabel(null)).toBe("尚未建立能力");
  });
});

describe("成绩文案与时长解析", () => {
  it("时长文案在 1 小时内省略小时位", () => {
    expect(formatRaceTime(2700)).toBe("45:00");
    expect(formatRaceTime(5070)).toBe("1:24:30");
    expect(formatRaceTime(32.4)).toBe("0:32");
  });

  it("解析 45:00 与 1:24:30，非法输入返回 NaN", () => {
    expect(parseRaceTime("45:00")).toBe(2700);
    expect(parseRaceTime(" 1:24:30 ")).toBe(5070);
    expect(parseRaceTime("")).toBeNaN();
    expect(parseRaceTime("abc")).toBeNaN();
    expect(parseRaceTime("1:-5")).toBeNaN();
  });

  it("时长文案与解析互逆", () => {
    for (const seconds of [1234, 2700, 5070]) {
      expect(parseRaceTime(formatRaceTime(seconds))).toBe(seconds);
    }
  });

  it("比赛距离优先用常用简称，非常用距离回退为米数", () => {
    expect(raceDistanceLabel(10000)).toBe("10 公里");
    expect(raceDistanceLabel(21097.5)).toBe("半马");
    expect(raceDistanceLabel(2500)).toBe("2500 米");
  });

  it("单条与多条成绩文案包含距离、时长、备注与日期", () => {
    const line = raceResultLine({ distanceM: 10000, timeSeconds: 2700, label: "夏季自测", date: "2026-08-01" });
    expect(line).toBe("10 公里 45:00（夏季自测） · 2026-08-01");
    expect(raceResultsSummary([{ distanceM: 5000, timeSeconds: 1200 }])).toBe("5 公里 20:00");
    expect(raceResultsSummary([])).toBe("");
  });
});
