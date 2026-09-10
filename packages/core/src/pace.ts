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

/**
 * 完整训练档位：在 6 秒规则（T/I/R）基础上补充 E/M 估算区间。
 * - M：约低于阈值 15 秒/公里（书 §1：M 可使用低于乳酸阈 15 秒的配速）
 * - E：约低于阈值 40 秒/公里（《轻松跑》：低于乳酸阈配速 40s 左右，或按心率）
 * E/M 为估算值，UI 需标注来源与"建议按心率"提示。
 */
export interface TrainingPaces {
  E: PaceRange;
  M: PaceRange;
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

/** 完整档位：T/I/R 精确（6 秒规则），E/M 估算（书 §1 与《轻松跑》） */
export function calculateTrainingPaces(thresholdSecondsPerKm: number): TrainingPaces {
  const six = calculateSixSecondPaces(thresholdSecondsPerKm);
  return {
    ...six,
    E: { fast: thresholdSecondsPerKm - 50, slow: thresholdSecondsPerKm - 30 },
    M: { fast: thresholdSecondsPerKm - 20, slow: thresholdSecondsPerKm - 10 },
  };
}

export function formatPace(secondsPerKm: number): string {
  const seconds = Math.round(secondsPerKm);
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = String(seconds % 60).padStart(2, "0");
  return `${minutesPart}:${secondsPart}/km`;
}
