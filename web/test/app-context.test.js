import { beforeEach, describe, expect, it } from "vitest";
import {
  clearAthleteFitness,
  getAthlete,
  invalidateAthlete,
  saveAthleteFitness,
  service,
} from "../src/app-context.js";

describe("app-context athlete cache", () => {
  beforeEach(() => {
    window.localStorage.clear();
    invalidateAthlete();
  });

  it("keeps the cached athlete in sync after saving fitness", async () => {
    const created = await getAthlete();
    expect(created.thresholdPaceSecondsPerKm).toBeUndefined();

    const saved = await saveAthleteFitness({ mode: "sixSecond", thresholdPaceSecondsPerKm: 240 });
    expect(saved.thresholdPaceSecondsPerKm).toBe(240);

    // 关键：同一会话内不再读库也要拿到新能力，否则其他页面继续用旧配速
    expect((await getAthlete()).thresholdPaceSecondsPerKm).toBe(240);
    expect((await service.getAthleteProfile()).thresholdPaceSecondsPerKm).toBe(240);
  });

  it("stores a VDOT assessment together with its race results", async () => {
    await getAthlete();
    const saved = await saveAthleteFitness({
      mode: "vdot",
      raceResults: [{ distanceM: 10000, timeSeconds: 2400, date: "2026-08-01" }],
      isBeginner: false,
    });

    expect(saved.vdot).toBeGreaterThan(45);
    expect(saved.raceResults).toHaveLength(1);
    expect((await getAthlete()).vdot).toBe(saved.vdot);
  });

  it("clears the cached athlete when fitness is removed", async () => {
    await saveAthleteFitness({ mode: "sixSecond", thresholdPaceSecondsPerKm: 300 });

    await clearAthleteFitness();

    const athlete = await getAthlete();
    expect(athlete.thresholdPaceSecondsPerKm).toBeUndefined();
    expect(athlete.vdot).toBeUndefined();
  });
});
