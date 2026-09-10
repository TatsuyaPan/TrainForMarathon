export interface PaceRange {
  fast: number;
  slow: number;
}

export interface PaceProfile {
  E: null;
  M: null;
  T: PaceRange;
  I: PaceRange;
  R: PaceRange;
}

export function calculateSixSecondPaces(thresholdSecondsPerKm: number): PaceProfile {
  if (!Number.isFinite(thresholdSecondsPerKm)) {
    throw new Error("threshold pace must be finite");
  }
  if (thresholdSecondsPerKm <= 0) {
    throw new Error("threshold pace must be positive");
  }
  if (thresholdSecondsPerKm <= 45) {
    throw new Error("threshold pace must be greater than 45 seconds per kilometre");
  }
  return {
    E: null,
    M: null,
    T: { fast: thresholdSecondsPerKm - 15, slow: thresholdSecondsPerKm },
    I: { fast: thresholdSecondsPerKm - 30, slow: thresholdSecondsPerKm - 15 },
    R: { fast: thresholdSecondsPerKm - 45, slow: thresholdSecondsPerKm - 30 },
  };
}

export function formatPace(secondsPerKm: number): string {
  const seconds = Math.round(secondsPerKm);
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = String(seconds % 60).padStart(2, "0");
  return `${minutesPart}:${secondsPart}/km`;
}
