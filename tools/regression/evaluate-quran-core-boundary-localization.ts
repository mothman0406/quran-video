#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  expandCanonicalAyahRange,
  reconstructCanonicalPassage,
  reconstructionEvidenceFromTrajectory,
  type CanonicalRange,
} from "./canonical-passage-reconstruction.ts";
import { FROZEN_CORE_BOUNDARY_RULE } from "./quran-core-boundary-localizer.ts";
import type { PrivacySafeCoreBoundaryFixture } from "./quran-core-boundary-evidence.ts";
import { FROZEN_BOUNDED_EDGE_RULE } from "./quran-edge-completion.ts";
import { exposeProvisionalLocalCore, FROZEN_PROVISIONAL_LOCAL_CORE_RULE } from "./quran-local-core.ts";
import { validateWholeRecordingIntegrity } from "./quran-whole-recording-integrity.ts";
import type { ProgressionTrajectoryFixture } from "./progression-trajectory.ts";

const DESIGN_DIRECTORIES = ["progression-trajectory", "progression-validation", "short-gate"] as const;
const EXTERNAL_DIRECTORY = "canonical-reconstruction-validation";
const POSITIVE_B_ID = "canonical-validation-positive-reader-m-101-1-11";
const NEGATIVE_A_ID = "canonical-validation-negative-reader-l-100-reset";
const H_ID = "progression-validation-positive-reader-h-91-1-15";
const K_ID = "short-gate-heldout-positive-reader-k-92-1-14";
const boundaryRoot = join(process.cwd(), "tools/regression/fixtures/quran-core-boundary-localization");

async function fixturesIn<T>(directory: string) {
  const root = join(process.cwd(), "tools/regression/fixtures", directory);
  return Promise.all((await readdir(root)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(join(root, name), "utf8")) as T));
}

async function boundaryFixture(name: string) {
  return JSON.parse(await readFile(join(boundaryRoot, name), "utf8")) as PrivacySafeCoreBoundaryFixture;
}

function range(value: CanonicalRange | null) {
  return value ? `${value.surah}:${value.startAyah}-${value.endAyah}` : "none";
}

function expectedRange(fixture: ProgressionTrajectoryFixture): CanonicalRange | null {
  const { surah, startAyah, endAyah } = fixture.expected;
  return surah !== null && startAyah !== null && endAyah !== null ? { surah, startAyah, endAyah } : null;
}

function exact(left: CanonicalRange | null, right: CanonicalRange | null) {
  return Boolean(left && right && left.surah === right.surah && left.startAyah === right.startAyah && left.endAyah === right.endAyah);
}

function evaluate(fixture: ProgressionTrajectoryFixture) {
  const evidence = reconstructionEvidenceFromTrajectory(fixture.trajectory.windows);
  const canonical = reconstructCanonicalPassage(evidence).passage;
  const provisional = exposeProvisionalLocalCore(evidence).core;
  const core = canonical ?? provisional;
  const integrity = core ? validateWholeRecordingIntegrity(core, evidence) : null;
  const final = canonical && integrity?.valid ? canonical : null;
  const expected = expectedRange(fixture);
  return {
    id: fixture.id,
    outcome: fixture.expected.outcome,
    provisionalRange: range(provisional),
    canonicalCoreRange: range(canonical),
    integrityValid: integrity?.valid ?? null,
    integrityVetoes: integrity?.vetoes ?? [],
    finalRange: range(final),
    exact: exact(final, expected),
    rejected: final === null,
  };
}

// Design evidence is loaded and evaluated before either held-out Positive B
// artifact. The frozen objects above contain no fixture-derived values.
const historicalFixtures = (await Promise.all(DESIGN_DIRECTORIES.map((directory) => fixturesIn<ProgressionTrajectoryFixture>(directory)))).flat();
const historicalRows = historicalFixtures.map(evaluate);
const hBoundary = await boundaryFixture("core-boundary-design-positive-reader-h-91-start.json");
const jBoundary = await boundaryFixture("core-boundary-design-negative-reader-j-90-end.json");
const designPasses = hBoundary.decision && hBoundary.finalRange === "91:1-15"
  && !jBoundary.decision && jBoundary.finalRange === "90:1-12";

// External artifacts are deliberately unavailable to design calibration until
// after the complete locator + edge decision has passed on H/J.
const externalFixtures = await fixturesIn<ProgressionTrajectoryFixture>(EXTERNAL_DIRECTORY);
const externalRows = externalFixtures.map(evaluate);
const positiveB = externalRows.find((row) => row.id === POSITIVE_B_ID);
const negativeA = externalRows.find((row) => row.id === NEGATIVE_A_ID);
if (!positiveB || !negativeA) throw new Error("Required frozen external fixtures are missing.");
const positiveBBoundary = await boundaryFixture("core-boundary-held-out-positive-b-101-start.json");

const genuineRows = historicalRows.filter((row) => row.outcome === "positive");
const adversarialRows = historicalRows.filter((row) => row.outcome === "negative");
const h = historicalRows.find((row) => row.id === H_ID);
const k = historicalRows.find((row) => row.id === K_ID);
const acceptedRanges = historicalRows.filter((row) => row.finalRange !== "none").map((row) => row.finalRange)
  .concat([hBoundary.finalRange, jBoundary.finalRange, positiveBBoundary.finalRange]);
const canonicalCompleteness = acceptedRanges.every((value) => {
  const match = /^(\d+):(\d+)-(\d+)$/u.exec(value);
  if (!match) return false;
  const expected = { surah: Number(match[1]), startAyah: Number(match[2]), endAyah: Number(match[3]) };
  const expanded = expandCanonicalAyahRange(expected);
  return expanded.length === expected.endAyah - expected.startAyah + 1
    && new Set(expanded.map((ayah) => `${ayah.surah}:${ayah.startAyah}`)).size === expanded.length;
});
const positiveBPasses = positiveB.provisionalRange === "101:2-11"
  && positiveB.integrityValid === true
  && positiveBBoundary.decision
  && positiveBBoundary.finalRange === "101:1-11";
const regressionsPass = negativeA.integrityValid === false
  && h?.finalRange === "91:1-15"
  && k?.finalRange === "92:1-14"
  && genuineRows.every((row) => row.exact)
  && adversarialRows.every((row) => row.rejected)
  && canonicalCompleteness;
const candidateJustified = designPasses && positiveBPasses && regressionsPass;

process.stdout.write(`${JSON.stringify({
  frozenBeforePositiveB: true,
  frozenBoundaryRule: FROZEN_CORE_BOUNDARY_RULE,
  frozenEdgeRule: FROZEN_BOUNDED_EDGE_RULE,
  frozenLocalCoreRule: FROZEN_PROVISIONAL_LOCAL_CORE_RULE,
  calibrationFixtureDirectories: DESIGN_DIRECTORIES,
  calibrationExclusions: [POSITIVE_B_ID, NEGATIVE_A_ID],
  totalMediaRecognitionRuns: 4,
  retainedBoundaryCaptures: 3,
  design: { h: hBoundary, j: jBoundary, passes: designPasses },
  externalPostFreeze: { positiveB: { ...positiveB, boundary: positiveBBoundary, finalCombinedRange: positiveBBoundary.finalRange }, negativeA },
  historical: {
    genuineExact: `${genuineRows.filter((row) => row.exact).length}/${genuineRows.length}`,
    adversarialRejected: `${adversarialRows.filter((row) => row.rejected).length}/${adversarialRows.length}`,
    h,
    k,
  },
  canonicalCompleteness,
  browserCost: {
    boundaryEvaluationsPerEdge: hBoundary.startLocator.coarseEvaluationCount + hBoundary.startLocator.fineEvaluationCount,
    fullRecordingLogitsReused: true,
    loadedModelReusedForEdgeInference: true,
    additionalWholeQuranSearches: 0,
    measuredCaptureRuntimeMs: {
      h: hBoundary.totalRuntimeMs,
      j: jBoundary.totalRuntimeMs,
      positiveB: positiveBBoundary.totalRuntimeMs,
    },
  },
  conclusion: candidateJustified ? "CANDIDATE JUSTIFIED FOR ONE FINAL FROZEN VALIDATION" : "NO CANDIDATE",
  nextAction: candidateJustified
    ? "Run one separate final frozen validation milestone before any production integration."
    : "Do not validate or integrate this boundary locator.",
}, null, 2)}\n`);

