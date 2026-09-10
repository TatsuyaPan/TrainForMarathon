import { describe, expect, it } from "vitest";
import { BEGINNER_TABLE, isBeginnerVdot, lookupBeginnerRow } from "../src/beginner-table.js";
import { raceTimeFromVdot } from "../src/vdot.js";

describe("beginner table (book table 5-3, VDOT 20-30)", () => {
  it("covers VDOT 20 through 30 with 11 rows", () => {
    expect(BEGINNER_TABLE.length).toBe(11);
    expect(BEGINNER_TABLE[0].vdot).toBe(30);
    expect(BEGINNER_TABLE.at(-1)?.vdot).toBe(20);
    const vdots = BEGINNER_TABLE.map((row) => row.vdot);
    expect(new Set(vdots).size).toBe(11);
  });

  it("row 28 matches the documented values", () => {
    const row = lookupBeginnerRow(28);
    expect(row?.t1000Seconds).toBe(405); // T 1km 6:45
    expect(row?.t400Seconds).toBe(162); // T 400m 2:42
    expect(row?.r200Seconds).toBe(73); // R 200m 1:13
    expect(row?.i400Seconds).toBe(154); // I 400m 2:34
    expect(row?.mPacePerKmSeconds).toBe(447); // M 7:27/km
    expect(row?.marathonTotalSeconds).toBe(5 * 3600 + 15 * 60); // 5:15
  });

  it("missing R300 cells are undefined for low vdots", () => {
    expect(lookupBeginnerRow(20)?.r300Seconds).toBeUndefined();
    expect(lookupBeginnerRow(28)?.r300Seconds).toBe(109);
  });

  it("begins below or at vdot 30", () => {
    expect(isBeginnerVdot(30)).toBe(true);
    expect(isBeginnerVdot(20)).toBe(true);
    expect(isBeginnerVdot(31)).toBe(false);
    expect(isBeginnerVdot(50)).toBe(false);
    expect(lookupBeginnerRow(45)).toBeUndefined();
  });

  it("M pace is the marathon average pace (derived from total time)", () => {
    const row = lookupBeginnerRow(28)!;
    const averagePerKm = row.marathonTotalSeconds / 42.195;
    expect(Math.abs(averagePerKm - row.mPacePerKmSeconds)).toBeLessThan(3);
    // 反推法比固定百分比更接近表值（表含长距离经验修正）
    const derived = raceTimeFromVdot(28, 42195) / 42.195;
    expect(Math.abs(derived - row.mPacePerKmSeconds)).toBeLessThan(15);
  });
});
