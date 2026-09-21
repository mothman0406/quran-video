import type { CtcCalibrationCapture } from "./ctc-calibration-capture.ts";
import { calibrationCaptureToPathFixture } from "./ctc-calibration-corpus.ts";
import { PROTECTED_NEGATIVE_CTC_FIXTURES, REAL_CTC_PATH_FIXTURES } from "./ctc-path-fixtures.ts";
import { evaluateCtcPathStatistics, type CtcPathFixture } from "./ctc-path-statistics.ts";

export type CalibrationClass =
  | "known-positive"
  | "short-positive"
  | "real-negative"
  | "logical-negative"
  | "observational"
  | "recognition-failure-known-ground-truth";

export type NormalizedLongPathFeature = {
  id: string;
  classification: CalibrationClass;
  intent: string;
  totalGeneratedWindows: number;
  usableWindows: number | null;
  coherentCandidateCount: number;
  agreeingWindows: number;
  agreementRatio: number;
  coherentRatio: number;
  coverage: number;
  longestUnsupportedRun: number;
  structuralValidity: boolean;
  surahConsistency: boolean;
  contradictionState: string | null;
  globalViterbiMargin: number | null;
  lexicalUniqueness: number | null;
  bestCoherentCtc: number | null;
  arithmeticMeanCtc: number | null;
  medianCtc: number | null;
  percentile75Ctc: number | null;
  strongestThreeMeanCtc: number | null;
  strongestHalfMeanCtc: number | null;
  worstCtc: number | null;
  fractionAtLeastNegative060: number | null;
  fractionAtLeastNegative080: number | null;
  fractionAtLeastNegative100: number | null;
  anchorActivated: boolean;
  anchorActivationIndex: number | null;
  anchorActivationFraction: number | null;
  coherentCandidatesAfterAnchor: number;
  postAnchorAdvanceCount: number | null;
  postAnchorAdvanceRatio: number | null;
  postAnchorMedianCtc: number | null;
  postAnchorFractionAtLeastNegative060: number | null;
  postAnchorFractionAtLeastNegative080: number | null;
  postAnchorFractionAtLeastNegative100: number | null;
  fixedSafetyGatesPass: boolean;
  failedSafetyGates: readonly string[];
  fastConformerProposedRange: { surah: number; startAyah: number; endAyah: number } | null;
  fastConformerOutcome: "accepted" | "abstained" | null;
  finalProposedRange: { surah: number; startAyah: number; endAyah: number } | null;
  finalOutcome: "accepted" | "abstained" | null;
  finalAuthority: string | null;
};

export type StagedRuleThresholds = {
  minimumGeneratedWindows: number;
  minimumMargin: number;
  minimumBestCtc: number;
  minimumFractionAtLeastNegative060: number;
};

export const RECOMMENDED_OFFLINE_THRESHOLDS: StagedRuleThresholds = {
  minimumGeneratedWindows: 5,
  minimumMargin: 8,
  minimumBestCtc: -0.60,
  minimumFractionAtLeastNegative060: 0.25,
};

function round(value: number) {
  return Number(value.toFixed(6));
}

function quantile(values: readonly number[], proportion: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const position = (sorted.length - 1) * proportion;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return round(sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction);
}

function mean(values: readonly number[]) {
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
}

function fractionAtLeast(values: readonly number[], threshold: number) {
  return values.length ? round(values.filter((value) => value >= threshold).length / values.length) : null;
}

function expectedMatchesFastConformer(capture: CtcCalibrationCapture) {
  const expected = capture.expected;
  const proposed = capture.fastConformerProposedRange;
  return expected.surah !== null && expected.startAyah !== null && expected.endAyah !== null
    && proposed?.surah === expected.surah && proposed.startAyah === expected.startAyah && proposed.endAyah === expected.endAyah;
}

function classificationFor(fixture: CtcPathFixture, capture: CtcCalibrationCapture | undefined): CalibrationClass {
  if (fixture.classification === "observational") return "observational";
  if (fixture.classification === "real-negative") return "real-negative";
  if (fixture.classification === "protected-negative") return "logical-negative";
  if (capture && capture.expected.outcome === "positive" && !expectedMatchesFastConformer(capture)) return "recognition-failure-known-ground-truth";
  return fixture.scores.length >= 5 ? "known-positive" : "short-positive";
}

function normalizeFixture(fixture: CtcPathFixture, capture?: CtcCalibrationCapture): NormalizedLongPathFeature {
  const classification = classificationFor(fixture, capture);
  const totalGeneratedWindows = capture?.totalGeneratedWindows ?? fixture.scores.length;
  const entries = fixture.scores.flatMap((score, index) => typeof score === "number" && Number.isFinite(score) ? [{ score, index }] : []);
  const scores = entries.map(({ score }) => score);
  const statistics = evaluateCtcPathStatistics(fixture);
  const anchorActivationIndex = fixture.anchorActivationIndex;
  const postAnchorEntries = anchorActivationIndex === null ? [] : entries.filter(({ index }) => index >= anchorActivationIndex);
  const postAnchorScores = postAnchorEntries.map(({ score }) => score);
  const advances = capture && anchorActivationIndex !== null
    ? capture.windows.filter((window) => window.index > anchorActivationIndex && window.anchorEvent === "anchor-advanced").length
    : null;
  const postActivationWindowCount = anchorActivationIndex === null ? 0 : Math.max(0, totalGeneratedWindows - anchorActivationIndex - 1);
  const nonFiniteEvidence = fixture.scores.some((score) => score !== null && !Number.isFinite(score));
  const failedSafetyGates = capture
    ? capture.failedAcceptanceRules.filter((rule) => rule !== "best-window-ctc" && rule !== "coherent-path-ctc")
    : fixture.otherProductionGatesPass ? [] : [fixture.protection ?? "retained structural protection"];
  return {
    id: fixture.id,
    classification,
    intent: fixture.intent,
    totalGeneratedWindows,
    usableWindows: capture?.usableWindows ?? null,
    coherentCandidateCount: entries.length,
    agreeingWindows: fixture.metadata.agreeingWindowCount,
    agreementRatio: totalGeneratedWindows ? round(fixture.metadata.agreeingWindowCount / totalGeneratedWindows) : 0,
    coherentRatio: fixture.metadata.coherentRatio,
    coverage: fixture.metadata.coverage,
    longestUnsupportedRun: fixture.metadata.longestUnsupportedRun,
    structuralValidity: fixture.metadata.structuralValidity,
    surahConsistency: fixture.metadata.surahConsistency,
    contradictionState: null,
    globalViterbiMargin: Number.isFinite(fixture.metadata.margin) ? fixture.metadata.margin : null,
    lexicalUniqueness: fixture.metadata.lexicalUniqueness,
    bestCoherentCtc: scores.length ? round(Math.max(...scores)) : null,
    arithmeticMeanCtc: statistics.arithmeticMean,
    medianCtc: statistics.median,
    percentile75Ctc: statistics.upperQuartile,
    strongestThreeMeanCtc: statistics.top3Mean,
    strongestHalfMeanCtc: statistics.upperHalfMean,
    worstCtc: scores.length ? round(Math.min(...scores)) : null,
    fractionAtLeastNegative060: fractionAtLeast(scores, -0.60),
    fractionAtLeastNegative080: fractionAtLeast(scores, -0.80),
    fractionAtLeastNegative100: fractionAtLeast(scores, -1.00),
    anchorActivated: anchorActivationIndex !== null,
    anchorActivationIndex,
    anchorActivationFraction: anchorActivationIndex === null || totalGeneratedWindows === 0 ? null : round((anchorActivationIndex + 1) / totalGeneratedWindows),
    coherentCandidatesAfterAnchor: postAnchorEntries.length,
    postAnchorAdvanceCount: advances,
    postAnchorAdvanceRatio: advances === null || postActivationWindowCount === 0 ? null : round(advances / postActivationWindowCount),
    postAnchorMedianCtc: quantile(postAnchorScores, 0.5),
    postAnchorFractionAtLeastNegative060: fractionAtLeast(postAnchorScores, -0.60),
    postAnchorFractionAtLeastNegative080: fractionAtLeast(postAnchorScores, -0.80),
    postAnchorFractionAtLeastNegative100: fractionAtLeast(postAnchorScores, -1.00),
    fixedSafetyGatesPass: fixture.otherProductionGatesPass && !nonFiniteEvidence && fixture.metadata.structuralValidity && fixture.metadata.surahConsistency,
    failedSafetyGates,
    fastConformerProposedRange: capture?.fastConformerProposedRange ?? null,
    fastConformerOutcome: capture?.fastConformerOutcome ?? null,
    finalProposedRange: capture?.finalProposedRange ?? null,
    finalOutcome: capture?.finalOutcome ?? null,
    finalAuthority: capture?.finalAuthority ?? null,
  };
}

export function buildNormalizedLongPathCorpus(captures: readonly CtcCalibrationCapture[]) {
  const captureById = new Map(captures.map((capture) => [capture.id, capture]));
  const capturedFixtures = captures.map(calibrationCaptureToPathFixture);
  const fixtures = [...REAL_CTC_PATH_FIXTURES, ...capturedFixtures, ...PROTECTED_NEGATIVE_CTC_FIXTURES];
  return fixtures.map((fixture) => normalizeFixture(fixture, captureById.get(fixture.id)));
}

export function evaluateStagedLongPathRule(feature: NormalizedLongPathFeature, thresholds: StagedRuleThresholds = RECOMMENDED_OFFLINE_THRESHOLDS) {
  const conditions = {
    fixedSafetyGates: feature.fixedSafetyGatesPass,
    longRecording: feature.totalGeneratedWindows >= thresholds.minimumGeneratedWindows,
    margin: feature.globalViterbiMargin !== null && feature.globalViterbiMargin >= thresholds.minimumMargin,
    bestCtc: feature.bestCoherentCtc !== null && feature.bestCoherentCtc >= thresholds.minimumBestCtc,
    robustCtcFraction: feature.fractionAtLeastNegative060 !== null && feature.fractionAtLeastNegative060 >= thresholds.minimumFractionAtLeastNegative060,
  };
  return {
    accepted: Object.values(conditions).every(Boolean),
    conditions,
    distances: {
      generatedWindows: feature.totalGeneratedWindows - thresholds.minimumGeneratedWindows,
      margin: feature.globalViterbiMargin === null ? null : round(feature.globalViterbiMargin - thresholds.minimumMargin),
      bestCtc: feature.bestCoherentCtc === null ? null : round(feature.bestCoherentCtc - thresholds.minimumBestCtc),
      robustCtcFraction: feature.fractionAtLeastNegative060 === null ? null : round(feature.fractionAtLeastNegative060 - thresholds.minimumFractionAtLeastNegative060),
    },
  };
}

/**
 * Deterministic coarse calibration used in every holdout fold. The acoustic
 * floor is the existing reference value. Margin receives a full integer point
 * above the next integer containing the strongest retained negative, and the
 * fraction is rounded down to a coarse quarter step from held-in positives.
 */
export function calibrateStagedThresholds(trainingPositives: readonly NormalizedLongPathFeature[], trainingNegatives: readonly NormalizedLongPathFeature[]): StagedRuleThresholds {
  const negativeMargins = trainingNegatives.flatMap((feature) => feature.globalViterbiMargin === null ? [] : [feature.globalViterbiMargin]);
  const positiveFractions = trainingPositives.flatMap((feature) => feature.fractionAtLeastNegative060 === null ? [] : [feature.fractionAtLeastNegative060]);
  const maximumNegativeMargin = Math.max(...negativeMargins);
  const minimumPositiveFraction = Math.min(...positiveFractions);
  return {
    minimumGeneratedWindows: 5,
    minimumMargin: Math.ceil(maximumNegativeMargin) + 1,
    minimumBestCtc: -0.60,
    minimumFractionAtLeastNegative060: Math.max(0.25, Math.floor(minimumPositiveFraction * 4) / 4),
  };
}

export function numericDistribution(features: readonly NormalizedLongPathFeature[], field: keyof NormalizedLongPathFeature) {
  const values = features.flatMap((feature) => {
    const value = feature[field];
    return typeof value === "number" && Number.isFinite(value) ? [value] : [];
  });
  return values.length ? { minimum: Math.min(...values), median: quantile(values, 0.5), maximum: Math.max(...values), mean: mean(values) } : null;
}
