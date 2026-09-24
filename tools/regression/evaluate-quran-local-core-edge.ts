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
  BOUNDARY_CAPTURE_DESIGNATIONS,
  FROZEN_BOUNDARY_EVIDENCE_RULE,
  type PrivacySafeBoundaryFixture,
} from "./quran-boundary-evidence.ts";
import { FROZEN_BOUNDED_EDGE_RULE } from "./quran-edge-completion.ts";
import { exposeProvisionalLocalCore, FROZEN_PROVISIONAL_LOCAL_CORE_RULE } from "./quran-local-core.ts";
import { validateWholeRecordingIntegrity } from "./quran-whole-recording-integrity.ts";
import type { ProgressionTrajectoryFixture } from "./progression-trajectory.ts";

const DESIGN_DIRECTORIES = ["progression-trajectory", "progression-validation", "short-gate"] as const;
const EXTERNAL_DIRECTORY = "canonical-reconstruction-validation";
const BOUNDARY_DIRECTORY = "quran-local-core-edge";
const POSITIVE_B_ID = "canonical-validation-positive-reader-m-101-1-11";
const NEGATIVE_A_ID = "canonical-validation-negative-reader-l-100-reset";
const H_ID = "progression-validation-positive-reader-h-91-1-15";
const K_ID = "short-gate-heldout-positive-reader-k-92-1-14";

async function fixturesIn<T>(directory: string) {
  const root = join(process.cwd(), "tools/regression/fixtures", directory);
  return Promise.all((await readdir(root)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(join(root, name), "utf8")) as T));
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
  const provisionalDecision = exposeProvisionalLocalCore(evidence);
  const provisional = provisionalDecision.core;
  const core = canonical ?? provisional;
  const integrity = core ? validateWholeRecordingIntegrity(core, evidence) : null;
  // A provisional local core is explicitly not final acceptance. Historical
  // acceptance remains owned by the canonical reconstructor in this milestone.
  const final = canonical && integrity?.valid ? canonical : null;
  const expected = expectedRange(fixture);
  return {
    id: fixture.id,
    outcome: fixture.expected.outcome,
    provisionalRange: range(provisional),
    provisionalSupportingWindows: provisional?.evidence.supportingWindows ?? [],
    provisionalRejectionReasons: provisionalDecision.rejectionReasons,
    canonicalCoreRange: range(canonical),
    integrityValid: integrity?.valid ?? null,
    integrityVetoes: integrity?.vetoes ?? [],
    finalRange: range(final),
    exact: exact(final, expected),
    rejected: final === null,
  };
}

const historicalFixtures = (await Promise.all(DESIGN_DIRECTORIES.map((directory) => fixturesIn<ProgressionTrajectoryFixture>(directory)))).flat();
const historicalRows = historicalFixtures.map(evaluate);
const genuineRows = historicalRows.filter((row) => row.outcome === "positive");
const adversarialRows = historicalRows.filter((row) => row.outcome === "negative");
const designLocalCoreRows = historicalRows.filter((row) => row.provisionalRange !== "none");

// Boundary design evidence is loaded and evaluated before the external
// reconstruction validation directory. Positive B cannot affect either rule.
const boundaryFixtures = await fixturesIn<PrivacySafeBoundaryFixture>(BOUNDARY_DIRECTORY);
const designPositive = boundaryFixtures.find((fixture) => fixture.role === "design-edge-positive");
const designNegative = boundaryFixtures.find((fixture) => fixture.role === "design-edge-negative");
if (!designPositive || !designNegative) throw new Error("Both predesignated boundary design fixtures are required.");
const designDistinguishesEdges = designPositive.decision === true && designNegative.decision === false;

const externalFixtures = await fixturesIn<ProgressionTrajectoryFixture>(EXTERNAL_DIRECTORY);
const externalRows = externalFixtures.map(evaluate);
const positiveB = externalRows.find((row) => row.id === POSITIVE_B_ID);
const negativeA = externalRows.find((row) => row.id === NEGATIVE_A_ID);
if (!positiveB || !negativeA) throw new Error("Required frozen external fixtures are missing.");

const acceptedHistoricalRanges = historicalRows.filter((row) => row.finalRange !== "none");
const canonicalCompleteness = acceptedHistoricalRanges.every((row) => {
  const fixture = historicalFixtures.find((item) => item.id === row.id)!;
  const expected = expectedRange(fixture);
  if (!expected || row.finalRange !== range(expected)) return true;
  const expanded = expandCanonicalAyahRange(expected);
  return expanded.length === expected.endAyah - expected.startAyah + 1
    && new Set(expanded.map((ayah) => `${ayah.surah}:${ayah.startAyah}`)).size === expanded.length;
});
const h = historicalRows.find((row) => row.id === H_ID);
const k = historicalRows.find((row) => row.id === K_ID);
const candidateJustified = designDistinguishesEdges
  && positiveB.provisionalRange === "101:2-11"
  && positiveB.integrityValid === true
  && false; // Held-out edge capture is prohibited after design calibration fails.

process.stdout.write(`${JSON.stringify({
  frozenBeforeExternalEvaluation: true,
  frozenLocalCoreRule: FROZEN_PROVISIONAL_LOCAL_CORE_RULE,
  frozenBoundaryEvidenceRule: FROZEN_BOUNDARY_EVIDENCE_RULE,
  frozenEdgeCompletionRule: FROZEN_BOUNDED_EDGE_RULE,
  calibrationFixtureDirectories: DESIGN_DIRECTORIES,
  calibrationExclusions: [POSITIVE_B_ID, NEGATIVE_A_ID],
  capturePlan: BOUNDARY_CAPTURE_DESIGNATIONS,
  totalMediaRecognitionRuns: 3,
  retainedBoundaryCaptures: 2,
  design: {
    historicalFixtureCount: historicalRows.length,
    provisionalCoreCount: designLocalCoreRows.length,
    genuineProvisionalCoreCount: designLocalCoreRows.filter((row) => row.outcome === "positive").length,
    adversarialProvisionalCoreCount: designLocalCoreRows.filter((row) => row.outcome === "negative").length,
    provisionalRows: designLocalCoreRows,
    edgePositive: designPositive,
    edgeNegative: designNegative,
    distinguishesEdges: designDistinguishesEdges,
  },
  externalPostFreeze: {
    positiveB: {
      ...positiveB,
      boundaryCapture: null,
      edgeDecision: "not-run-after-design-failure",
      finalCombinedRange: "none",
    },
    negativeA,
  },
  historical: {
    genuineExact: `${genuineRows.filter((row) => row.exact).length}/${genuineRows.length}`,
    adversarialRejected: `${adversarialRows.filter((row) => row.rejected).length}/${adversarialRows.length}`,
    h,
    k,
  },
  canonicalCompleteness,
  falsePositives: adversarialRows.filter((row) => !row.rejected).map((row) => row.id),
  falseNegatives: genuineRows.filter((row) => !row.exact).map((row) => row.id),
  conclusion: candidateJustified ? "CANDIDATE JUSTIFIED FOR ONE FROZEN EXTERNAL VALIDATION" : "NO CANDIDATE",
  remainingBlocker: "Core-only forced alignment consumes the adjacent start edge, so the true-positive boundary region is too short for complete target coverage; design positive and design negative both abstain.",
}, null, 2)}\n`);

