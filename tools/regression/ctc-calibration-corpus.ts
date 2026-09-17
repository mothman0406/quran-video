import type { CtcCalibrationCapture } from "./ctc-calibration-capture.ts";
import type { CtcPathFixture } from "./ctc-path-statistics.ts";

const ctcOnlyRules = new Set(["best-window-ctc", "coherent-path-ctc"]);

export function calibrationCaptureToPathFixture(capture: CtcCalibrationCapture): CtcPathFixture {
  const activation = capture.windows.find((window) => window.anchorEvent === "anchor-activated")?.index ?? null;
  return {
    id: capture.id,
    intent: capture.expected.intent,
    classification: capture.expected.outcome === "positive" ? "retained-positive" : capture.expected.outcome === "observational" ? "observational" : "real-negative",
    scores: capture.windows.map((window) => window.coherentPathCtc),
    anchorActivationIndex: activation,
    voicedDurationWeights: capture.windows.map((window) => window.voicedMs),
    targetCoverageWeights: capture.windows.map((window) => window.targetCoverage ?? 0),
    otherProductionGatesPass: capture.failedAcceptanceRules.every((rule) => ctcOnlyRules.has(rule)),
    protection: capture.failedAcceptanceRules.filter((rule) => !ctcOnlyRules.has(rule)).join(", ") || undefined,
    metadata: {
      coverage: capture.coverage,
      coherentRatio: capture.coherentRatio,
      agreeingWindowCount: capture.agreeingWindowCount,
      longestUnsupportedRun: capture.longestUnsupportedRun,
      margin: capture.margin ?? Number.NEGATIVE_INFINITY,
      lexicalUniqueness: capture.lexicalUniqueness,
      structuralValidity: capture.structuralValidity,
      surahConsistency: capture.surahConsistency,
    },
  };
}
