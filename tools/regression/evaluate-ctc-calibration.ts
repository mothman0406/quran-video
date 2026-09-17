#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CtcCalibrationCapture } from "./ctc-calibration-capture.ts";
import { calibrationCaptureToPathFixture } from "./ctc-calibration-corpus.ts";
import { PROTECTED_NEGATIVE_CTC_FIXTURES, REAL_CTC_PATH_FIXTURES } from "./ctc-path-fixtures.ts";
import { evaluateCtcPathStatistics, statisticWouldAccept, type CtcPathFixture, type CtcPathStatisticValues } from "./ctc-path-statistics.ts";

const directory = join(process.cwd(), "tools/regression/fixtures/ctc-calibration");
const captures = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as CtcCalibrationCapture));
const capturedFixtures = captures.map(calibrationCaptureToPathFixture);
const positives = [...REAL_CTC_PATH_FIXTURES.filter((fixture) => fixture.classification === "retained-positive"), ...capturedFixtures.filter((fixture) => fixture.classification === "retained-positive")];
const observational = [...REAL_CTC_PATH_FIXTURES.filter((fixture) => fixture.classification === "observational"), ...capturedFixtures.filter((fixture) => fixture.classification === "observational")];
const realNegatives = capturedFixtures.filter((fixture) => fixture.classification === "real-negative");
const logicalNegatives = [...PROTECTED_NEGATIVE_CTC_FIXTURES];
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

const statistics = Object.fromEntries(statisticNames.map((statistic) => {
  const positivePairs = finitePairs(positives, statistic);
  const allNegativePairs = finitePairs([...realNegatives, ...logicalNegatives], statistic);
  const gateEligiblePairs = finitePairs([...realNegatives, ...logicalNegatives].filter((fixture) => fixture.otherProductionGatesPass), statistic);
  const closestPositive = positivePairs.reduce((lowest, entry) => entry.value < lowest.value ? entry : lowest);
  const closestRawNegative = allNegativePairs.reduce((highest, entry) => entry.value > highest.value ? entry : highest);
  const closestEligibleNegative = gateEligiblePairs.reduce((highest, entry) => entry.value > highest.value ? entry : highest);
  const rawMargin = Number((closestPositive.value - closestRawNegative.value).toFixed(6));
  const conditionedMargin = Number((closestPositive.value - closestEligibleNegative.value).toFixed(6));
  return [statistic, {
    positives: values(positives, statistic),
    observational: values(observational, statistic),
    realNegatives: values(realNegatives, statistic),
    logicalNegatives: Object.fromEntries(logicalNegatives.map((fixture) => [fixture.id, { value: evaluateCtcPathStatistics(fixture)[statistic], acceptedAtReferenceThresholdWithOtherGates: statisticWouldAccept(fixture, evaluateCtcPathStatistics(fixture)[statistic]) }])),
    rawSeparation: { exists: rawMargin > 0, margin: rawMargin, closestPositive, closestNegative: closestRawNegative },
    productionGateConditionedSeparation: { exists: conditionedMargin > 0, margin: conditionedMargin, thresholdMidpoint: conditionedMargin > 0 ? Number(((closestPositive.value + closestEligibleNegative.value) / 2).toFixed(6)) : null, closestPositive, closestNegative: closestEligibleNegative },
  }];
}));

const ranked = Object.entries(statistics).map(([name, result]) => ({ name, ...result.productionGateConditionedSeparation })).sort((left, right) => right.margin - left.margin);
console.log(JSON.stringify({ captures: captures.map((capture) => capture.id), statistics, bestProductionGateConditionedSeparation: ranked[0] }, null, 2));
