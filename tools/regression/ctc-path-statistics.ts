export const CTC_REFERENCE_THRESHOLD = -0.60;

export type CtcPathFixture = {
  id: string;
  intent: string;
  classification: "retained-positive" | "observational" | "real-negative" | "protected-negative";
  scores: readonly (number | null)[];
  anchorActivationIndex: number | null;
  voicedDurationWeights: readonly number[];
  targetCoverageWeights: readonly number[];
  otherProductionGatesPass: boolean;
  protection?: string;
  metadata: {
    coverage: number;
    coherentRatio: number;
    agreeingWindowCount: number;
    longestUnsupportedRun: number;
    margin: number;
    lexicalUniqueness: number | null;
    structuralValidity: boolean;
    surahConsistency: boolean;
  };
};

export type CtcPathStatisticValues = {
  arithmeticMean: number | null;
  voicedDurationWeightedMean: number | null;
  targetCoverageWeightedMean: number | null;
  median: number | null;
  trimmedMean10Percent: number | null;
  winsorizedMean10Percent: number | null;
  upperQuartile: number | null;
  top3Mean: number | null;
  anchorAwareMean: number | null;
  postAnchorMean: number | null;
  bestPlusSupport: number | null;
  upperHalfMean: number | null;
};

function round(value: number) {
  return Number(value.toFixed(6));
}

function finiteEntries(fixture: CtcPathFixture) {
  const entries = fixture.scores.flatMap((score, index) => score === null ? [] : [{ score, index }]);
  return entries.every(({ score }) => Number.isFinite(score)) ? entries : [];
}

function mean(values: readonly number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function weightedMean(entries: readonly { score: number; index: number }[], weights: readonly number[]) {
  const denominator = entries.reduce((sum, entry) => sum + (weights[entry.index] ?? 0), 0);
  if (denominator <= 0) return null;
  return entries.reduce((sum, entry) => sum + entry.score * (weights[entry.index] ?? 0), 0) / denominator;
}

function quantile(sorted: readonly number[], proportion: number) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * proportion;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower]! * (1 - fraction) + sorted[upper]! * fraction;
}

function rounded(value: number | null) {
  return value === null ? null : round(value);
}

/**
 * Diagnostic-only alternatives to the production arithmetic mean. Uniform
 * weights are retained where the privacy-safe report did not include the
 * original per-window voiced duration or target coverage.
 */
export function evaluateCtcPathStatistics(fixture: CtcPathFixture): CtcPathStatisticValues {
  const entries = finiteEntries(fixture);
  if (!entries.length) {
    return { arithmeticMean: null, voicedDurationWeightedMean: null, targetCoverageWeightedMean: null, median: null, trimmedMean10Percent: null, winsorizedMean10Percent: null, upperQuartile: null, top3Mean: null, anchorAwareMean: null, postAnchorMean: null, bestPlusSupport: null, upperHalfMean: null };
  }
  const scores = entries.map(({ score }) => score);
  const sorted = [...scores].sort((left, right) => left - right);
  const trimCount = Math.floor(sorted.length * 0.10);
  const trimmed = trimCount ? sorted.slice(trimCount, sorted.length - trimCount) : sorted;
  const winsorized = trimCount
    ? sorted.map((value, index) => index < trimCount ? sorted[trimCount]! : index >= sorted.length - trimCount ? sorted[sorted.length - trimCount - 1]! : value)
    : sorted;
  const strongestFirst = [...sorted].reverse();
  const anchorIndex = fixture.anchorActivationIndex ?? 0;
  const anchorWeights = fixture.scores.map((_, index) => index < anchorIndex ? 0.25 : 1);
  const postAnchor = entries.filter(({ index }) => index >= anchorIndex).map(({ score }) => score);
  const supportRatio = scores.filter((score) => score >= CTC_REFERENCE_THRESHOLD).length / scores.length;
  return {
    arithmeticMean: rounded(mean(scores)),
    voicedDurationWeightedMean: rounded(weightedMean(entries, fixture.voicedDurationWeights)),
    targetCoverageWeightedMean: rounded(weightedMean(entries, fixture.targetCoverageWeights)),
    median: rounded(quantile(sorted, 0.5)),
    trimmedMean10Percent: rounded(mean(trimmed)),
    winsorizedMean10Percent: rounded(mean(winsorized)),
    upperQuartile: rounded(quantile(sorted, 0.75)),
    top3Mean: rounded(mean(strongestFirst.slice(0, Math.min(3, strongestFirst.length)))),
    anchorAwareMean: rounded(weightedMean(entries, anchorWeights)),
    postAnchorMean: rounded(mean(postAnchor)),
    bestPlusSupport: rounded(strongestFirst[0]! - 0.5 * (1 - supportRatio)),
    upperHalfMean: rounded(mean(strongestFirst.slice(0, Math.ceil(strongestFirst.length / 2)))),
  };
}

export function statisticWouldAccept(fixture: CtcPathFixture, value: number | null) {
  return fixture.otherProductionGatesPass && value !== null && value >= CTC_REFERENCE_THRESHOLD;
}
