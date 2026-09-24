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
  completeBoundedEdges,
  FROZEN_BOUNDED_EDGE_RULE,
  type EdgeAcousticEvidence,
} from "./quran-edge-completion.ts";
import {
  FROZEN_WHOLE_RECORDING_INTEGRITY_RULE,
  validateWholeRecordingIntegrity,
} from "./quran-whole-recording-integrity.ts";
import type { ProgressionTrajectoryFixture } from "./progression-trajectory.ts";

type ValidationFixture = ProgressionTrajectoryFixture & {
  validationRole: "positive-a" | "positive-b" | "negative-a" | "negative-b";
  forcedAlignment: {
    status: "complete" | "failed" | "not-run";
    resultingStartAyah: number | null;
    resultingEndAyah: number | null;
  };
};

const DESIGN_DIRECTORIES = ["progression-trajectory", "progression-validation", "short-gate"] as const;
const INTERNAL_HOLDOUT_IDS = new Set([
  "progression-validation-positive-reader-h-91-1-15",
  "short-gate-heldout-positive-reader-k-92-1-14",
]);
const EXTERNAL_VALIDATION_DIRECTORY = "canonical-reconstruction-validation";
const POSITIVE_B_ID = "canonical-validation-positive-reader-m-101-1-11";
const NEGATIVE_A_ID = "canonical-validation-negative-reader-l-100-reset";

async function fixturesIn<T>(directory: string) {
  const root = join(process.cwd(), "tools/regression/fixtures", directory);
  return Promise.all((await readdir(root)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(join(root, name), "utf8")) as T));
}

function expectedRange(fixture: ProgressionTrajectoryFixture): CanonicalRange | null {
  const { surah, startAyah, endAyah } = fixture.expected;
  return surah !== null && startAyah !== null && endAyah !== null ? { surah, startAyah, endAyah } : null;
}

function range(value: CanonicalRange | null) {
  return value ? `${value.surah}:${value.startAyah}-${value.endAyah}` : "none";
}

function exact(left: CanonicalRange | null, right: CanonicalRange | null) {
  return Boolean(left && right && left.surah === right.surah
    && left.startAyah === right.startAyah && left.endAyah === right.endAyah);
}

function evaluateCoreAndIntegrity(fixture: ProgressionTrajectoryFixture) {
  const evidence = reconstructionEvidenceFromTrajectory(fixture.trajectory.windows);
  const coreDecision = reconstructCanonicalPassage(evidence);
  const core = coreDecision.passage;
  const integrity = core ? validateWholeRecordingIntegrity(core, evidence) : null;
  const accepted = Boolean(core && integrity?.valid);
  const final = accepted && core ? { surah: core.surah, startAyah: core.startAyah, endAyah: core.endAyah } : null;
  const expected = expectedRange(fixture);
  return {
    id: fixture.id,
    outcome: fixture.expected.outcome,
    coreRange: range(core),
    finalRange: range(final),
    accepted,
    exact: exact(final, expected),
    rejected: !accepted,
    coreRejectionReasons: coreDecision.rejectionReasons,
    integrityVetoes: integrity?.vetoes ?? [],
    integrityMetrics: integrity?.metrics ?? null,
  };
}

function winningEvidence(edge: "start" | "end", candidateAyah: number): EdgeAcousticEvidence {
  return {
    edge,
    candidateAyah,
    voicedDurationMs: 800,
    candidateTokenCount: 5,
    alignedTokenCount: 5,
    candidateLogLikelihoodPerFrame: -0.4,
    noExtensionLogLikelihoodPerFrame: -0.7,
    alignmentComplete: true,
    temporallyOrderedOutsideCore: true,
    overlapsCoreAudio: false,
    optionalBasmalahOnly: false,
  };
}

// These contract cases freeze semantics only; they are not substituted for
// missing empirical boundary logits in retained captures.
const edgeContractResults = {
  startPositive: completeBoundedEdges({
    core: { surah: 90, startAyah: 2, endAyah: 10 }, surahAyahCount: 20,
    startEvidence: winningEvidence("start", 1), endEvidence: null,
  }),
  endPositive: completeBoundedEdges({
    core: { surah: 90, startAyah: 2, endAyah: 10 }, surahAyahCount: 20,
    startEvidence: null, endEvidence: winningEvidence("end", 11),
  }),
  absentAdjacent: completeBoundedEdges({
    core: { surah: 92, startAyah: 1, endAyah: 14 }, surahAyahCount: 21,
    startEvidence: null, endEvidence: null,
  }),
};

const allHistorical = (await Promise.all(DESIGN_DIRECTORIES.map((directory) =>
  fixturesIn<ProgressionTrajectoryFixture>(directory),
))).flat();
const designFixtures = allHistorical.filter((fixture) => !INTERNAL_HOLDOUT_IDS.has(fixture.id));
const internalHoldouts = allHistorical.filter((fixture) => INTERNAL_HOLDOUT_IDS.has(fixture.id));
const designRows = designFixtures.map(evaluateCoreAndIntegrity);
const holdoutRows = internalHoldouts.map(evaluateCoreAndIntegrity);

// External fixtures are deliberately loaded only after the rule constants and
// design/internal-holdout results above have been fixed.
const externalFixtures = await fixturesIn<ValidationFixture>(EXTERNAL_VALIDATION_DIRECTORY);
const externalRows = externalFixtures.map(evaluateCoreAndIntegrity);
const positiveBFixture = externalFixtures.find((fixture) => fixture.id === POSITIVE_B_ID);
const positiveB = externalRows.find((row) => row.id === POSITIVE_B_ID);
const negativeA = externalRows.find((row) => row.id === NEGATIVE_A_ID);
if (!positiveBFixture || !positiveB || !negativeA) throw new Error("Required frozen external failures are missing.");

// Positive B has no reconstructed core and its retained capture has no
// candidate-vs-no-extension boundary likelihoods. Completion must abstain.
const positiveBEdgeResult = null;
const positiveBFinal = positiveB.accepted ? positiveB.finalRange : "none";
const canonicalCompleteness = [...designRows, ...holdoutRows, ...externalRows]
  .filter((row) => row.accepted && row.finalRange !== "none")
  .every((row) => {
    const fixture = [...allHistorical, ...externalFixtures].find((item) => item.id === row.id)!;
    const expected = expectedRange(fixture);
    if (!expected || row.finalRange !== range(expected)) return true;
    const expanded = expandCanonicalAyahRange(expected);
    return expanded.length === expected.endAyah - expected.startAyah + 1
      && new Set(expanded.map((ayah) => `${ayah.surah}:${ayah.startAyah}`)).size === expanded.length;
  });

const designPositives = designRows.filter((row) => row.outcome === "positive");
const designNegatives = designRows.filter((row) => row.outcome === "negative");
const historicalPositives = [...designRows, ...holdoutRows].filter((row) => row.outcome === "positive");
const historicalNegatives = [...designRows, ...holdoutRows].filter((row) => row.outcome === "negative");
const h = holdoutRows.find((row) => row.id === "progression-validation-positive-reader-h-91-1-15");
const k = holdoutRows.find((row) => row.id === "short-gate-heldout-positive-reader-k-92-1-14");
const candidateJustified = positiveBFinal === "101:1-11"
  && !negativeA.accepted
  && h?.finalRange === "91:1-15"
  && k?.finalRange === "92:1-14"
  && designPositives.every((row) => row.exact)
  && designNegatives.every((row) => row.rejected)
  && holdoutRows.every((row) => row.outcome === "positive" ? row.exact : row.rejected)
  && canonicalCompleteness;

process.stdout.write(`${JSON.stringify({
  frozenBeforeExternalEvaluation: true,
  frozenIntegrityRule: FROZEN_WHOLE_RECORDING_INTEGRITY_RULE,
  frozenEdgeRule: FROZEN_BOUNDED_EDGE_RULE,
  calibrationExclusions: [POSITIVE_B_ID, NEGATIVE_A_ID],
  newMediaCaptures: 0,
  design: {
    fixtureCount: designRows.length,
    genuineExact: `${designPositives.filter((row) => row.exact).length}/${designPositives.length}`,
    adversarialRejected: `${designNegatives.filter((row) => row.rejected).length}/${designNegatives.length}`,
    falsePositives: designNegatives.filter((row) => row.accepted).map((row) => row.id),
    falseNegatives: designPositives.filter((row) => !row.exact).map((row) => row.id),
    failureRows: designRows.filter((row) => (row.outcome === "positive" && !row.exact)
      || (row.outcome === "negative" && row.accepted)),
  },
  edgeContractResults,
  empiricalEdgeCalibrationAvailable: false,
  internalHoldout: holdoutRows,
  externalPostFreeze: {
    positiveB: {
      ...positiveB,
      retainedForcedAlignment: positiveBFixture.forcedAlignment,
      edgeResult: positiveBEdgeResult,
      acousticEvidenceForAyah1: "unavailable: retained capture has no candidate-vs-no-extension boundary likelihoods",
    },
    negativeA,
  },
  historical: {
    genuineExact: `${historicalPositives.filter((row) => row.exact).length}/${historicalPositives.length}`,
    adversarialRejected: `${historicalNegatives.filter((row) => row.rejected).length}/${historicalNegatives.length}`,
    h,
    k,
  },
  canonicalCompleteness,
  falsePositives: [...designNegatives, ...historicalNegatives.filter((row) => !designNegatives.includes(row))]
    .filter((row) => row.accepted).map((row) => row.id),
  falseNegatives: [...designPositives, ...holdoutRows.filter((row) => row.outcome === "positive")]
    .filter((row) => !row.exact).map((row) => row.id),
  conclusion: candidateJustified ? "CANDIDATE JUSTIFIED FOR ONE FROZEN EXTERNAL VALIDATION" : "NO CANDIDATE",
  productionImplementationJustified: false,
  remainingEvidenceGap: "Retain boundary-local logits/VAD intervals and direct candidate-vs-no-extension CTC scores for predesignated genuine and exact-stop captures.",
}, null, 2)}\n`);
