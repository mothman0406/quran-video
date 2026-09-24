#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  expandCanonicalAyahRange,
  reconstructCanonicalPassage,
  reconstructionEvidenceFromTrajectory,
  type CanonicalRange,
} from "./canonical-passage-reconstruction.ts";
import {
  COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATED_AT,
  COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS,
  COMPLETE_RANGE_FINAL_VALIDATION_STARTING_REVISION,
  FROZEN_COMPLETE_RANGE_CANDIDATE,
} from "./quran-complete-range-final-validation.ts";
import { exposeProvisionalLocalCore } from "./quran-local-core.ts";
import { validateWholeRecordingIntegrity } from "./quran-whole-recording-integrity.ts";
import type { ProgressionTrajectoryFixture } from "./progression-trajectory.ts";
import type { PrivacySafeCoreBoundaryFixture } from "./quran-core-boundary-evidence.ts";

type FinalFixture = {
  schemaVersion: 1;
  id: string;
  capturedAt: string;
  audioDurationMs: number;
  generatedWindows: number;
  localWinners: string[];
  coherentPath: string[];
  canonicalRange: string;
  canonicalRejectionReasons: string[];
  provisionalRange: string;
  provisionalRejectionReasons: string[];
  selectedCoreRange: string;
  coreSupportingWindows: number[];
  integrityValid: boolean | null;
  integrityVetoes: string[];
  integrityMetrics: Record<string, unknown> | null;
  identificationInferenceMs: number;
  boundaryLogicRan: boolean;
  startLocator?: { coarseEvaluationCount: number; fineEvaluationCount: number };
  endLocator?: { coarseEvaluationCount: number; fineEvaluationCount: number };
  startBoundary: BoundaryResult | null;
  endBoundary: BoundaryResult | null;
  finalRange: string;
  accepted: boolean;
  rejectionReason: string | null;
  canonicalAyahs: number[];
  forcedAlignment: { status: string; startAyah: number | null; endAyah: number | null; ayahTimingCount?: number };
  fastConformerPasses: number;
  boundarySearchEvaluations: number;
  fullRecordingInferenceMs: number;
  edgeInferenceMs: number;
  totalRuntimeMs: number;
  reuse: { pcmReused: boolean; modelSessionReused: boolean; fullRecordingLogitsReused: boolean };
};

type BoundaryResult = {
  candidateAyah: number;
  boundaryDurationMs: number;
  voicedDurationMs: number;
  candidateTokenCount: number;
  alignedTokenCount: number;
  targetCoverage: number;
  candidateLogLikelihoodPerFrame: number | null;
  noExtensionLogLikelihoodPerFrame: number | null;
  likelihoodDifference: number | null;
  alignmentComplete: boolean;
  decision: boolean;
  decisionReasons: string[];
};

const fixtureRoot = join(process.cwd(), "tools/regression/fixtures");
const newRoot = join(fixtureRoot, "quran-complete-range-final-validation");
const historicalDirectories = ["progression-trajectory", "progression-validation", "short-gate"] as const;
const externalDirectory = "canonical-reconstruction-validation";
const hId = "progression-validation-positive-reader-h-91-1-15";
const kId = "short-gate-heldout-positive-reader-k-92-1-14";
const positiveBId = "canonical-validation-positive-reader-m-101-1-11";
const negativeAId = "canonical-validation-negative-reader-l-100-reset";

async function fixturesIn<T>(directory: string) {
  const root = join(fixtureRoot, directory);
  return Promise.all((await readdir(root)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(join(root, name), "utf8")) as T));
}

function range(value: CanonicalRange | null) {
  return value ? `${value.surah}:${value.startAyah}-${value.endAyah}` : "none";
}

function expected(fixture: ProgressionTrajectoryFixture) {
  const { surah, startAyah, endAyah } = fixture.expected;
  return surah !== null && startAyah !== null && endAyah !== null ? { surah, startAyah, endAyah } : null;
}

function exact(left: CanonicalRange | null, right: CanonicalRange | null) {
  return Boolean(left && right && left.surah === right.surah && left.startAyah === right.startAyah && left.endAyah === right.endAyah);
}

function evaluateHistorical(fixture: ProgressionTrajectoryFixture) {
  const evidence = reconstructionEvidenceFromTrajectory(fixture.trajectory.windows);
  const canonical = reconstructCanonicalPassage(evidence).passage;
  const provisional = exposeProvisionalLocalCore(evidence).core;
  const core = canonical ?? provisional;
  const integrity = core ? validateWholeRecordingIntegrity(core, evidence) : null;
  const final = canonical && integrity?.valid ? canonical : null;
  return {
    id: fixture.id,
    outcome: fixture.expected.outcome,
    finalRange: range(final),
    exact: exact(final, expected(fixture)),
    rejected: final === null,
    integrityVetoes: integrity?.vetoes ?? [],
  };
}

const newFixtures = await fixturesIn<FinalFixture>("quran-complete-range-final-validation");
const designationsById = new Map(COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS.map((designation) => [designation.id, designation]));
const newRows = newFixtures.map((fixture) => {
  const designation = designationsById.get(fixture.id);
  if (!designation) throw new Error(`Undesignated final validation fixture: ${fixture.id}`);
  const positive = designation.expectedRange !== null;
  const expectedRange = designation.expectedRange ? range(designation.expectedRange) : "none";
  const exactPositive = positive && fixture.accepted && fixture.finalRange === expectedRange;
  const adversarialRejected = !positive && !fixture.accepted && fixture.finalRange === "none";
  const canonicalCompleteness = !fixture.accepted || (designation.expectedRange !== null
    && fixture.canonicalAyahs.length === designation.expectedRange.endAyah - designation.expectedRange.startAyah + 1
    && fixture.canonicalAyahs.every((ayah, index) => ayah === designation.expectedRange!.startAyah + index)
    && new Set(fixture.canonicalAyahs).size === fixture.canonicalAyahs.length);
  return { ...fixture, role: designation.role, expectedRange, exactPositive, adversarialRejected, canonicalCompleteness };
});

const historicalFixtures = (await Promise.all(historicalDirectories.map((directory) => fixturesIn<ProgressionTrajectoryFixture>(directory)))).flat();
const historicalRows = historicalFixtures.map(evaluateHistorical);
const historicalGenuine = historicalRows.filter((row) => row.outcome === "positive");
const historicalAdversarial = historicalRows.filter((row) => row.outcome === "negative");
const h = historicalRows.find((row) => row.id === hId);
const k = historicalRows.find((row) => row.id === kId);
const externalRows = (await fixturesIn<ProgressionTrajectoryFixture>(externalDirectory)).map(evaluateHistorical);
const positiveBBase = externalRows.find((row) => row.id === positiveBId);
const negativeA = externalRows.find((row) => row.id === negativeAId);
const positiveBBoundary = JSON.parse(await readFile(
  join(fixtureRoot, "quran-core-boundary-localization/core-boundary-held-out-positive-b-101-start.json"),
  "utf8",
)) as PrivacySafeCoreBoundaryFixture;
const positiveB = {
  base: positiveBBase,
  finalRange: positiveBBoundary.finalRange,
  exact: positiveBBoundary.decision && positiveBBoundary.finalRange === "101:1-11",
};

const positiveRows = newRows.filter((row) => row.expectedRange !== "none");
const negativeRows = newRows.filter((row) => row.expectedRange === "none");
const canonicalCompleteness = newRows.every((row) => row.canonicalCompleteness)
  && positiveRows.every((row) => {
    const designation = designationsById.get(row.id)!;
    const expanded = expandCanonicalAyahRange(designation.expectedRange!);
    return expanded.map((ayah) => ayah.startAyah).join(",") === row.canonicalAyahs.join(",");
  });
const designatedBeforeCaptures = newRows.every((row) => Date.parse(row.capturedAt) > Date.parse(COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATED_AT));
const criteria = {
  exactlyFourPredesignatedCases: COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS.length === 4
    && newRows.length === 4 && new Set(newRows.map((row) => row.id)).size === 4,
  freezePrecededAllCases: designatedBeforeCaptures,
  bothGenuineExact: positiveRows.length === 2 && positiveRows.every((row) => row.exactPositive),
  bothAdversariesRejected: negativeRows.length === 2 && negativeRows.every((row) => row.adversarialRejected),
  hExact: h?.finalRange === "91:1-15" && h.exact,
  kExact: k?.finalRange === "92:1-14" && k.exact,
  positiveBExact: positiveB.exact,
  negativeARejected: negativeA?.rejected === true && negativeA.integrityVetoes.includes("reset-or-revisit-run")
    && negativeA.integrityVetoes.includes("repeated-covered-quran-run"),
  historicalGenuineUnchanged: historicalGenuine.length === 20 && historicalGenuine.every((row) => row.exact),
  historicalAdversarialUnchanged: historicalAdversarial.length === 23 && historicalAdversarial.every((row) => row.rejected),
  canonicalCompleteness,
  frozenConstantsNeverChanged: Object.isFrozen(FROZEN_COMPLETE_RANGE_CANDIDATE)
    && Object.values(FROZEN_COMPLETE_RANGE_CANDIDATE).every(Object.isFrozen),
  maximumFourCapturesRespected: newRows.length === 4,
};
const passed = Object.values(criteria).every(Boolean);

process.stdout.write(`${JSON.stringify({
  startingRevision: COMPLETE_RANGE_FINAL_VALIDATION_STARTING_REVISION,
  designatedAt: COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATED_AT,
  frozenCandidate: FROZEN_COMPLETE_RANGE_CANDIDATE,
  designations: COMPLETE_RANGE_FINAL_VALIDATION_DESIGNATIONS,
  newMediaCaptures: 4,
  rows: newRows,
  aggregate: {
    genuineExact: `${positiveRows.filter((row) => row.exactPositive).length}/${positiveRows.length}`,
    adversarialRejected: `${negativeRows.filter((row) => row.adversarialRejected).length}/${negativeRows.length}`,
    falsePositives: negativeRows.filter((row) => row.accepted).map((row) => row.id),
    falseNegatives: positiveRows.filter((row) => !row.exactPositive).map((row) => row.id),
  },
  regressions: {
    h,
    k,
    positiveB,
    negativeA,
    historicalGenuine: `${historicalGenuine.filter((row) => row.exact).length}/${historicalGenuine.length}`,
    historicalAdversarial: `${historicalAdversarial.filter((row) => row.rejected).length}/${historicalAdversarial.length}`,
  },
  runtime: {
    totalFastConformerPasses: newRows.reduce((sum, row) => sum + row.fastConformerPasses, 0),
    boundarySearchEvaluations: newRows.reduce((sum, row) => sum + row.boundarySearchEvaluations, 0),
    incrementalBoundaryLocalizationMs: "not separately instrumented; included after the reused whole-recording logits pass",
    incrementalEdgeVerificationMs: newRows.reduce((sum, row) => sum + row.edgeInferenceMs, 0),
    fullRecordingInferenceMs: newRows.reduce((sum, row) => sum + row.fullRecordingInferenceMs, 0),
    totalRuntimeMs: newRows.reduce((sum, row) => sum + row.totalRuntimeMs, 0),
    pcmReusedEveryCase: newRows.every((row) => row.reuse.pcmReused),
    modelSessionReusedEveryCase: newRows.every((row) => row.reuse.modelSessionReused),
    fullRecordingLogitsReusedForAcceptedCases: positiveRows.every((row) => row.reuse.fullRecordingLogitsReused),
  },
  criteria,
  conclusion: passed ? "FINAL FROZEN VALIDATION PASSED" : "FINAL FROZEN VALIDATION FAILED",
  productionImplementationJustified: passed,
}, null, 2)}\n`);
