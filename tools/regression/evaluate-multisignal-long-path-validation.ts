#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { CtcCalibrationCapture } from "./ctc-calibration-capture.ts";
import { buildNormalizedLongPathCorpus, normalizeCapturedLongPathFeature } from "./multisignal-long-path.ts";
import {
  FROZEN_EXTERNAL_VALIDATION_THRESHOLDS,
  evaluateFrozenExternalValidationRule,
} from "./multisignal-long-path-validation.ts";

type ExternalValidationCapture = CtcCalibrationCapture & {
  corpusRole: "external-validation";
  provenanceClass: string;
  readerGroup: string;
  negativeType: string | null;
  architectureEvidence: {
    singleSource: true;
    canonicalPcmPreparations: 1;
    topLevelIdentifyCalls: 1;
  };
  forcedAlignment: {
    status: "complete" | "failed" | "not-run";
    resultingStartAyah: number | null;
    resultingEndAyah: number | null;
  };
};

async function capturesIn(directory: string) {
  return Promise.all((await readdir(directory))
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as CtcCalibrationCapture));
}

const designCaptures = await capturesIn(join(process.cwd(), "tools/regression/fixtures/ctc-calibration"));
const validationCaptures = await capturesIn(join(process.cwd(), "tools/regression/fixtures/multisignal-validation")) as ExternalValidationCapture[];
const designFeatures = buildNormalizedLongPathCorpus(designCaptures);
const validationFeatures = validationCaptures.map(normalizeCapturedLongPathFeature);

const designResults = designFeatures.map((feature) => ({
  id: feature.id,
  classification: feature.classification,
  ...evaluateFrozenExternalValidationRule(feature),
}));
const validationResults = validationFeatures.map((feature) => {
  const capture = validationCaptures.find((candidate) => candidate.id === feature.id)!;
  return {
    id: feature.id,
    expectedOutcome: capture.expected.outcome,
    expectedRange: capture.expected.surah === null ? null : {
      surah: capture.expected.surah,
      startAyah: capture.expected.startAyah,
      endAyah: capture.expected.endAyah,
    },
    corpusRole: capture.corpusRole,
    provenanceClass: capture.provenanceClass,
    readerGroup: capture.readerGroup,
    negativeType: capture.negativeType,
    architectureEvidence: capture.architectureEvidence,
    forcedAlignment: capture.forcedAlignment,
    feature,
    frozenRule: evaluateFrozenExternalValidationRule(feature),
  };
});

const positiveResults = validationResults.filter((result) => result.expectedOutcome === "positive");
const negativeResults = validationResults.filter((result) => result.expectedOutcome === "negative");
const falseNegatives = positiveResults.filter((result) => !result.frozenRule.accepted).map((result) => result.id);
const falsePositives = negativeResults.filter((result) => result.frozenRule.accepted).map((result) => result.id);
const designRegression = {
  knownLongPositivesPassing: designResults.filter((result) => result.classification === "known-positive" && result.accepted).length,
  knownLongPositiveCount: designResults.filter((result) => result.classification === "known-positive").length,
  realNegativesRejecting: designResults.filter((result) => result.classification === "real-negative" && !result.accepted).length,
  realNegativeCount: designResults.filter((result) => result.classification === "real-negative").length,
  logicalNegativesRejecting: designResults.filter((result) => result.classification === "logical-negative" && !result.accepted).length,
  logicalNegativeCount: designResults.filter((result) => result.classification === "logical-negative").length,
};
const originalCorpusPasses = designRegression.knownLongPositivesPassing === 5
  && designRegression.knownLongPositiveCount === 5
  && designRegression.realNegativesRejecting === 5
  && designRegression.realNegativeCount === 5
  && designRegression.logicalNegativesRejecting === 13
  && designRegression.logicalNegativeCount === 13;

console.log(JSON.stringify({
  frozenThresholds: FROZEN_EXTERNAL_VALIDATION_THRESHOLDS,
  designCorpus: { regression: designRegression, passes: originalCorpusPasses },
  externalValidationCorpus: {
    positives: positiveResults.length,
    negatives: negativeResults.length,
    independentPositiveReaderGroups: new Set(positiveResults.map((result) => result.readerGroup)).size,
    falseNegatives,
    falsePositives,
    results: validationResults,
  },
  conclusion: falseNegatives.length || falsePositives.length
    ? "EXTERNAL VALIDATION FAILED"
    : positiveResults.length < 3 || negativeResults.length < 3
      ? "INSUFFICIENT NEW DATA"
      : "EXTERNAL VALIDATION PASSED",
}, null, 2));
