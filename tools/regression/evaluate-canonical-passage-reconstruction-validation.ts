#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  expandCanonicalAyahRange,
  reconstructCanonicalPassage,
  reconstructionEvidenceFromTrajectory,
  type CanonicalPassageWindowEvidence,
  type CanonicalRange,
} from "./canonical-passage-reconstruction.ts";
import {
  CANONICAL_RECONSTRUCTION_HISTORICAL_FIXTURE_DIGEST,
  CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS,
  CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATED_AT,
  CANONICAL_RECONSTRUCTION_VALIDATION_PROVENANCE,
  CANONICAL_RECONSTRUCTION_VALIDATION_STARTING_REVISION,
  FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE,
} from "./canonical-passage-reconstruction-validation.ts";
import { computeLocalWinnerProgression } from "./short-gate-analysis.ts";
import type { ProgressionTrajectoryFixture } from "./progression-trajectory.ts";

type ValidationFixture = ProgressionTrajectoryFixture & {
  provenance: typeof CANONICAL_RECONSTRUCTION_VALIDATION_PROVENANCE;
  validationRole: "positive-a" | "positive-b" | "negative-a" | "negative-b";
  architectureEvidence: {
    canonicalPcmPreparations: number;
    topLevelFastConformerDecisions: number;
    whisperEntered: boolean;
  };
  forcedAlignment: {
    status: "complete" | "failed" | "not-run";
    resultingStartAyah: number | null;
    resultingEndAyah: number | null;
  };
};

const historicalDirectories = ["progression-trajectory", "progression-validation", "short-gate"];
const historicalFixturePaths = (await Promise.all(historicalDirectories.map(async (directory) =>
  (await readdir(join(process.cwd(), "tools/regression/fixtures", directory)))
    .filter((name) => name.endsWith(".json"))
    .map((name) => `tools/regression/fixtures/${directory}/${name}`),
))).flat().sort();

async function fixtureDigest(paths: readonly string[]) {
  const lines = await Promise.all(paths.map(async (path) => {
    const content = await readFile(join(process.cwd(), path));
    return `${createHash("sha256").update(content).digest("hex")}  ${path}\n`;
  }));
  return createHash("sha256").update(lines.join("")).digest("hex");
}

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
  return left !== null && right !== null && left.surah === right.surah
    && left.startAyah === right.startAyah && left.endAyah === right.endAyah;
}

function localImpliedRange(fixture: ProgressionTrajectoryFixture): CanonicalRange | null {
  const counts = new Map<number, { count: number; first: number }>();
  for (const window of fixture.trajectory.windows) {
    const surah = window.localWinner?.surah;
    if (surah === undefined) continue;
    const current = counts.get(surah);
    counts.set(surah, current ? { ...current, count: current.count + 1 } : { count: 1, first: window.index });
  }
  const surah = [...counts].sort((left, right) => right[1].count - left[1].count
    || left[1].first - right[1].first || left[0] - right[0])[0]?.[0];
  if (surah === undefined) return null;
  const candidates = fixture.trajectory.windows.flatMap((window) => window.localWinner?.surah === surah ? [window.localWinner] : []);
  return candidates.length ? {
    surah,
    startAyah: Math.min(...candidates.map((candidate) => candidate.startAyah)),
    endAyah: Math.max(...candidates.map((candidate) => candidate.endAyah)),
  } : null;
}

function longestRunFraction(windows: readonly CanonicalPassageWindowEvidence[], dominantSurah: number | null) {
  if (dominantSurah === null || !windows.length) return 0;
  let longest = 0;
  let current = 0;
  let frontier = Number.NEGATIVE_INFINITY;
  let stalled = 0;
  let previous: { start: number; end: number } | null = null;
  for (const window of [...windows].sort((left, right) => left.windowIndex - right.windowIndex)) {
    const candidate = window.localWinner;
    if (candidate?.surah !== dominantSurah || candidate.relativeStartWord === null || candidate.relativeEndWord === null) continue;
    const backward = previous !== null && (
      candidate.relativeStartWord < previous.start - FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE.backwardWordTolerance
      || candidate.relativeEndWord < previous.end - FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE.backwardWordTolerance
    );
    const skipped = previous === null ? 0 : Math.max(0, candidate.relativeStartWord - previous.end - 1);
    const nextStalled = candidate.relativeEndWord <= frontier ? stalled + 1 : 0;
    if (previous && (backward
      || skipped > FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE.maximumSkippedCanonicalWords
      || nextStalled > FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE.maximumNoProgressRun)) {
      longest = Math.max(longest, current);
      current = 0;
      frontier = Number.NEGATIVE_INFINITY;
      stalled = 0;
    }
    current += 1;
    stalled = candidate.relativeEndWord <= frontier ? stalled + 1 : 0;
    frontier = Math.max(frontier, candidate.relativeEndWord);
    previous = { start: candidate.relativeStartWord, end: candidate.relativeEndWord };
  }
  return Number((Math.max(longest, current) / windows.length).toFixed(6));
}

function evaluateFixture(fixture: ProgressionTrajectoryFixture) {
  const evidence = reconstructionEvidenceFromTrajectory(fixture.trajectory.windows);
  const decision = reconstructCanonicalPassage(evidence);
  const reconstructed = decision.passage ? {
    surah: decision.passage.surah,
    startAyah: decision.passage.startAyah,
    endAyah: decision.passage.endAyah,
  } : null;
  const expected = expectedRange(fixture);
  return { fixture, evidence, decision, reconstructed, expected };
}

const validationFixtures = await fixturesIn<ValidationFixture>("canonical-reconstruction-validation");
const validationRows = validationFixtures.map((fixture) => {
  const { evidence, decision, reconstructed, expected } = evaluateFixture(fixture);
  const localProgression = computeLocalWinnerProgression(fixture);
  const expanded = reconstructed ? expandCanonicalAyahRange(reconstructed) : [];
  const completeness = reconstructed !== null
    && expanded.length === reconstructed.endAyah - reconstructed.startAyah + 1
    && expanded.every((ayah, index) => ayah.surah === reconstructed.surah
      && ayah.startAyah === reconstructed.startAyah + index && ayah.endAyah === ayah.startAyah)
    && new Set(expanded.map((ayah) => `${ayah.surah}:${ayah.startAyah}`)).size === expanded.length;
  return {
    id: fixture.id,
    role: fixture.validationRole,
    provenance: fixture.provenance,
    expectedRange: range(expected),
    generatedWindows: fixture.totalGeneratedWindows,
    localWinners: fixture.trajectory.windows.map((window) => window.localWinner
      ? `${window.localWinner.surah}:${window.localWinner.startAyah}-${window.localWinner.endAyah}` : "none"),
    coherentPath: fixture.trajectory.windows.map((window) => window.coherent
      ? `${window.coherent.surah}:${window.coherent.startAyah}-${window.coherent.endAyah}` : "none"),
    localImpliedRange: range(localImpliedRange(fixture)),
    productionRange: range(fixture.fastConformerProposedRange),
    productionOutcome: fixture.fastConformerOutcome,
    finalRange: range(fixture.finalProposedRange),
    finalOutcome: fixture.finalOutcome,
    reconstructedRange: range(reconstructed),
    accepted: reconstructed !== null,
    exactPositive: fixture.expected.outcome === "positive" && exact(reconstructed, expected),
    adversarialRejected: fixture.expected.outcome === "negative" && reconstructed === null,
    rejectionReasons: decision.rejectionReasons,
    dominantSurahSupport: decision.dominantSurahFraction,
    continuousRunSupport: longestRunFraction(evidence, decision.dominantSurah),
    startSupport: decision.passage?.confidence.startSupport ?? null,
    endSupport: decision.passage?.confidence.endSupport ?? null,
    resetCount: localProgression.resetCount,
    revisitBehavior: {
      revisitWindowCount: localProgression.revisitWindowCount,
      revisitRatio: localProgression.revisitRatio,
      resetAfterProgressCount: localProgression.resetAfterProgressCount,
    },
    longestNoProgressRun: localProgression.longestNoProgressRun,
    canonicalCompleteness: fixture.expected.outcome === "positive" && reconstructed !== null ? completeness : null,
    architectureEvidence: fixture.architectureEvidence,
    forcedAlignment: fixture.forcedAlignment,
  };
});

const historicalFixtures = (await Promise.all(historicalDirectories.map((directory) =>
  fixturesIn<ProgressionTrajectoryFixture>(directory),
))).flat();
const historicalRows = historicalFixtures.map((fixture) => {
  const { reconstructed, expected } = evaluateFixture(fixture);
  return {
    id: fixture.id,
    outcome: fixture.expected.outcome,
    reconstructedRange: range(reconstructed),
    exact: exact(reconstructed, expected),
    rejected: reconstructed === null,
  };
});
const historicalGenuine = historicalRows.filter((row) => row.outcome === "positive");
const historicalAdversarial = historicalRows.filter((row) => row.outcome === "negative");
const h = historicalRows.find((row) => row.id === "progression-validation-positive-reader-h-91-1-15");
const k = historicalRows.find((row) => row.id === "short-gate-heldout-positive-reader-k-92-1-14");
const actualHistoricalDigest = await fixtureDigest(historicalFixturePaths);
const positives = validationRows.filter((row) => row.role.startsWith("positive"));
const negatives = validationRows.filter((row) => row.role.startsWith("negative"));
const criteria = {
  exactlyFourPredesignatedFixtures: validationRows.length === 4
    && new Set(validationRows.map((row) => row.id)).size === 4
    && CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS.every((designation) => validationRows.some((row) => row.id === designation.id)),
  provenanceSeparated: validationRows.every((row) => row.provenance === CANONICAL_RECONSTRUCTION_VALIDATION_PROVENANCE),
  bothPositivesExact: positives.length === 2 && positives.every((row) => row.exactPositive),
  bothAdversariesRejected: negatives.length === 2 && negatives.every((row) => row.adversarialRejected),
  canonicalCompleteness: positives.filter((row) => row.accepted).every((row) => row.canonicalCompleteness),
  historicalFixtureDigestUnchanged: actualHistoricalDigest === CANONICAL_RECONSTRUCTION_HISTORICAL_FIXTURE_DIGEST,
  historicalGenuineUnchanged: historicalGenuine.length === 20 && historicalGenuine.every((row) => row.exact),
  historicalAdversarialUnchanged: historicalAdversarial.length === 23 && historicalAdversarial.every((row) => row.rejected),
  hUnchanged: h?.reconstructedRange === "91:1-15",
  kUnchanged: k?.reconstructedRange === "92:1-14",
  onePreparationAndDecisionPerCapture: validationFixtures.every((fixture) => fixture.architectureEvidence.canonicalPcmPreparations === 1
    && fixture.architectureEvidence.topLevelFastConformerDecisions === 1),
};
const passed = Object.values(criteria).every(Boolean);

process.stdout.write(`${JSON.stringify({
  startingRevision: CANONICAL_RECONSTRUCTION_VALIDATION_STARTING_REVISION,
  designatedAt: CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATED_AT,
  frozenRule: FROZEN_CANONICAL_RECONSTRUCTION_VALIDATION_RULE,
  newMediaCaptures: 4,
  rows: validationRows,
  newFalsePositives: negatives.filter((row) => row.accepted).map((row) => row.id),
  newFalseNegatives: positives.filter((row) => !row.exactPositive).map((row) => row.id),
  historical: {
    fixtureDigestExpected: CANONICAL_RECONSTRUCTION_HISTORICAL_FIXTURE_DIGEST,
    fixtureDigestActual: actualHistoricalDigest,
    genuineExact: `${historicalGenuine.filter((row) => row.exact).length}/${historicalGenuine.length}`,
    adversarialRejected: `${historicalAdversarial.filter((row) => row.rejected).length}/${historicalAdversarial.length}`,
    h,
    k,
  },
  criteria,
  conclusion: passed ? "EXTERNAL VALIDATION PASSED" : "EXTERNAL VALIDATION FAILED",
  productionImplementationJustified: passed,
}, null, 2)}\n`);
