import { describe, expect, it } from "vitest";
import {
  VDOT_INTENSITY_FACTORS,
  assessFromResults,
  paceSecondsPerKm,
  pacesFromVdot,
  raceTimeFromVdot,
  selectFitnessRace,
  vdotFromRace,
} from "../src/vdot.js";

describe("vdot model (Daniels/Gilbert, source: hoodarunner/running-coach-sft Apache-2.0)", () => {
  it("inverts race time <-> vdot consistently", () => {
    const distanceM = 10000;
    const timeSeconds = 40 * 60; // 10k 40:00
    const vdot = vdotFromRace(distanceM, timeSeconds);
    expect(vdot).toBeGreaterThan(40);
    expect(vdot).toBeLessThan(60);
    const back = raceTimeFromVdot(vdot, distanceM);
    expect(Math.abs(back - timeSeconds) / timeSeconds).toBeLessThan(0.01); // 1% 容差
  });

  it("orders pace zones from slowest to fastest", () => {
    const paces = pacesFromVdot(50);
    const seconds = {
      E_slow: paces.E.slow,
      E_fast: paces.E.fast,
      M_slow: paces.M.slow,
      T_slow: paces.T.slow,
      I_slow: paces.I.slow,
      R_slow: paces.R.slow,
    };
    expect(seconds.E_slow).toBeGreaterThan(seconds.E_fast);
    expect(seconds.E_fast).toBeGreaterThan(seconds.M_slow);
    expect(seconds.M_slow).toBeGreaterThan(seconds.T_slow);
    expect(seconds.T_slow).toBeGreaterThan(seconds.I_slow);
    expect(seconds.I_slow).toBeGreaterThan(seconds.R_slow);
  });

  it("uses documented intensity factors", () => {
    // 档位中心值由 VDOT × 百分比反解速度得到
    const vdot = 50;
    expect(paceSecondsPerKm(VDOT_INTENSITY_FACTORS.T, vdot)).toBeCloseTo(
      (pacesFromVdot(vdot).T.slow + pacesFromVdot(vdot).T.fast) / 2,
      0,
    );
  });

  it("assesses results by time/type priority (not max vdot)", () => {
    // 无 date 视为录入当天（最新）；10k 类型优先级高于 5k
    const assessment = assessFromResults([
      { distanceM: 5000, timeSeconds: 25 * 60, label: "5k" },
      { distanceM: 10000, timeSeconds: 42 * 60, label: "10k" },
    ]);
    expect(assessment.contributingResult.label).toBe("10k");
    expect(assessment.vdot).toBeCloseTo(vdotFromRace(10000, 42 * 60), 1);
  });

  it("selectFitnessRace prefers recent threshold-domain races over recent PB of other types", () => {
    const now = "2026-09-10";
    const { selected } = selectFitnessRace(
      [
        { distanceM: 5000, timeSeconds: 21 * 60, date: "2026-09-01", label: "5k" }, // 30 天内
        { distanceM: 10000, timeSeconds: 44 * 60, date: "2026-08-01", label: "10k" }, // 40 天前（60 天内乳酸域）
      ],
      { now },
    );
    expect(selected?.label).toBe("10k"); // 桶 0 优先于桶 1
  });

  it("ignores threshold-domain races older than 60 days when newer PB exists", () => {
    const now = "2026-09-10";
    const { selected } = selectFitnessRace(
      [
        { distanceM: 10000, timeSeconds: 44 * 60, date: "2026-06-20", label: "10k" }, // 82 天前
        { distanceM: 5000, timeSeconds: 21 * 30, date: "2026-09-05", label: "5k" }, // 5 天前
      ],
      { now },
    );
    expect(selected?.label).toBe("5k");
  });

  it("drops results older than 180 days and reports ignored count", () => {
    const now = "2026-09-10";
    const { selected, ignoredCount } = selectFitnessRace(
      [
        { distanceM: 10000, timeSeconds: 44 * 60, date: "2026-01-01", label: "10k" }, // 252 天前
        { distanceM: 10000, timeSeconds: 45 * 60, date: "2026-09-01", label: "10k-new" }, // 9 天前
      ],
      { now },
    );
    expect(selected?.label).toBe("10k-new");
    expect(ignoredCount).toBe(1);
    expect(() =>
      assessFromResults(
        [{ distanceM: 10000, timeSeconds: 44 * 60, date: "2025-01-01" }],
        { now },
      ),
    ).toThrowError(/180 天/);
  });

  it("orders same-bucket races by type: 15/16km > 10km > half", () => {
    const now = "2026-09-10";
    const { selected } = selectFitnessRace(
      [
        { distanceM: 21097.5, timeSeconds: 95 * 60, date: "2026-09-01", label: "half" },
        { distanceM: 15000, timeSeconds: 62 * 60, date: "2026-09-01", label: "15k" },
        { distanceM: 10000, timeSeconds: 41 * 60, date: "2026-09-01", label: "10k" },
      ],
      { now },
    );
    expect(selected?.label).toBe("15k");
  });

  it("rejects invalid inputs and out-of-range vdot", () => {
    expect(() => vdotFromRace(0, 600)).toThrowError(/距离/);
    expect(() => vdotFromRace(5000, -1)).toThrowError(/时间/);
    expect(() => pacesFromVdot(10)).toThrowError(/20-85/);
    expect(() => pacesFromVdot(90)).toThrowError(/20-85/);
    expect(() => assessFromResults([])).toThrowError(/至少/);
  });
});
