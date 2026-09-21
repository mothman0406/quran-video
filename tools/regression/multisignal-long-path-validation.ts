import type { NormalizedLongPathFeature } from "./multisignal-long-path.ts";

/**
 * Prospective external-validation rule frozen before validation media inventory.
 * These values are constants, not outputs derived from validation fixtures.
 */
export const FROZEN_EXTERNAL_VALIDATION_THRESHOLDS = Object.freeze({
  minimumGeneratedWindows: 5,
  minimumMargin: 8,
  minimumBestCtc: -0.60,
  minimumFractionAtLeastNegative060: 0.25,
} as const);

function round(value: number) {
  return Number(value.toFixed(6));
}

export function evaluateFrozenExternalValidationRule(feature: NormalizedLongPathFeature) {
  const thresholds = FROZEN_EXTERNAL_VALIDATION_THRESHOLDS;
  const conditions = {
    existingSafetyGatesPass: feature.fixedSafetyGatesPass,
    generatedWindows: feature.totalGeneratedWindows >= thresholds.minimumGeneratedWindows,
    globalMargin: feature.globalViterbiMargin !== null && feature.globalViterbiMargin >= thresholds.minimumMargin,
    bestCoherentPathCtc: feature.bestCoherentCtc !== null && feature.bestCoherentCtc >= thresholds.minimumBestCtc,
    fractionCoherentCtcAboveMinus060: feature.fractionAtLeastNegative060 !== null
      && feature.fractionAtLeastNegative060 >= thresholds.minimumFractionAtLeastNegative060,
  };
  return {
    accepted: Object.values(conditions).every(Boolean),
    conditions,
    distances: {
      generatedWindows: feature.totalGeneratedWindows - thresholds.minimumGeneratedWindows,
      globalMargin: feature.globalViterbiMargin === null ? null : round(feature.globalViterbiMargin - thresholds.minimumMargin),
      bestCoherentPathCtc: feature.bestCoherentCtc === null ? null : round(feature.bestCoherentCtc - thresholds.minimumBestCtc),
      fractionCoherentCtcAboveMinus060: feature.fractionAtLeastNegative060 === null
        ? null
        : round(feature.fractionAtLeastNegative060 - thresholds.minimumFractionAtLeastNegative060),
    },
  };
}
