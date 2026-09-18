#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CtcCalibrationCapture } from "./ctc-calibration-capture.ts";
import {
  RECOMMENDED_OFFLINE_THRESHOLDS,
  buildNormalizedLongPathCorpus,
  calibrateStagedThresholds,
  evaluateStagedLongPathRule,
  numericDistribution,
  type NormalizedLongPathFeature,
  type StagedRuleThresholds,
} from "./multisignal-long-path.ts";

const directory = join(process.cwd(), "tools/regression/fixtures/ctc-calibration");
const captures = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort().map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as CtcCalibrationCapture));
const features = buildNormalizedLongPathCorpus(captures);
const longPositives = features.filter((feature) => feature.classification === "known-positive");
const realNegatives = features.filter((feature) => feature.classification === "real-negative");
const logicalNegatives = features.filter((feature) => feature.classification === "logical-negative");
const allNegatives = [...realNegatives, ...logicalNegatives];

function round(value: number) {
  return Number(value.toFixed(6));
}

function simpleEvaluation(thresholds: StagedRuleThresholds, corpus = features) {
  const results = corpus.map((feature) => ({ id: feature.id, classification: feature.classification, ...evaluateStagedLongPathRule(feature, thresholds) }));
  return {
    thresholds,
    falseNegatives: results.filter((result) => result.classification === "known-positive" && !result.accepted).map((result) => result.id),
    falsePositives: results.filter((result) => (result.classification === "real-negative" || result.classification === "logical-negative") && result.accepted).map((result) => result.id),
    results,
  };
}

type FamilyConfiguration = {
  id: string;
  accepts: (feature: NormalizedLongPathFeature) => boolean;
};

function base(feature: NormalizedLongPathFeature) {
  return feature.fixedSafetyGatesPass && feature.totalGeneratedWindows >= 5;
}

function atLeast(value: number | null, threshold: number) {
  return value !== null && value >= threshold;
}

const marginThresholds = [7, 8, 9, 10];
const medianThresholds = [-1.5, -1.25, -1, -0.75, -0.5];
const percentileThresholds = [-0.7, -0.6, -0.5, -0.4];
const fraction060Thresholds = [0.2, 0.25, 0.3, 0.4, 0.5];
const fraction080Thresholds = [0.4, 0.5, 0.6, 0.7];
const fraction100Thresholds = [0.4, 0.5, 0.6, 0.7];
const supportThresholds = [0.8, 0.9, 0.95];
const coherentThresholds = [0.8, 0.9, 0.95];
const agreementThresholds = [0.8, 0.9, 0.95];
const bestThresholds = [-0.7, -0.6, -0.5, -0.4];
const gapThresholds = [0, 1, 2];

function evaluateFamily(id: string, shape: string, thresholdRanges: Record<string, readonly number[]>, configurations: readonly FamilyConfiguration[]) {
  const results = configurations.map((configuration) => {
    const falseNegatives = longPositives.filter((feature) => !configuration.accepts(feature)).map((feature) => feature.id);
    const falsePositives = allNegatives.filter((feature) => configuration.accepts(feature)).map((feature) => feature.id);
    return { id: configuration.id, falseNegatives, falsePositives };
  });
  return {
    id,
    shape,
    thresholdRanges,
    configurationsEvaluated: configurations.length,
    perfectConfigurations: results.filter((result) => !result.falseNegatives.length && !result.falsePositives.length).map((result) => result.id),
    bestNearMiss: results.sort((left, right) => left.falseNegatives.length + left.falsePositives.length - right.falseNegatives.length - right.falsePositives.length)[0],
  };
}

const familyA: FamilyConfiguration[] = [];
for (const margin of marginThresholds) {
  for (const threshold of medianThresholds) familyA.push({ id: `median>=${threshold}&margin>=${margin}`, accepts: (f) => base(f) && atLeast(f.medianCtc, threshold) && atLeast(f.globalViterbiMargin, margin) });
  for (const threshold of percentileThresholds) {
    familyA.push({ id: `p75>=${threshold}&margin>=${margin}`, accepts: (f) => base(f) && atLeast(f.percentile75Ctc, threshold) && atLeast(f.globalViterbiMargin, margin) });
    familyA.push({ id: `top3>=${threshold}&margin>=${margin}`, accepts: (f) => base(f) && atLeast(f.strongestThreeMeanCtc, threshold) && atLeast(f.globalViterbiMargin, margin) });
    familyA.push({ id: `upperHalf>=${threshold}&margin>=${margin}`, accepts: (f) => base(f) && atLeast(f.strongestHalfMeanCtc, threshold) && atLeast(f.globalViterbiMargin, margin) });
  }
  for (const threshold of fraction060Thresholds) familyA.push({ id: `fraction060>=${threshold}&margin>=${margin}`, accepts: (f) => base(f) && atLeast(f.fractionAtLeastNegative060, threshold) && atLeast(f.globalViterbiMargin, margin) });
  for (const threshold of fraction080Thresholds) familyA.push({ id: `fraction080>=${threshold}&margin>=${margin}`, accepts: (f) => base(f) && atLeast(f.fractionAtLeastNegative080, threshold) && atLeast(f.globalViterbiMargin, margin) });
  for (const threshold of fraction100Thresholds) familyA.push({ id: `fraction100>=${threshold}&margin>=${margin}`, accepts: (f) => base(f) && atLeast(f.fractionAtLeastNegative100, threshold) && atLeast(f.globalViterbiMargin, margin) });
}

const familyB = percentileThresholds.flatMap((robust) => supportThresholds.flatMap((coverage) => coherentThresholds.map((coherent) => ({
  id: `upperHalf>=${robust}&coverage>=${coverage}&coherent>=${coherent}`,
  accepts: (f: NormalizedLongPathFeature) => base(f) && atLeast(f.strongestHalfMeanCtc, robust) && f.coverage >= coverage && f.coherentRatio >= coherent,
}))));

const familyC = marginThresholds.flatMap((margin) => fraction060Thresholds.map((fraction) => ({
  id: `margin>=${margin}&coverage>=.9&coherent>=.9&best>=-.6&fraction060>=${fraction}`,
  accepts: (f: NormalizedLongPathFeature) => base(f) && atLeast(f.globalViterbiMargin, margin) && f.coverage >= 0.9 && f.coherentRatio >= 0.9 && atLeast(f.bestCoherentCtc, -0.6) && atLeast(f.fractionAtLeastNegative060, fraction),
})));

const familyD = agreementThresholds.flatMap((agreement) => gapThresholds.flatMap((gap) => marginThresholds.map((margin) => ({
  id: `agreement>=${agreement}&gap<=${gap}&margin>=${margin}&fraction060>=.25`,
  accepts: (f: NormalizedLongPathFeature) => base(f) && f.agreementRatio >= agreement && f.longestUnsupportedRun <= gap && atLeast(f.globalViterbiMargin, margin) && atLeast(f.fractionAtLeastNegative060, 0.25),
}))));

const fractionConfigurations: FamilyConfiguration[] = [];
for (const threshold of fraction060Thresholds) fractionConfigurations.push({ id: `fraction060>=${threshold}&coverage>=.9&margin>=8`, accepts: (f) => base(f) && atLeast(f.fractionAtLeastNegative060, threshold) && f.coverage >= 0.9 && atLeast(f.globalViterbiMargin, 8) });
for (const threshold of fraction080Thresholds) fractionConfigurations.push({ id: `fraction080>=${threshold}&coverage>=.9&margin>=8`, accepts: (f) => base(f) && atLeast(f.fractionAtLeastNegative080, threshold) && f.coverage >= 0.9 && atLeast(f.globalViterbiMargin, 8) });
for (const threshold of fraction100Thresholds) fractionConfigurations.push({ id: `fraction100>=${threshold}&coverage>=.9&margin>=8`, accepts: (f) => base(f) && atLeast(f.fractionAtLeastNegative100, threshold) && f.coverage >= 0.9 && atLeast(f.globalViterbiMargin, 8) });

const familyF: FamilyConfiguration[] = [0.25, 0.5, 0.75].flatMap((activationFraction) => [0.5, 0.75, 1].map((advanceRatio) => ({
  id: `anchor<=${activationFraction}&advanceRatio>=${advanceRatio}&postFraction060>=.25`,
  accepts: (f: NormalizedLongPathFeature) => base(f) && f.anchorActivated && f.anchorActivationFraction !== null && f.anchorActivationFraction <= activationFraction && atLeast(f.postAnchorAdvanceRatio, advanceRatio) && atLeast(f.postAnchorFractionAtLeastNegative060, 0.25),
})));

const familyG = marginThresholds.flatMap((margin) => bestThresholds.flatMap((best) => fraction060Thresholds.map((fraction) => ({
  id: `fixed&long&margin>=${margin}&best>=${best}&fraction060>=${fraction}`,
  accepts: (f: NormalizedLongPathFeature) => base(f) && atLeast(f.globalViterbiMargin, margin) && atLeast(f.bestCoherentCtc, best) && atLeast(f.fractionAtLeastNegative060, fraction),
}))));

const families = [
  evaluateFamily("A", "robust CTC AND margin", { margin: marginThresholds, median: medianThresholds, upperTail: percentileThresholds, fraction060: fraction060Thresholds, fraction080: fraction080Thresholds, fraction100: fraction100Thresholds }, familyA),
  evaluateFamily("B", "strongest-half CTC AND coverage AND coherent ratio", { strongestHalf: percentileThresholds, coverage: supportThresholds, coherentRatio: coherentThresholds }, familyB),
  evaluateFamily("C", "margin AND support AND best-window floor AND robust fraction", { margin: marginThresholds, coverage: [0.9], coherentRatio: [0.9], bestCtc: [-0.6], fraction060: fraction060Thresholds }, familyC),
  evaluateFamily("D", "agreement AND unsupported-gap limit AND margin AND robust fraction", { agreementRatio: agreementThresholds, maximumGap: gapThresholds, margin: marginThresholds, fraction060: [0.25] }, familyD),
  evaluateFamily("E", "fractional acoustic support AND coverage AND margin", { fraction060: fraction060Thresholds, fraction080: fraction080Thresholds, fraction100: fraction100Thresholds, coverage: [0.9], margin: [8] }, fractionConfigurations),
  evaluateFamily("F", "anchor activation AND progression AND post-anchor acoustic support", { maximumAnchorActivationFraction: [0.25, 0.5, 0.75], minimumAdvanceRatio: [0.5, 0.75, 1], postAnchorFraction060: [0.25] }, familyF),
  evaluateFamily("G", "fixed gates AND long recording AND margin AND best-window floor AND robust fraction", { margin: marginThresholds, bestCtc: bestThresholds, fraction060: fraction060Thresholds }, familyG),
];

const leaveOnePositiveOut = longPositives.map((heldOut) => {
  const trainingPositives = longPositives.filter((feature) => feature.id !== heldOut.id);
  const thresholds = calibrateStagedThresholds(trainingPositives, allNegatives);
  return { heldOut: heldOut.id, thresholds, ...evaluateStagedLongPathRule(heldOut, thresholds) };
});

const leaveOneRealNegativeOut = realNegatives.map((heldOut) => {
  const trainingNegatives = [...realNegatives.filter((feature) => feature.id !== heldOut.id), ...logicalNegatives];
  const thresholds = calibrateStagedThresholds(longPositives, trainingNegatives);
  return { heldOut: heldOut.id, thresholds, ...evaluateStagedLongPathRule(heldOut, thresholds) };
});

const distributionFields: Array<keyof NormalizedLongPathFeature> = [
  "globalViterbiMargin", "coverage", "coherentRatio", "agreementRatio", "longestUnsupportedRun",
  "fractionAtLeastNegative060", "fractionAtLeastNegative080", "fractionAtLeastNegative100",
  "medianCtc", "percentile75Ctc", "strongestThreeMeanCtc", "strongestHalfMeanCtc", "worstCtc",
  "anchorActivationFraction", "coherentCandidatesAfterAnchor", "postAnchorAdvanceCount", "postAnchorAdvanceRatio",
  "postAnchorMedianCtc", "postAnchorFractionAtLeastNegative060", "postAnchorFractionAtLeastNegative080", "postAnchorFractionAtLeastNegative100",
];

const classNames = ["known-positive", "short-positive", "real-negative", "logical-negative", "observational", "recognition-failure-known-ground-truth"] as const;
const classCounts = Object.fromEntries(classNames.map((classification) => [classification, features.filter((feature) => feature.classification === classification).length]));
const distributions = Object.fromEntries(classNames.map((classification) => {
  const matching = features.filter((feature) => feature.classification === classification);
  return [classification, Object.fromEntries(distributionFields.map((field) => [field, numericDistribution(matching, field)]))];
}));

const recommended = simpleEvaluation(RECOMMENDED_OFFLINE_THRESHOLDS);
const perturbations = {
  margin: [7, 8, 9, 10].map((minimumMargin) => simpleEvaluation({ ...RECOMMENDED_OFFLINE_THRESHOLDS, minimumMargin })),
  bestCtc: [-0.7, -0.6, -0.5, -0.4].map((minimumBestCtc) => simpleEvaluation({ ...RECOMMENDED_OFFLINE_THRESHOLDS, minimumBestCtc })),
  fraction060: [0.2, 0.25, 0.3, 0.4].map((minimumFractionAtLeastNegative060) => simpleEvaluation({ ...RECOMMENDED_OFFLINE_THRESHOLDS, minimumFractionAtLeastNegative060 })),
};

const byId = new Map(features.map((feature) => [feature.id, feature]));
const husary = byId.get("positive-husary-75-1-15")!;
const husaryEvaluation = evaluateStagedLongPathRule(husary);

console.log(JSON.stringify({
  corpus: { total: features.length, classCounts },
  featureTable: features,
  distributions,
  candidateFamilies: families,
  recommended: {
    name: "staged-margin-best-fraction",
    conditions: [
      "all retained non-CTC structural/safety gates pass",
      "generated windows >= 5",
      "global Viterbi margin >= 8",
      "best coherent-path CTC >= -0.60",
      "fraction of coherent candidates with CTC >= -0.60 is >= 0.25",
    ],
    ...recommended,
  },
  leaveOnePositiveOut,
  leaveOneRealNegativeOut,
  perturbations: Object.fromEntries(Object.entries(perturbations).map(([field, evaluations]) => [field, evaluations.map((evaluation) => ({ thresholds: evaluation.thresholds, falseNegatives: evaluation.falseNegatives, falsePositives: evaluation.falsePositives }))])),
  lengthSensitivity: {
    fiveWindows: recommended.results.filter((result) => byId.get(result.id)!.totalGeneratedWindows === 5).map((result) => ({ id: result.id, accepted: result.accepted })),
    sixToTenWindows: recommended.results.filter((result) => { const count = byId.get(result.id)!.totalGeneratedWindows; return count >= 6 && count <= 10; }).map((result) => ({ id: result.id, accepted: result.accepted })),
    overTenWindows: recommended.results.filter((result) => byId.get(result.id)!.totalGeneratedWindows > 10).map((result) => ({ id: result.id, accepted: result.accepted })),
  },
  husary: {
    groundTruth: "75:1-15",
    fastConformerRange: husary.fastConformerProposedRange,
    whisperRange: husary.finalProposedRange,
    evaluation: husaryEvaluation,
    rangePassedIfAccepted: husaryEvaluation.accepted ? husary.fastConformerProposedRange : null,
  },
  boundaryDistances: {
    nearestPositive: {
      margin: longPositives.reduce((nearest, feature) => feature.globalViterbiMargin! - 8 < nearest.distance ? { id: feature.id, distance: round(feature.globalViterbiMargin! - 8) } : nearest, { id: "", distance: Infinity }),
      bestCtc: longPositives.reduce((nearest, feature) => feature.bestCoherentCtc! + 0.6 < nearest.distance ? { id: feature.id, distance: round(feature.bestCoherentCtc! + 0.6) } : nearest, { id: "", distance: Infinity }),
      fraction060: longPositives.reduce((nearest, feature) => feature.fractionAtLeastNegative060! - 0.25 < nearest.distance ? { id: feature.id, distance: round(feature.fractionAtLeastNegative060! - 0.25) } : nearest, { id: "", distance: Infinity }),
    },
    nearestNegativeByAbsoluteDistance: {
      margin: allNegatives.filter((feature) => feature.globalViterbiMargin !== null).reduce((nearest, feature) => Math.abs(feature.globalViterbiMargin! - 8) < nearest.distance ? { id: feature.id, value: feature.globalViterbiMargin, distance: round(Math.abs(feature.globalViterbiMargin! - 8)) } : nearest, { id: "", value: null as number | null, distance: Infinity }),
      bestCtc: allNegatives.filter((feature) => feature.bestCoherentCtc !== null).reduce((nearest, feature) => Math.abs(feature.bestCoherentCtc! + 0.6) < nearest.distance ? { id: feature.id, value: feature.bestCoherentCtc, distance: round(Math.abs(feature.bestCoherentCtc! + 0.6)) } : nearest, { id: "", value: null as number | null, distance: Infinity }),
      fraction060: allNegatives.filter((feature) => feature.fractionAtLeastNegative060 !== null).reduce((nearest, feature) => Math.abs(feature.fractionAtLeastNegative060! - 0.25) < nearest.distance ? { id: feature.id, value: feature.fractionAtLeastNegative060, distance: round(Math.abs(feature.fractionAtLeastNegative060! - 0.25)) } : nearest, { id: "", value: null as number | null, distance: Infinity }),
    },
  },
}, null, 2));
