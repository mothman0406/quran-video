#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CtcCalibrationCapture } from "./ctc-calibration-capture.ts";
import { calibrationCaptureToPathFixture } from "./ctc-calibration-corpus.ts";
import { PROTECTED_NEGATIVE_CTC_FIXTURES, REAL_CTC_PATH_FIXTURES } from "./ctc-path-fixtures.ts";
import { CTC_REFERENCE_THRESHOLD, evaluateCtcPathStatistics, statisticWouldAccept, type CtcPathFixture, type CtcPathStatisticValues } from "./ctc-path-statistics.ts";

const directory = join(process.cwd(), "tools/regression/fixtures/ctc-calibration");
const captures = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as CtcCalibrationCapture));
const capturedFixtures = captures.map(calibrationCaptureToPathFixture);
const captureById = new Map(captures.map((capture) => [capture.id, capture]));

function expectedMatchesFastConformer(capture: CtcCalibrationCapture) {
  const expected = capture.expected;
  const proposed = capture.fastConformerProposedRange;
  return expected.surah !== null && expected.startAyah !== null && expected.endAyah !== null
    && proposed?.surah === expected.surah && proposed.startAyah === expected.startAyah && proposed.endAyah === expected.endAyah;
}

const recognitionFailures = captures.filter((capture) => capture.expected.outcome === "positive" && !expectedMatchesFastConformer(capture));
const capturedPositives = capturedFixtures.filter((fixture) => fixture.classification === "retained-positive" && !recognitionFailures.some((capture) => capture.id === fixture.id));
const positives = [...REAL_CTC_PATH_FIXTURES.filter((fixture) => fixture.classification === "retained-positive"), ...capturedPositives];
const shortPositives = positives.filter((fixture) => fixture.scores.length < 5);
const longPositives = positives.filter((fixture) => fixture.scores.length >= 5);
const observational = [...REAL_CTC_PATH_FIXTURES.filter((fixture) => fixture.classification === "observational"), ...capturedFixtures.filter((fixture) => fixture.classification === "observational")];
const realNegatives = capturedFixtures.filter((fixture) => fixture.classification === "real-negative");
const logicalNegatives = [...PROTECTED_NEGATIVE_CTC_FIXTURES];
const allNegatives = [...realNegatives, ...logicalNegatives];
const gateEligibleNegatives = allNegatives.filter((fixture) => fixture.otherProductionGatesPass);
const statisticNames = Object.keys(evaluateCtcPathStatistics(positives[0]!)) as Array<keyof CtcPathStatisticValues>;

function values(fixtures: readonly CtcPathFixture[], statistic: keyof CtcPathStatisticValues) {
  return Object.fromEntries(fixtures.map((fixture) => [fixture.id, evaluateCtcPathStatistics(fixture)[statistic]]));
}

function finitePairs(fixtures: readonly CtcPathFixture[], statistic: keyof CtcPathStatisticValues) {
  return fixtures.flatMap((fixture) => {
    const value = evaluateCtcPathStatistics(fixture)[statistic];
    return value === null ? [] : [{ id: fixture.id, value }];
  });
}

function separation(positiveFixtures: readonly CtcPathFixture[], negativeFixtures: readonly CtcPathFixture[], statistic: keyof CtcPathStatisticValues) {
  const positivePairs = finitePairs(positiveFixtures, statistic);
  const negativePairs = finitePairs(negativeFixtures, statistic);
  const minimumPositive = positivePairs.reduce((lowest, entry) => entry.value < lowest.value ? entry : lowest);
  const maximumNegative = negativePairs.reduce((highest, entry) => entry.value > highest.value ? entry : highest);
  const margin = Number((minimumPositive.value - maximumNegative.value).toFixed(6));
  return {
    exists: margin > 0,
    margin,
    thresholdMidpoint: margin > 0 ? Number(((minimumPositive.value + maximumNegative.value) / 2).toFixed(6)) : null,
    minimumPositive,
    maximumNegative,
  };
}

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

function featureVector(fixture: CtcPathFixture) {
  const capture = captureById.get(fixture.id);
  const coherentEntries = fixture.scores.flatMap((score, index) => score !== null && Number.isFinite(score) ? [{ score, index }] : []);
  const coherent = coherentEntries.map(({ score }) => score);
  const anchorIndex = fixture.anchorActivationIndex;
  const postAnchor = coherentEntries.filter(({ index }) => anchorIndex === null || index >= anchorIndex).map(({ score }) => score);
  const fractionAbove = (threshold: number) => coherent.length ? round(coherent.filter((score) => score >= threshold).length / coherent.length) : null;
  return {
    coherentRatio: fixture.metadata.coherentRatio,
    coverage: fixture.metadata.coverage,
    agreementRatio: round(fixture.metadata.agreeingWindowCount / fixture.scores.length),
    globalMargin: Number.isFinite(fixture.metadata.margin) ? fixture.metadata.margin : null,
    lexicalUniqueness: fixture.metadata.lexicalUniqueness,
    longestUnsupportedRun: fixture.metadata.longestUnsupportedRun,
    anchorActivationIndex: anchorIndex,
    postAnchorAdvances: capture ? capture.windows.filter((window) => window.anchorEvent === "anchor-advanced" && (anchorIndex === null || window.index >= anchorIndex)).length : null,
    fractionAboveNegative060: fractionAbove(-0.60),
    fractionAboveNegative080: fractionAbove(-0.80),
    fractionAboveNegative100: fractionAbove(-1.00),
    medianCtc: quantile(coherent, 0.5),
    bestCtc: coherent.length ? round(Math.max(...coherent)) : null,
    worstCtc: coherent.length ? round(Math.min(...coherent)) : null,
    postAnchorMedian: quantile(postAnchor, 0.5),
    postAnchorSupportRatio: postAnchor.length ? round(postAnchor.filter((score) => score >= CTC_REFERENCE_THRESHOLD).length / postAnchor.length) : null,
  };
}

type FeatureVector = ReturnType<typeof featureVector>;

function featureDistribution(fixtures: readonly CtcPathFixture[]) {
  const vectors = Object.fromEntries(fixtures.map((fixture) => [fixture.id, featureVector(fixture)]));
  const fields = Object.keys(featureVector(fixtures[0]!)) as Array<keyof FeatureVector>;
  const ranges = Object.fromEntries(fields.map((field) => {
    const entries = fixtures.flatMap((fixture) => {
      const value = vectors[fixture.id]![field];
      return typeof value === "number" && Number.isFinite(value) ? [{ id: fixture.id, value }] : [];
    });
    return [field, entries.length ? {
      minimum: entries.reduce((lowest, entry) => entry.value < lowest.value ? entry : lowest),
      median: quantile(entries.map((entry) => entry.value), 0.5),
      maximum: entries.reduce((highest, entry) => entry.value > highest.value ? entry : highest),
    } : null];
  }));
  return { vectors, ranges };
}

const statistics = Object.fromEntries(statisticNames.map((statistic) => [statistic, {
  positives: values(positives, statistic),
  longPositives: values(longPositives, statistic),
  observational: values(observational, statistic),
  realNegatives: values(realNegatives, statistic),
  logicalNegatives: Object.fromEntries(logicalNegatives.map((fixture) => [fixture.id, { value: evaluateCtcPathStatistics(fixture)[statistic], acceptedAtReferenceThresholdWithOtherGates: statisticWouldAccept(fixture, evaluateCtcPathStatistics(fixture)[statistic]) }])),
  rawSeparation: separation(positives, allNegatives, statistic),
  productionGateConditionedSeparation: separation(positives, gateEligibleNegatives, statistic),
  longPositiveRawSeparation: separation(longPositives, allNegatives, statistic),
  longPositiveGateConditionedSeparation: separation(longPositives, gateEligibleNegatives, statistic),
}]));

const rankedRaw = Object.entries(statistics).map(([name, result]) => ({ name, ...result.longPositiveRawSeparation })).sort((left, right) => right.margin - left.margin);
const rankedConditioned = Object.entries(statistics).map(([name, result]) => ({ name, ...result.longPositiveGateConditionedSeparation })).sort((left, right) => right.margin - left.margin);
const reciterGroups = new Set(longPositives.map((fixture) => fixture.id.startsWith("positive-alafasy-") ? "alafasy" : fixture.id.startsWith("positive-hani-") || fixture.id === "surah-6-74-77" ? "hani-rifai" : fixture.id === "surah-2-258-259" ? "unattributed-surah-2-source" : fixture.id));

console.log(JSON.stringify({
  captures: captures.map((capture) => capture.id),
  corpus: {
    shortPositiveIds: shortPositives.map((fixture) => fixture.id),
    longPositiveIds: longPositives.map((fixture) => fixture.id),
    recognitionFailureCandidateIds: recognitionFailures.map((capture) => capture.id),
    longPositiveReciterGroups: [...reciterGroups],
  },
  statistics,
  bestLongPositiveRawSeparation: rankedRaw[0],
  bestLongPositiveGateConditionedSeparation: rankedConditioned[0],
  featureDistributions: {
    correctLongPositives: featureDistribution(longPositives),
    realNegatives: featureDistribution(realNegatives),
  },
}, null, 2));
